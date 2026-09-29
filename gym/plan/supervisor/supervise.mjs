#!/usr/bin/env node
// Supervisor: runs the campaign lead as a sequence of headless Claude sessions, restarts it after
// failures and unexpected stops, and terminates it on a guard kill. See ../10-supervisor.md.
//   node gym/plan/supervisor/supervise.mjs run     --campaign <id> [--budget-usd N] [--model M] [--effort E] [--soft N] [--hard N]
//        [--session-budget-usd N] [--idle-minutes N] [--max-sessions N] [--dry-run] [--no-plugin] [--prompt TEXT] [--repo DIR] [--reset-violations]
//   node gym/plan/supervisor/supervise.mjs archive --campaign <id>
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { superviseDecision } from './policy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLL_MS = 2_000;
const TERM_GRACE_MS = 10_000;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (!flag.startsWith('--')) throw new Error(`unexpected argument ${flag}`);
    const key = flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (key === 'dryRun' || key === 'noPlugin' || key === 'resetViolations') opts[key] = true;
    else opts[key] = rest[++i];
  }
  if (!opts.campaign || !/^[\w.-]+$/.test(opts.campaign)) throw new Error('--campaign <id> is required ([A-Za-z0-9_.-])');
  return opts;
}

function loadConfig(opts) {
  const defaults = JSON.parse(readFileSync(path.join(HERE, 'defaults.json'), 'utf8'));
  const repoRoot = path.resolve(opts.repo ?? path.join(HERE, '..', '..', '..'));
  const campaignDir = path.join(repoRoot, 'gym', 'runs', opts.campaign);
  const num = (v, d) => (v === undefined ? d : Number(v));
  return {
    ...defaults,
    campaign: opts.campaign,
    repoRoot,
    campaignDir,
    stateDir: path.join(campaignDir, 'supervisor'),
    model: opts.model ?? defaults.model,
    effort: opts.effort ?? defaults.effort,
    budgetUsd: opts.budgetUsd !== undefined ? Number(opts.budgetUsd) : budgetFromCampaign(campaignDir),
    sessionBudgetUsd: num(opts.sessionBudgetUsd, defaults.sessionBudgetUsd),
    softTokens: num(opts.soft, defaults.softTokens),
    hardTokens: num(opts.hard, defaults.hardTokens),
    idleMinutes: num(opts.idleMinutes, defaults.idleMinutes),
    maxSessions: num(opts.maxSessions, Infinity),
    sleepMinutes: opts.sleepSeconds !== undefined ? [Number(opts.sleepSeconds) / 60] : defaults.sleepMinutes,
    claudeBin: process.env.GYM_CLAUDE_BIN ?? 'claude',
    dryRun: opts.dryRun === true,
    resetViolations: opts.resetViolations === true,
    loadPluginFromRepo: opts.noPlugin === true ? false : defaults.loadPluginFromRepo,
    // Smoke runs only: replaces the fresh-session prompt; the incident note is still appended.
    promptOverride: opts.prompt ?? null,
  };
}

function budgetFromCampaign(campaignDir) {
  try {
    const m = /^budgetUsd:\s*([\d.]+)/m.exec(readFileSync(path.join(campaignDir, 'CAMPAIGN.md'), 'utf8'));
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

const readText = (file) => { try { return readFileSync(file, 'utf8'); } catch { return null; } };
const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
const git = (cfg, args) => spawnSync('git', ['-C', cfg.repoRoot, ...args], { encoding: 'utf8' });
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function log(cfg, entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  appendFileSync(path.join(cfg.stateDir, 'supervisor.log'), line + '\n');
  process.stdout.write(line + '\n');
}

function notify(cfg, message) {
  appendFileSync(path.join(cfg.campaignDir, 'OWNER-INBOX.md'), `- ${new Date().toISOString()} supervisor: ${message}\n`);
  if (process.platform === 'darwin' && !process.env.GYM_NO_DESKTOP_NOTIFY) {
    spawnSync('osascript', ['-e', `display notification ${JSON.stringify(message.slice(0, 200))} with title "ambicode campaign ${cfg.campaign}"`]);
  }
  // Owner-configured only: nothing leaves the machine unless GYM_NOTIFY_CMD is set.
  if (process.env.GYM_NOTIFY_CMD) spawnSync('/bin/sh', ['-c', process.env.GYM_NOTIFY_CMD], { env: { ...process.env, GYM_MESSAGE: message } });
}

/** Scratch state must never be committed: it holds session streams that can carry NDA text. */
function ensureIgnored(cfg) {
  const file = path.join(cfg.repoRoot, 'gym', 'runs', '.gitignore');
  mkdirSync(path.dirname(file), { recursive: true });
  const needed = ['**/scratch/', '**/archive/', '**/STOP', '**/PHASE', '**/supervisor/'];
  const have = (readText(file) ?? '').split('\n');
  const missing = needed.filter((line) => !have.includes(line));
  if (missing.length) appendFileSync(file, (have.join('\n').trim() ? '\n' : '') + missing.join('\n') + '\n');
}

function settingsFile(cfg) {
  const hook = [{ type: 'command', command: `node ${JSON.stringify(path.join(HERE, 'guard.mjs'))}`, timeout: 30 }];
  const settings = {
    hooks: {
      SessionStart: [{ hooks: hook }],
      PreToolUse: [{ matcher: '*', hooks: hook }],
      PostToolUse: [{ matcher: '*', hooks: hook }],
      Stop: [{ hooks: hook }],
      PreCompact: [{ hooks: hook }],
    },
    permissions: {
      deny: [
        'WebFetch', 'WebSearch',
        'Bash(sudo:*)', 'Bash(git push:*)', 'Bash(curl:*)', 'Bash(wget:*)', 'Bash(ssh:*)', 'Bash(scp:*)',
        'Read(~/.ssh/**)', 'Read(~/.aws/**)', 'Read(~/.gnupg/**)', 'Read(**/.env)', 'Read(**/.env.*)', 'Read(**/*.pem)', 'Read(**/*.key)',
        'Edit(~/.claude/**)', 'Write(~/.claude/**)', `Edit(${path.join(HERE, '**')})`, `Write(${path.join(HERE, '**')})`,
      ],
    },
  };
  const file = path.join(cfg.stateDir, 'lead-settings.json');
  writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  return file;
}

function freshPrompt(cfg, incident) {
  if (cfg.promptOverride) return [cfg.promptOverride, incident ? `The previous session was terminated by the guard (${incident.rule}).` : ''].filter(Boolean).join('\n');
  const rel = path.relative(cfg.repoRoot, cfg.campaignDir);
  const started = existsSync(path.join(cfg.campaignDir, 'CAMPAIGN.md'));
  return [
    `You are the lead agent of the ambicode training campaign ${cfg.campaign}, run headless by the supervisor (gym/plan/10-supervisor.md). Nobody will answer questions; decide by the plan.`,
    started
      ? `Campaign state exists: reconstruct it per gym/plan/06-data-and-state.md §6 before anything else, then continue the loop per gym/plan/02-loop-protocol.md §3.`
      : `The campaign has not started: follow gym/plan/README.md reading order, then run iteration 0 per gym/plan/02-loop-protocol.md §2. Owner decisions: budget ${cfg.budgetUsd ?? 'TBD'} USD, channel ${rel}/OWNER-INBOX.md, push no, install no. The volatile inputs are already archived by the supervisor in ${rel}/archive/ (verify MANIFEST.txt, do not copy from ~/.claude).`,
    `Keep ${rel}/PHASE current: one line "<it-NNN> <phase>" at every step change; phases boot select brief implement gate measure decide record idle handoff blocked.`,
    `Context limits: soft ${cfg.softTokens} (finish the iteration, then PHASE handoff and end your turn), hard ${cfg.hardTokens} (no new sweeps, recordings or helpers). End your turn only at a safe point: handoff, blocked, or idle at/over the soft limit.`,
    'A guard enforces gym/plan/08-safety-and-rollback.md §4. A denied action must not be retried in another form; repeated denials terminate the session.',
    incident ? `The previous session was terminated by the guard (${incident.rule}: ${incident.reason}). Read ${incident.file} first and do not repeat the action.` : '',
  ].filter(Boolean).join('\n');
}

function resumePrompt(cfg, reason) {
  const rel = path.relative(cfg.repoRoot, cfg.campaignDir);
  return `The supervisor resumed this session after: ${reason}. Run git status and read ${rel}/PHASE; confirm the output files of your last step exist; continue from there without repeating completed steps. Same limits and safe points as before.`;
}

function claudeArgs(cfg, launch) {
  const args = ['-p', launch.prompt];
  if (launch.resume) args.push('--resume', launch.sessionId);
  else args.push('--session-id', launch.sessionId);
  args.push(
    '--model', cfg.model,
    '--effort', cfg.effort,
    '--settings', settingsFile(cfg),
    '--setting-sources', 'project,local',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--permission-mode', 'dontAsk',
    '--allowedTools', ...cfg.allowedTools,
    '--max-budget-usd', String(cfg.sessionBudgetUsd),
    '--output-format', 'stream-json', '--verbose',
  );
  if (cfg.loadPluginFromRepo) args.push('--plugin-dir', cfg.repoRoot);
  return args;
}

function progressSignature(cfg) {
  const state = readText(path.join(cfg.campaignDir, 'STATE.md')) ?? '';
  const tags = git(cfg, ['tag', '-l', `gym/${cfg.campaign}/*`]).stdout ?? '';
  return createHash('sha256').update(state).update(tags).digest('hex');
}

function phaseOf(cfg) {
  return (readText(path.join(cfg.campaignDir, 'PHASE')) ?? '').trim().split('\n').pop()?.split(/\s+/).pop() || null;
}

function campaignStatus(cfg) {
  return /^status:\s*(\w+)/m.exec(readText(path.join(cfg.campaignDir, 'CAMPAIGN.md')) ?? '')?.[1] ?? null;
}

function metricsSpend(cfg) {
  let total = 0;
  if (!existsSync(cfg.campaignDir)) return 0;
  for (const entry of readdirSync(cfg.campaignDir)) {
    const m = readJson(path.join(cfg.campaignDir, entry, 'metrics.json'), null);
    if (m && typeof m.costUsd === 'number') total += m.costUsd;
  }
  return total;
}

function runSession(cfg, launch) {
  return new Promise((resolve) => {
    const n = launch.index;
    const out = path.join(cfg.stateDir, 'sessions', `${String(n).padStart(3, '0')}.jsonl`);
    mkdirSync(path.dirname(out), { recursive: true });
    const env = {
      ...process.env,
      GYM_REPO_ROOT: cfg.repoRoot,
      GYM_CAMPAIGN_DIR: cfg.campaignDir,
      GYM_SOFT_TOKENS: String(cfg.softTokens),
      GYM_HARD_TOKENS: String(cfg.hardTokens),
      GYM_MAX_DENIALS: String(cfg.maxDenialsPerSession),
      GYM_FORBIDDEN_ROOTS: cfg.forbiddenRoots.join(':'),
    };
    const child = spawn(cfg.claudeBin, claudeArgs(cfg, launch), { cwd: cfg.repoRoot, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stream = createWriteStream(out);
    let stderr = '';
    let lastActivity = Date.now();
    child.stdout.on('data', (chunk) => { stream.write(chunk); lastActivity = Date.now(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); lastActivity = Date.now(); });
    if (process.platform === 'darwin' && cfg.claudeBin === 'claude') spawn('caffeinate', ['-i', '-w', String(child.pid)], { stdio: 'ignore', detached: true }).unref();

    let reason = null;
    const terminate = (why) => {
      if (reason) return;
      reason = why;
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
      setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } }, TERM_GRACE_MS).unref();
    };
    const timer = setInterval(() => {
      if (existsSync(path.join(cfg.stateDir, 'KILL'))) terminate('guard-kill');
      else if (existsSync(path.join(cfg.campaignDir, 'STOP'))) terminate('stop-file');
      else {
        const transcript = readJson(path.join(cfg.stateDir, 'session.json'), {})?.transcriptPath;
        const touched = transcript && existsSync(transcript) ? statSync(transcript).mtimeMs : 0;
        if (Date.now() - Math.max(lastActivity, touched) > cfg.idleMinutes * 60_000) terminate('watchdog');
      }
    }, POLL_MS);

    child.on('close', (code, signal) => {
      clearInterval(timer);
      stream.end();
      writeFileSync(out.replace(/\.jsonl$/, '.err'), stderr);
      const events = (readText(out) ?? '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
      const result = [...events].reverse().find((e) => e.type === 'result') ?? null;
      const text = `${result?.result ?? ''}\n${stderr.slice(-4000)}`;
      resolve({
        exitCode: code,
        signal: signal ?? null,
        terminatedBy: reason,
        sessionId: init?.session_id ?? launch.sessionId,
        costUsd: typeof result?.total_cost_usd === 'number' ? result.total_cost_usd : 0,
        resultIsError: result === null ? reason === null : result.is_error === true,
        // Only a failed session is scanned: a healthy lead's report may mention limits in passing.
        rateLimited: (code !== 0 || result === null || result.is_error === true) && /usage limit|rate limit|rate_limit|\b429\b|overloaded/i.test(text),
      });
    });
  });
}

function rollback(cfg, why) {
  const branch = git(cfg, ['branch', '--show-current']).stdout.trim();
  if (branch !== `gym/${cfg.campaign}`) return { ok: false, detail: `not on gym/${cfg.campaign} (on "${branch}"); git left untouched` };
  // Campaign records under gym/runs stay in place: they are the evidence the incident audit needs.
  const outsideRuns = ['--', '.', ':(exclude)gym/runs'];
  const dirty = git(cfg, ['status', '--porcelain', ...outsideRuns]).stdout.trim();
  if (!dirty) return { ok: true, detail: 'no uncommitted plugin changes; nothing to roll back' };
  const name = `gym ${cfg.campaign} ${why} ${stamp()}`;
  const res = git(cfg, ['stash', 'push', '-u', '-m', name, ...outsideRuns]);
  return res.status === 0
    ? { ok: true, detail: `uncommitted work stashed as "${name}" (git stash list); commits kept` }
    : { ok: false, detail: `git stash failed: ${res.stderr.trim()}` };
}

function recordIncident(cfg, marker, rolledBack) {
  const dir = path.join(cfg.campaignDir, 'incidents');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${stamp()}-${marker.rule}.md`);
  writeFileSync(file, [
    `# Incident — guard kill: ${marker.rule}`,
    '',
    `- at: ${marker.at}`, `- session: ${marker.sessionId}`, `- agent: ${marker.agentId ?? 'main'}`, `- event: ${marker.event}`, `- tool: ${marker.tool}`,
    `- reason: ${marker.reason}`, `- input (truncated): \`${String(marker.input).replace(/`/g, "'")}\``,
    `- rollback: ${rolledBack.detail}`,
    '', '## Audit', '', 'TBD by the owner or the next lead session (08 §5).', '',
  ].join('\n'));
  renameSync(path.join(cfg.stateDir, 'KILL'), path.join(cfg.stateDir, `KILL-${stamp()}.handled.json`));
  return file;
}

function archive(cfg) {
  const dest = path.join(cfg.campaignDir, 'archive');
  mkdirSync(dest, { recursive: true });
  const copied = [];
  const missing = [];
  const copyOne = (src, name) => {
    if (!existsSync(src)) return missing.push(src);
    cpSync(src, path.join(dest, name), { recursive: true, dereference: true });
    copied.push(name);
  };
  for (const item of cfg.volatileInputs) {
    if (item.startsWith('@snapshots:')) {
      const reviews = path.join(cfg.repoRoot, item.slice('@snapshots:'.length));
      for (const review of existsSync(reviews) ? readdirSync(reviews) : []) {
        const snap = (readText(path.join(reviews, review, 'snapshot-path.txt')) ?? '').trim();
        if (snap) copyOne(snap, path.join('snapshots', review));
      }
      continue;
    }
    const src = item.startsWith('~/') ? path.join(os.homedir(), item.slice(2)) : path.join(cfg.repoRoot, item);
    copyOne(src, item.startsWith('~/') ? path.basename(src) : item.replace(/\//g, '__'));
  }
  const files = spawnSync('find', [dest, '-type', 'f', '!', '-name', 'MANIFEST.txt'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).sort();
  const manifest = files.map((f) => `${createHash('sha256').update(readFileSync(f)).digest('hex')}  ${path.relative(cfg.campaignDir, f)}`).join('\n') + '\n';
  writeFileSync(path.join(dest, 'MANIFEST.txt'), manifest);
  return { copied: copied.length, files: files.length, missing };
}

async function run(cfg) {
  mkdirSync(cfg.stateDir, { recursive: true });
  ensureIgnored(cfg);
  const stateFile = path.join(cfg.stateDir, 'state.json');
  const state = readJson(stateFile, { violations: 0, consecutiveFailures: 0, spentUsd: 0, sessions: 0, sessionId: null, sleepIndex: 0 });
  if (cfg.resetViolations) Object.assign(state, { violations: 0, consecutiveFailures: 0 });
  let next = { resume: false, prompt: freshPrompt(cfg, null) };
  if (state.sessionId && existsSync(path.join(cfg.stateDir, 'context.json'))) {
    next = { resume: true, prompt: resumePrompt(cfg, 'a supervisor restart') };
  }
  log(cfg, { event: 'start', campaign: cfg.campaign, model: cfg.model, soft: cfg.softTokens, hard: cfg.hardTokens, budgetUsd: cfg.budgetUsd, state });

  for (let launched = 0; launched < cfg.maxSessions; launched += 1) {
    if (existsSync(path.join(cfg.campaignDir, 'STOP'))) { log(cfg, { event: 'exit', reason: 'STOP file present before launch' }); return 0; }
    const sessionId = next.resume ? state.sessionId : randomUUID();
    if (!next.resume) { try { renameSync(path.join(cfg.stateDir, 'context.json'), path.join(cfg.stateDir, `context-${stamp()}.old.json`)); } catch { /* none */ } }
    const launch = { index: state.sessions + 1, resume: next.resume, sessionId, prompt: next.prompt };
    if (cfg.dryRun) { log(cfg, { event: 'dry-run', argv: [cfg.claudeBin, ...claudeArgs(cfg, launch)] }); return 0; }
    const before = progressSignature(cfg);
    log(cfg, { event: 'launch', index: launch.index, resume: launch.resume, sessionId });
    const outcome = await runSession(cfg, launch);
    state.sessions += 1;
    state.sessionId = outcome.sessionId;
    state.spentUsd += outcome.costUsd;
    const progressed = progressSignature(cfg) !== before;
    const killMarker = readJson(path.join(cfg.stateDir, 'KILL'), null);
    // A usage-limit window (5 h on a subscription) is waited out, not counted as a failed session.
    const waitedOut = outcome.rateLimited && !killMarker;
    state.consecutiveFailures = progressed ? 0 : waitedOut ? state.consecutiveFailures : state.consecutiveFailures + 1;
    const context = readJson(path.join(cfg.stateDir, 'context.json'), {});

    const decision = superviseDecision({
      stopFile: existsSync(path.join(cfg.campaignDir, 'STOP')),
      campaignStatus: campaignStatus(cfg),
      killMarker,
      violations: state.violations,
      maxViolations: cfg.maxViolations,
      budgetUsd: cfg.budgetUsd,
      spentUsd: state.spentUsd + metricsSpend(cfg),
      rateLimited: outcome.rateLimited && !killMarker,
      consecutiveFailures: state.consecutiveFailures,
      maxFailures: cfg.maxFailures,
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      watchdog: outcome.terminatedBy === 'watchdog',
      resultIsError: outcome.resultIsError,
      phase: phaseOf(cfg),
      tokens: context.tokens ?? null,
      soft: cfg.softTokens,
      hard: cfg.hardTokens,
      sessionId: state.sessionId,
    });
    if (decision.violations !== undefined) state.violations = decision.violations;
    log(cfg, { event: 'session-end', index: launch.index, outcome, progressed, phase: phaseOf(cfg), tokens: context.tokens ?? null, decision });

    let incident = null;
    // A session that tripped the guard, or that ended in a halt, is never resumed.
    if (killMarker || decision.action === 'halt') state.sessionId = null;
    if (killMarker) {
      const rolled = rollback(cfg, `guard-kill-${killMarker.rule}`);
      incident = { rule: killMarker.rule, reason: killMarker.reason, file: path.relative(cfg.repoRoot, recordIncident(cfg, killMarker, rolled)) };
      notify(cfg, `guard killed the lead (${killMarker.rule}: ${killMarker.reason}); ${rolled.detail}; incident ${incident.file}`);
      if (!rolled.ok && decision.action !== 'halt') { decision.action = 'halt'; decision.reason += `; rollback failed: ${rolled.detail}`; }
    }
    writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');

    if (decision.action === 'exit') { if (decision.notify) notify(cfg, decision.reason); log(cfg, { event: 'exit', reason: decision.reason }); return 0; }
    if (decision.action === 'halt') {
      writeFileSync(path.join(cfg.campaignDir, 'STOP'), `supervisor halt ${new Date().toISOString()}: ${decision.reason}\n`);
      notify(cfg, `HALTED: ${decision.reason}. Remove ${path.relative(cfg.repoRoot, cfg.campaignDir)}/STOP after review to resume.`);
      log(cfg, { event: 'halt', reason: decision.reason });
      return 2;
    }
    if (decision.action === 'sleep') {
      const minutes = cfg.sleepMinutes[Math.min(state.sleepIndex, cfg.sleepMinutes.length - 1)];
      state.sleepIndex += 1;
      writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
      log(cfg, { event: 'sleep', minutes, reason: decision.reason });
      await new Promise((r) => setTimeout(r, minutes * 60_000));
      next = { resume: Boolean(state.sessionId), prompt: resumePrompt(cfg, `a ${decision.reason} pause of ${minutes} min`) };
      continue;
    }
    state.sleepIndex = 0;
    next = decision.action === 'resume'
      ? { resume: true, prompt: resumePrompt(cfg, decision.reason) }
      : { resume: false, prompt: freshPrompt(cfg, incident) };
  }
  log(cfg, { event: 'exit', reason: `--max-sessions ${cfg.maxSessions} reached` });
  return 0;
}

const opts = parseArgs(process.argv.slice(2));
const cfg = loadConfig(opts);
if (opts.command === 'archive') {
  mkdirSync(cfg.stateDir, { recursive: true });
  ensureIgnored(cfg);
  const result = archive(cfg);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.missing.length ? 1 : 0;
} else if (opts.command === 'run') {
  process.exitCode = await run(cfg);
} else {
  process.stderr.write('usage: supervise.mjs run|archive --campaign <id> [options]\n');
  process.exitCode = 2;
}
