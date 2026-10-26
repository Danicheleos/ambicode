// Context size of one run, read from its trace: what the main session sent the model on each call.
// A call's context is input + cache-created + cache-read tokens. Subagent calls (parent_tool_use_id set) are left out:
// the trace carries only some of them (the task-fix probe of 2026-10-10 shows 1 of the reviewer's several calls).
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { contextTokens, events } from './trace.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Where the per-run workspace copies (`<case>-<n>.ambicode/`) live: outside the repo, at the same path relative to it.
 * Kept inside, they were 13,596 of 15,744 entries under evals/ and `claude plugin eval` refuses a directory over 20,000.
 */
export function archiveOf(dir, env = process.env, repo = REPO) {
  return path.join(path.resolve(env.AMBICODE_EVAL_ARCHIVE ?? path.join(repo, '..', 'eval-archive')), path.relative(repo, dir));
}

/** `<archive>/review-runs/<arm>/<stamp>`: one folder per review case run, holding what a later offline grading needs. */
export function reviewRunsOf(arm, stamp, env = process.env, repo = REPO) {
  return path.join(archiveOf(repo, env, repo), 'review-runs', arm, stamp);
}

/** The final message of a trace (its `result` event), or null. */
export function finalMessageOf(traceText) {
  let message = null;
  for (const event of events(traceText)) if (event.type === 'result' && typeof event.result === 'string') message = event.result;
  return message;
}

const REVIEW_FILES = ['report.txt', 'answer.json', 'brief.md', 'changed.diff'];

/**
 * Writes `<target>/{final-message.md, trace.jsonl, meta.json}` and, when `workspace` (a dir holding `repo/.ambicode` or `.ambicode`)
 * has a review, its report.txt, answer.json, brief.md and changed.diff. The final message of the plugin arm paraphrases the report
 * and the bare arm has no report, so both are kept next to the trace.
 */
export function recordReviewRun({ workspace, target, tracePath, meta }) {
  mkdirSync(target, { recursive: true });
  const traceText = readFileSync(tracePath, 'utf8');
  copyFileSync(tracePath, path.join(target, 'trace.jsonl'));
  const message = finalMessageOf(traceText);
  if (message !== null) writeFileSync(path.join(target, 'final-message.md'), message);
  writeFileSync(path.join(target, 'meta.json'), `${JSON.stringify({ ...meta, finalMessage: message !== null }, null, 2)}\n`);
  if (workspace === null || !existsSync(workspace)) return;
  const roots = [workspace, ...readdirSync(workspace, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => path.join(workspace, e.name))];
  for (const root of roots) {
    const reviews = path.join(root, '.ambicode', 'reviews');
    if (!existsSync(reviews)) continue;
    for (const slug of readdirSync(reviews, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const run = path.join(reviews, slug.name, '1');
      if (!existsSync(run)) continue;
      for (const file of REVIEW_FILES) if (existsSync(path.join(run, file))) copyFileSync(path.join(run, file), path.join(target, file));
      return;
    }
  }
}

/**
 * `{peak, final, calls, tools, session, api, costUsd}`: sizes in tokens, `tools` the distinct main-session tool_use blocks, `session`/`api` the seconds
 * the session and its model calls took, `costUsd` the trace's total (subagents included, no judge) (the harness's durationSeconds also counts case setup and graders); null when the trace has no main-session call.
 */
export function contextOf(traceText) {
  const calls = new Map();
  const tools = new Set();
  let result = null;
  for (const event of events(traceText)) {
    if (event.type === 'result') result = event;
    if (event.type !== 'assistant' || event.parent_tool_use_id || !event.message?.usage) continue;
    // One API call streams as several events with the same message id and the same usage.
    const usage = event.message.usage;
    for (const part of event.message.content ?? []) if (part.type === 'tool_use' && part.id) tools.add(part.id);
    calls.set(event.message.id, contextTokens(usage));
  }
  const sizes = [...calls.values()];
  const seconds = (ms) => (typeof ms === 'number' ? Math.round(ms / 100) / 10 : null);
  return sizes.length === 0 ? null : { peak: Math.max(...sizes), final: sizes.at(-1), calls: sizes.length, tools: tools.size, session: seconds(result?.duration_ms), api: seconds(result?.duration_api_ms), costUsd: result?.total_cost_usd ?? null };
}

/** The harness's sandbox of a trace (`<tmp>/e-XXXX/out/trace.jsonl`), or null for any other path: never delete beyond it. */
export function sandboxOf(tracePath) {
  const dir = path.dirname(path.dirname(tracePath));
  return /^e-[A-Za-z0-9]+$/.test(path.basename(dir)) && path.basename(path.dirname(tracePath)) === 'out' ? dir : null;
}

/**
 * The model steps whose message carries the map in the hook text, as `<skill>/<step>`: the route definitions say it (`payload` lists `map`,
 * and no `work` file takes the payload instead), so a route that delivers the map at another step (plan's `design`) needs no code here.
 */
export function mapStepsOf(routesDir = path.join(REPO, 'routes')) {
  const steps = new Set();
  for (const skill of existsSync(routesDir) ? readdirSync(routesDir) : []) {
    const file = path.join(routesDir, skill, `${skill}.yaml`);
    if (!existsSync(file)) continue;
    for (const step of parse(readFileSync(file, 'utf8'))?.steps ?? []) {
      if (step?.actor === 'model' && !step.work && Array.isArray(step.payload) && step.payload.includes('map')) steps.add(`${skill}/${step.id}`);
    }
  }
  return steps;
}

const STEP_HEADER = /\[ambicode\] (\S+) \u00b7 (?:task \S+ \u00b7 )?step ([\w-]+)/;

/**
 * What the model received at the route's map step (see `mapStepsOf`), from the session transcripts a run wrote
 * (`<sandbox>/config/projects/<project>/<session>.jsonl`): the stream trace carries no hook output, so ledger bytes alone cannot say
 * whether `## map` arrived (2026-10-24, 10 runs, 0 hits; 2026-10-25, all 30 plan runs read `absent` while the transcripts held the map).
 * `unknown` = no transcript, never a false; `spilled` = Claude Code saved the hook output to a file (a `tool-results/hook-` reference);
 * `absent` = transcript present, no map step text; else `delivered` with chars, map and candidates read from that text.
 */
export function deliveryOf(transcripts, mapSteps = mapStepsOf()) {
  if (!transcripts || transcripts.length === 0) return { status: 'unknown', chars: null, map: null, candidates: null, spill: null };
  let step = null;
  let spill = false;
  for (const text of transcripts) {
    for (const line of text.split('\n')) {
      if (line === '') continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const attachment = entry?.attachment;
      if (attachment?.type !== 'hook_additional_context') continue;
      const body = Array.isArray(attachment.content) ? attachment.content.join('\n') : String(attachment.content ?? '');
      if (/tool-results\/hook-|additionalContext\.txt/.test(body)) spill = true;
      const header = STEP_HEADER.exec(body);
      if (header !== null && mapSteps.has(`${header[1]}/${header[2]}`)) step = body;
    }
  }
  if (step === null) return { status: spill ? 'spilled' : 'absent', chars: null, map: false, candidates: false, spill };
  return { status: spill ? 'spilled' : 'delivered', chars: step.length, map: step.includes('## map'), candidates: step.includes('"candidates"'), spill };
}

/** One-line form of a delivery record for the run summary. */
export const deliveryLine = (delivery) => `delivery=${delivery.status}${delivery.status === 'delivered' || delivery.status === 'spilled' ? ` chars=${delivery.chars} map=${delivery.map} candidates=${delivery.candidates} spill=${delivery.spill}` : ''}`;

/** Copies `<cwd>/.ambicode` and `<cwd>/<dir>/.ambicode` (the case's `repo/`) to `target`; null when there is none. */
function keepAmbicode(cwd, target) {
  const found = [];
  if (existsSync(path.join(cwd, '.ambicode'))) found.push('.ambicode');
  for (const entry of existsSync(cwd) ? readdirSync(cwd, { withFileTypes: true }) : []) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && existsSync(path.join(cwd, entry.name, '.ambicode'))) found.push(path.join(entry.name, '.ambicode'));
  }
  // context/ is kept: the scout's output per run is the reference for later scout comparisons. The bench-input copy it once
  // excluded (~196 files per run, 17,642 entries against the harness eval-dir limit of 20,000) is checked by the count before each paid run.
  for (const relative of found) cpSync(path.join(cwd, relative), path.join(target, relative), { recursive: true });
  return found.length === 0 ? null : target;
}

/** Copies every `<projects>/<project>/<session>.jsonl` and `tool-results/hook-*` file to `target`; returns the transcripts' text. */
function keepTranscripts(projects, target) {
  const texts = [];
  if (!existsSync(projects)) return texts;
  for (const project of readdirSync(projects, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const root = path.join(projects, project.name);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        mkdirSync(target, { recursive: true });
        copyFileSync(path.join(root, entry.name), path.join(target, entry.name));
        texts.push(readFileSync(path.join(root, entry.name), 'utf8'));
      } else if (entry.isDirectory()) {
        const results = path.join(root, entry.name, 'tool-results');
        for (const file of existsSync(results) ? readdirSync(results) : []) {
          if (!file.startsWith('hook-')) continue;
          mkdirSync(path.join(target, 'tool-results'), { recursive: true });
          copyFileSync(path.join(results, file), path.join(target, 'tool-results', file));
        }
      }
    }
  }
  return texts;
}

function unseal(dir) {
  chmodSync(dir, 0o700);
  for (const entry of readdirSync(dir)) {
    const child = path.join(dir, entry);
    const stat = statSync(child, { throwIfNoEntry: false });
    if (stat?.isDirectory() && !stat.isSymbolicLink()) unseal(child);
  }
}

/**
 * Adds `context` to every run of a result kept with --keep-temp, copies each trace to `<tracesDir>/<case>-<n>.jsonl`
 * (one directory per run of the suite: an earlier run's traces are never touched; the `.ambicode` copies go to `archiveDir`),
 * and deletes the sandbox (it holds a whole fixture, node_modules included). A run whose trace is gone keeps no context.
 */
export function harvest(result, tracesDir, { remove = true, archiveDir = tracesDir, reviewRunsDir = null } = {}) {
  mkdirSync(tracesDir, { recursive: true });
  for (const evalCase of result.cases ?? []) {
    for (const runs of Object.values(evalCase.arms ?? {})) {
      (runs ?? []).forEach((run, index) => {
        if (!run.tracePath || !existsSync(run.tracePath)) return;
        run.context = contextOf(readFileSync(run.tracePath, 'utf8'));
        run.trace = path.join(tracesDir, `${evalCase.name}-${index + 1}.jsonl`);
        copyFileSync(run.tracePath, run.trace);
        const sandbox = sandboxOf(run.tracePath);
        if (sandbox === null) return;
        // The harness seals what the plugin wrote (mode 000) in a read-only directory.
        unseal(sandbox);
        if (reviewRunsDir !== null && evalCase.name.startsWith('review-')) {
          const record = path.join(reviewRunsDir, `${evalCase.name}-${index + 1}`);
          recordReviewRun({ workspace: path.join(sandbox, 'sealed', 'home', 'cwd'), target: record, tracePath: run.trace, meta: { case: evalCase.name, run: index + 1, arm: path.basename(path.dirname(reviewRunsDir)), stamp: path.basename(reviewRunsDir) } });
          run.record = record;
        }
        // The route's own record (ledger, delivered steps and payloads): the trace does not hold what a hook injected.
        const kept = keepAmbicode(path.join(sandbox, 'sealed', 'home', 'cwd'), path.join(archiveDir, path.basename(run.trace).replace(/\.jsonl$/, '.ambicode')));
        if (kept !== null) run.ambicode = kept;
        // Session transcripts (and Claude Code's hook spill files) live in the harness-set config dir, not in the sealed part.
        const transcriptDir = path.join(archiveDir, path.basename(run.trace).replace(/\.jsonl$/, '.transcript'));
        const texts = keepTranscripts(path.join(sandbox, 'config', 'projects'), transcriptDir);
        run.delivery = deliveryOf(texts);
        if (texts.length > 0) run.transcript = transcriptDir;
        if (remove) rmSync(sandbox, { recursive: true, force: true });
      });
    }
  }
  return result;
}
