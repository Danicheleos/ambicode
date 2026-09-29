#!/usr/bin/env node
// Campaign guard: one command hook for SessionStart, PreToolUse, PostToolUse, Stop and PreCompact,
// loaded into the lead's session by supervise.mjs through `claude --settings`. See ../10-supervisor.md.
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, fstatSync, closeSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULTS,
  LEVEL,
  classifyToolUse,
  contextAdvice,
  contextTokensFromTranscript,
  findSecret,
  isHeavyStart,
  parsePhase,
  stopDecision,
} from './policy.mjs';

const TAIL_BYTES = 512 * 1024;

export function configFromEnv(env = process.env) {
  const repoRoot = env.GYM_REPO_ROOT;
  const campaignDir = env.GYM_CAMPAIGN_DIR;
  if (!repoRoot || !campaignDir) return null;
  return {
    repoRoot,
    campaignDir,
    stateDir: path.join(campaignDir, 'supervisor'),
    soft: Number(env.GYM_SOFT_TOKENS ?? DEFAULTS.softTokens),
    hard: Number(env.GYM_HARD_TOKENS ?? DEFAULTS.hardTokens),
    maxDenials: Number(env.GYM_MAX_DENIALS ?? DEFAULTS.maxDenialsPerSession),
    policy: {
      repoRoot,
      home: env.HOME ?? os.homedir(),
      tmpRoots: ['/tmp', '/private/tmp', '/private/var/folders', os.tmpdir()],
      forbiddenRoots: (env.GYM_FORBIDDEN_ROOTS ?? '').split(':').filter(Boolean),
      allowPlanEdit: env.GYM_ALLOW_PLAN_EDIT === '1',
    },
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function tail(file, bytes) {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    readSync(fd, buffer, 0, buffer.length, start);
    return buffer.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

function phaseOf(cfg) {
  try {
    return parsePhase(readFileSync(path.join(cfg.campaignDir, 'PHASE'), 'utf8'));
  } catch {
    return null;
  }
}

function campaignStatus(cfg) {
  try {
    return /^status:\s*(\w+)/m.exec(readFileSync(path.join(cfg.campaignDir, 'CAMPAIGN.md'), 'utf8'))?.[1] ?? null;
  } catch {
    return null;
  }
}

function log(cfg, entry) {
  appendFileSync(path.join(cfg.stateDir, 'guard.log'), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

function excerpt(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return text.length > 240 ? text.slice(0, 240) + '…' : text;
}

function killSession(cfg, input, verdict, event) {
  const marker = {
    at: new Date().toISOString(),
    event,
    rule: verdict.rule,
    reason: verdict.reason,
    sessionId: input.session_id ?? null,
    agentId: input.agent_id ?? null,
    tool: input.tool_name ?? null,
    input: excerpt(input.tool_input),
  };
  writeFileSync(path.join(cfg.stateDir, 'KILL'), JSON.stringify(marker, null, 2) + '\n');
  log(cfg, { event, level: 'kill', ...marker });
  return `CAMPAIGN GUARD: session terminated — ${verdict.rule}: ${verdict.reason}. The supervisor records an incident and rolls back.`;
}

function countDenial(cfg, sessionId) {
  const file = path.join(cfg.stateDir, 'denials.json');
  const all = readJson(file, {});
  all[sessionId] = (all[sessionId] ?? 0) + 1;
  writeFileSync(file, JSON.stringify(all) + '\n');
  return all[sessionId];
}

export function handle(input, cfg) {
  const event = input.hook_event_name;
  mkdirSync(cfg.stateDir, { recursive: true });
  const contextFile = path.join(cfg.stateDir, 'context.json');
  const context = readJson(contextFile, { tokens: null, lastAdvised: null });

  if (event === 'SessionStart') {
    writeFileSync(
      path.join(cfg.stateDir, 'session.json'),
      JSON.stringify({ sessionId: input.session_id, transcriptPath: input.transcript_path, source: input.source ?? null, at: new Date().toISOString() }) + '\n',
    );
    const limits = `Campaign limits: soft ${cfg.soft} tokens (finish the iteration, then hand off), hard ${cfg.hard} (no new sweeps, recordings or helpers). ` +
      `Keep ${path.relative(cfg.repoRoot, path.join(cfg.campaignDir, 'PHASE'))} current (gym/plan/10-supervisor.md §3).`;
    if (input.source === 'compact') {
      appendFileSync(path.join(cfg.stateDir, 'compactions.jsonl'), JSON.stringify({ at: new Date().toISOString(), sessionId: input.session_id }) + '\n');
      log(cfg, { event, level: 'info', rule: 'compacted' });
      return {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: 'CAMPAIGN: this session was just compacted. The summary above is not evidence. ' +
            'Before any other tool call, reconstruct state from disk per gym/plan/06-data-and-state.md §6 and re-read gym/plan/01-goals-and-metrics.md; ' +
            'discard any number that appears only in the summary. ' + limits,
        },
      };
    }
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: limits } };
  }

  if (event === 'PreToolUse') {
    let verdict = classifyToolUse(input.tool_name, input.tool_input, cfg.policy);
    if (verdict.level === LEVEL.allow && context.tokens !== null && context.tokens >= cfg.hard && isHeavyStart(input.tool_name, input.tool_input)) {
      verdict = { level: LEVEL.deny, rule: 'context-hard-limit', reason: `context ${context.tokens} ≥ ${cfg.hard}: no new sweeps, recordings or helpers; record and hand off` };
    }
    if (verdict.level === LEVEL.allow) return {};
    if (verdict.level === LEVEL.deny) {
      const denials = countDenial(cfg, input.session_id ?? 'unknown');
      log(cfg, { event, level: 'deny', rule: verdict.rule, reason: verdict.reason, tool: input.tool_name, input: excerpt(input.tool_input), denials });
      if (denials >= cfg.maxDenials && verdict.rule !== 'context-hard-limit') {
        verdict = { level: LEVEL.kill, rule: 'repeated-denials', reason: `${denials} denied actions in one session (last: ${verdict.rule})` };
      } else {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `CAMPAIGN GUARD denied (${verdict.rule}): ${verdict.reason}. Denial ${denials} of ${cfg.maxDenials} this session; do not retry it in another form.`,
          },
        };
      }
    }
    const stopReason = killSession(cfg, input, verdict, event);
    return {
      continue: false,
      stopReason,
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: stopReason },
    };
  }

  if (event === 'PostToolUse') {
    const secret = findSecret(typeof input.tool_response === 'string' ? input.tool_response : JSON.stringify(input.tool_response ?? ''));
    if (secret) {
      const stopReason = killSession(cfg, input, { rule: 'secret-in-output', reason: `tool output matched ${secret.pattern}` }, event);
      return {
        continue: false,
        stopReason,
        hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: '[redacted by the campaign guard: the output contained a credential]' },
      };
    }
    if (input.transcript_path && existsSync(input.transcript_path)) {
      const tokens = contextTokensFromTranscript(tail(input.transcript_path, TAIL_BYTES));
      if (tokens !== null) {
        const advice = contextAdvice({ tokens, soft: cfg.soft, hard: cfg.hard, step: DEFAULTS.adviceStepTokens, lastAdvised: context.lastAdvised });
        writeFileSync(contextFile, JSON.stringify({ tokens, at: new Date().toISOString(), sessionId: input.session_id, lastAdvised: advice ? tokens : context.lastAdvised }) + '\n');
        if (advice) return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: advice } };
      }
    }
    return {};
  }

  if (event === 'Stop') {
    const reason = stopDecision({
      phase: phaseOf(cfg),
      tokens: context.tokens,
      soft: cfg.soft,
      stopHookActive: input.stop_hook_active === true,
      stopFile: existsSync(path.join(cfg.campaignDir, 'STOP')),
      campaignStatus: campaignStatus(cfg),
    });
    log(cfg, { event, level: reason ? 'block-stop' : 'allow-stop', phase: phaseOf(cfg), tokens: context.tokens });
    return reason ? { decision: 'block', reason } : {};
  }

  if (event === 'PreCompact') log(cfg, { event, level: 'info', tokens: context.tokens });
  return {};
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const cfg = configFromEnv();
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    process.stdout.write('{}');
    return;
  }
  if (cfg === null) {
    // Fail closed for tool calls: a guard that cannot find its campaign must not wave anything through.
    const out = input.hook_event_name === 'PreToolUse'
      ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'campaign guard is not configured (GYM_REPO_ROOT/GYM_CAMPAIGN_DIR unset)' } }
      : {};
    process.stdout.write(JSON.stringify(out));
    return;
  }
  let out;
  try {
    out = handle(input, cfg);
  } catch (error) {
    try {
      log(cfg, { event: input.hook_event_name, level: 'guard-error', error: String(error?.stack ?? error).slice(0, 500) });
    } catch {
      // Logging must not turn a guard error into a hook crash.
    }
    out = input.hook_event_name === 'PreToolUse'
      ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `campaign guard error; action denied (${String(error).slice(0, 120)})` } }
      : {};
  }
  process.stdout.write(JSON.stringify(out));
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  await main();
}
