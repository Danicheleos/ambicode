// Parse observed trace evidence and harvest it before the sandbox disappears.
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LEDGER_DIRECTORY } from './ledger-metrics.mjs';

// Printed by `ambicode review` when EVAL_AMBICODE_REVIEWER_REPLAY stood in for the reviewer: that
// reviewer's cost and time are then absent from the arm, which reads cheaper than the product is.
const REPLAY_MARK = 'REPLAYED from a recording';
const READ_COMMANDS = new Set(['cat', 'sed', 'head', 'tail', 'grep', 'rg', 'find', 'ls', 'awk', 'wc', 'nl', 'less', 'tree']);
const firstWords = (command) =>
  command
    .split(/&&|\|\||;|\||\n/)
    .map((segment) => segment.trim().split(/\s+/)[0])
    .filter(Boolean);

// The CLI's refusal (`error [code]:`, exit 2) and a review that ran but whose reviewer failed
// (`(error: code:` in the header). The second read as "none found" on 2026-09-30: no sandbox login.
const HELPER_FAILURE = [/^error \[([a-z0-9-]+)\]:/m, /\(error: ([a-z0-9-]+):/];

/** What one of the agent's tool calls was. The counts and the walkthrough both read it, so they cannot disagree. */
function classifyCall(block) {
  const call = { block, helper: null, truncated: false, bashRead: false, failure: null };
  if (block.name !== 'Bash' || typeof block.input?.command !== 'string') return call;
  const command = block.input.command;
  const helper = /ambicode\.mjs\\?"?\s+(\w+)/.exec(command)?.[1];
  if (helper === 'prepare' || helper === 'locate') {
    call.helper = 'prepare';
    // 28 of 31 Opus calls on 2026-09-29 were cut with `head -c` against the skill's "read it whole".
    call.truncated = /\|\s*(head|tail|cut)\b/.test(command.slice(command.indexOf(helper)));
  } else if (helper === 'review' || helper === 'bundle') call.helper = 'review';
  else if (!helper && firstWords(command).some((word) => READ_COMMANDS.has(word))) call.bashRead = true;
  return call;
}

/**
 * The agent's own tool calls, in order, never the whole trace: the skill body is in the trace too and
 * names `prepare` itself, so a text match counts a call nobody made.
 */
function parseTrace(jsonl) {
  const trace = { model: null, builtinPlugins: null, calls: [], replayedReviews: 0, peakContext: null, postToolUseResponses: 0, mcpHookResponses: 0 };
  const byId = new Map();
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'system' && event.subtype === 'init') {
      trace.model ??= event.model ?? null;
      if (Array.isArray(event.plugins)) trace.builtinPlugins ??= event.plugins.filter((p) => p?.path === 'builtin').map((p) => String(p.name)).sort();
    }
    if (event.type === 'system' && event.subtype === 'hook_response' && event.hook_event === 'PostToolUse') {
      trace.postToolUseResponses += 1;
      if (/mcp__/.test(String(event.hook_name ?? ''))) trace.mcpHookResponses += 1;
    }
    if (event.type === 'user')
      for (const block of Array.isArray(event.message?.content) ? event.message.content : []) {
        if (block.type !== 'tool_result') continue;
        const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
        if (text.includes(REPLAY_MARK)) trace.replayedReviews += 1;
        const call = byId.get(block.tool_use_id);
        if (call?.helper) call.failure = HELPER_FAILURE.map((pattern) => pattern.exec(text)?.[1]).find(Boolean) ?? null;
      }
    if (event.type !== 'assistant') continue;
    // The context a request carried: its uncached, cache-read and cache-written input together.
    const usage = event.message?.usage;
    if (usage && typeof usage.input_tokens === 'number') {
      const context = usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
      trace.peakContext = Math.max(trace.peakContext ?? 0, context);
    }
    for (const block of event.message?.content ?? [])
      if (block.type === 'tool_use') {
        const call = classifyCall(block);
        trace.calls.push(call);
        if (block.id) byId.set(block.id, call);
      }
  }
  return trace;
}

export function traceMetrics(jsonl) {
  return metricsOfTrace(parseTrace(jsonl));
}

export function metricsOfTrace(trace) {
  const { model, builtinPlugins = null, calls, replayedReviews, peakContext, postToolUseResponses, mcpHookResponses } = trace;
  const count = (pred) => calls.filter(pred).length;
  return {
    model,
    // Built-in plugins Claude Code loaded on its own; the repository does not control them, so arms can differ.
    builtinPlugins,
    toolCalls: calls.length,
    skills: calls.filter((c) => c.block.name === 'Skill' && typeof c.block.input?.skill === 'string').map((c) => c.block.input.skill),
    prepareRuns: count((c) => c.helper === 'prepare'),
    prepareTruncated: count((c) => c.truncated),
    reviewRuns: count((c) => c.helper === 'review'),
    replayedReviews,
    replayMisses: count((c) => c.failure === 'replay-miss'),
    bashReads: count((c) => c.bashRead),
    readCalls: count((c) => c.block.name === 'Read'),
    grepCalls: count((c) => c.block.name === 'Grep' || c.block.name === 'Glob'),
    // Null when no request in the trace reported usage: unknown, not a zero context.
    peakContext,
    // PostToolUse hook_response events seen for mcp__ tools: an observation, not a process count. Null when the
    // trace shows no PostToolUse response at all (a SessionStart one says nothing about that channel).
    mcpHookResponses: postToolUseResponses ? mcpHookResponses : null,
    // Process spawns are not in the trace, and no model-free channel shows them (MCP PostToolUse probe pending).
    mcpHookSpawns: null,
  };
}

/** `tracesDir` may be a list: a cached baseline's traces sit beside its own result. */
function traceFile(run, tracesDir) {
  const id = /[/\\](e-[^/\\]+)[/\\]/.exec(run.tracePath ?? '')?.[1];
  if (!tracesDir || !id) return null;
  for (const dir of [].concat(tracesDir)) {
    const file = path.join(dir, `${id}.jsonl`);
    if (existsSync(file)) return file;
  }
  return null;
}

export function readTrace(run, tracesDir) {
  const file = traceFile(run, tracesDir);
  return file ? parseTrace(readFileSync(file, 'utf8')) : null;
}

/**
 * Observed at `/private/tmp/e-*` on macOS (reached as `/tmp`); `os.tmpdir()` is scanned too. A wrong
 * root shows up in `harvestedOfResult` as named-but-not-harvested rather than a quiet 0.
 */
const SANDBOX_ROOTS = [...new Set(['/tmp', tmpdir()])];

// The agent's working directory inside a sandbox (`cwd` of every 2026-10-04 trace's init event); the scaffold
// puts the repository at `repo/` under it, so task ledgers sit one level down. Deeper is not searched: the
// snapshot is thousands of files.
const SANDBOX_CWD = ['home', 'cwd'];

function sandboxLedgers(sandbox) {
  const cwd = path.join(sandbox, ...SANDBOX_CWD);
  const found = [];
  const bases = [cwd];
  try {
    for (const entry of readdirSync(cwd, { withFileTypes: true })) if (entry.isDirectory() && !entry.name.startsWith('.')) bases.push(path.join(cwd, entry.name));
  } catch (error) {
    if (error.code === 'ENOENT') return found;
    throw error;
  }
  for (const base of bases) {
    let slugs;
    try {
      slugs = readdirSync(path.join(base, '.ambicode', 'task'));
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
      throw error;
    }
    for (const slug of slugs) found.push(path.relative(sandbox, path.join(base, '.ambicode', 'task', slug, 'ledger.jsonl')));
  }
  return found;
}

export const SESSION_DIRECTORY = 'sessions';

/**
 * The Claude Code session transcript under the sandbox's config directory. It records what the stream trace does
 * not: the expanded slash command, each hook's additionalContext and the skill listing of the first request.
 */
function sandboxSessions(sandbox) {
  const projects = path.join(sandbox, 'config', 'projects');
  const found = [];
  let dirs;
  try {
    dirs = readdirSync(projects, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    let files;
    try {
      files = readdirSync(path.join(projects, dir.name));
    } catch {
      continue;
    }
    for (const file of files) if (file.endsWith('.jsonl')) found.push(path.join('config', 'projects', dir.name, file));
  }
  return found;
}

/**
 * The harness deletes each sandbox when its eval finishes, so the only window is while it runs. Copies go
 * to a temporary name then rename; later passes overwrite, since the trace grows and the last copy is whole.
 * Task ledgers are copied the same way to `ledgers/<e-id>/<their path in the sandbox>`, so two runs' slugs never meet.
 */
export function harvestTraces(outDir, { sandboxRoots = SANDBOX_ROOTS } = {}) {
  mkdirSync(outDir, { recursive: true });
  let copied = 0;
  // ENOENT is the benign race. Anything else (EACCES, ENOSPC) would silently degrade every pass,
  // so the first one is thrown after the pass, best effort for the remaining copies.
  let failure = null;
  for (const root of sandboxRoots) {
    let names;
    try {
      names = readdirSync(root);
    } catch (error) {
      if (error.code !== 'ENOENT') failure ??= error;
      continue;
    }
    for (const name of names) {
      if (!name.startsWith('e-')) continue;
      const trace = path.join(root, name, 'out', 'trace.jsonl');
      const to = path.join(outDir, `${name}.jsonl`);
      try {
        copyFileSync(trace, `${to}.tmp`);
        renameSync(`${to}.tmp`, to);
        copied += 1;
      } catch (error) {
        if (error.code !== 'ENOENT') failure ??= error;
      }
      try {
        for (const relative of sandboxLedgers(path.join(root, name))) {
          const target = path.join(outDir, LEDGER_DIRECTORY, name, relative);
          try {
            mkdirSync(path.dirname(target), { recursive: true });
            copyFileSync(path.join(root, name, relative), `${target}.tmp`);
            renameSync(`${target}.tmp`, target);
          } catch (error) {
            if (error.code !== 'ENOENT') failure ??= error;
          }
        }
      } catch (error) {
        failure ??= error;
      }
      for (const relative of sandboxSessions(path.join(root, name))) {
        const target = path.join(outDir, SESSION_DIRECTORY, name, path.basename(relative));
        try {
          mkdirSync(path.dirname(target), { recursive: true });
          copyFileSync(path.join(root, name, relative), `${target}.tmp`);
          renameSync(`${target}.tmp`, target);
        } catch (error) {
          if (error.code !== 'ENOENT') failure ??= error;
        }
      }
    }
  }
  if (failure) throw failure;
  return copied;
}

/** The sandbox ids (`e-…`) a result's runs name. */
export function sandboxIdsOfResult(jsonPath) {
  const results = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const named = new Set();
  for (const evalCase of results.cases ?? [])
    for (const runs of Object.values(evalCase.arms ?? {}))
      for (const run of runs ?? []) {
        const id = /[/\\](e-[^/\\]+)[/\\]/.exec(run.tracePath ?? '');
        if (id) named.add(id[1]);
      }
  return named;
}

/**
 * `--keep-temp` leaves each sandbox behind, partly unreadable (`sealed/` has mode 000), so the last harvest pass
 * can copy what the run wrote at its end. Only the named ids are removed; other `e-*` directories are not ours.
 */
export function removeSandboxes(ids, { sandboxRoots = SANDBOX_ROOTS } = {}) {
  let removed = 0;
  const open = (target) => {
    const stat = lstatSync(target);
    if (!stat.isDirectory()) return;
    chmodSync(target, 0o700);
    for (const name of readdirSync(target)) open(path.join(target, name));
  };
  for (const root of sandboxRoots)
    for (const id of ids) {
      if (!/^e-[\w-]+$/.test(id)) continue;
      const target = path.join(root, id);
      if (!existsSync(target)) continue;
      open(target);
      rmSync(target, { recursive: true, force: true });
      removed += 1;
    }
  return removed;
}

export function harvestedOfResult(jsonPath, tracesDir) {
  const named = sandboxIdsOfResult(jsonPath);
  const missing = [...named].filter((id) => !existsSync(path.join(tracesDir, `${id}.jsonl`))).sort();
  return { named: named.size, harvested: named.size - missing.length, missing };
}

