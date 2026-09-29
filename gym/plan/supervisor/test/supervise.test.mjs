import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUPERVISE = path.join(HERE, '..', 'supervise.mjs');
const STUB = path.join(HERE, 'stub-claude.mjs');

function scenario(steps, extraArgs = [], setup = () => {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gym-sup-'));
  const repo = path.join(root, 'repo');
  const g = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  spawnSync('git', ['init', '-q', '-b', 'tuning', repo]);
  writeFileSync(path.join(repo, 'README.md'), 'x\n');
  g('add', '.');
  g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init');
  g('switch', '-qc', 'gym/c1');
  setup(repo);
  const plan = path.join(root, 'plan.json');
  writeFileSync(plan, JSON.stringify(steps));
  const r = spawnSync(process.execPath, [SUPERVISE, 'run', '--campaign', 'c1', '--repo', repo, '--budget-usd', '100', '--sleep-seconds', '0', '--max-sessions', '8', ...extraArgs], {
    env: { ...process.env, GYM_CLAUDE_BIN: STUB, GYM_STUB_PLAN: plan, GYM_NO_DESKTOP_NOTIFY: '1', GYM_NOTIFY_CMD: '' },
    encoding: 'utf8',
  });
  const campaign = path.join(repo, 'gym', 'runs', 'c1');
  const argv = existsSync(plan + '.argv') ? readFileSync(plan + '.argv', 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const decisions = readFileSync(path.join(campaign, 'supervisor', 'supervisor.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.event === 'session-end').map((e) => e.decision.action);
  const cleanup = () => rmSync(root, { recursive: true, force: true });
  return { r, repo, campaign, argv, decisions, g, cleanup };
}
const resumed = (argv) => argv.includes('--resume');

describe('supervisor loop against a stub claude', () => {
  it('rolls over to a fresh session at a planned handoff and exits when the campaign is done', () => {
    const s = scenario([{ phase: 'handoff', tokens: 320_000, progress: true }, { phase: 'idle', progress: true, status: 'done' }]);
    try {
      assert.equal(s.r.status, 0, s.r.stdout + s.r.stderr);
      assert.deepEqual(s.decisions, ['fresh', 'exit']);
      assert.deepEqual(s.argv.map(resumed), [false, false]);
      assert.notEqual(s.argv[0][s.argv[0].indexOf('--session-id') + 1], s.argv[1][s.argv[1].indexOf('--session-id') + 1]);
    } finally { s.cleanup(); }
  });

  it('resumes the same session after an unexpected stop mid-iteration', () => {
    const s = scenario([{ phase: 'measure', tokens: 150_000 }, { phase: 'idle', progress: true, status: 'done' }]);
    try {
      assert.deepEqual(s.decisions, ['resume', 'exit']);
      assert.equal(resumed(s.argv[1]), true);
      assert.equal(s.argv[1][s.argv[1].indexOf('--resume') + 1], s.argv[0][s.argv[0].indexOf('--session-id') + 1]);
      assert.match(s.argv[1][1], /resumed this session after: unexpected stop in phase measure/);
    } finally { s.cleanup(); }
  });

  it('resumes after the first crash, starts fresh after the second, and halts after three without progress', () => {
    const crash = { exitCode: 1, noResult: true, phase: 'implement', tokens: 100_000 };
    const s = scenario([crash, crash, crash, { status: 'done' }]);
    try {
      assert.equal(s.r.status, 2);
      assert.deepEqual(s.decisions, ['resume', 'fresh', 'halt']);
      assert.deepEqual(s.argv.map(resumed), [false, true, false]);
      assert.match(readFileSync(path.join(s.campaign, 'STOP'), 'utf8'), /3 consecutive sessions/);
      assert.match(readFileSync(path.join(s.campaign, 'OWNER-INBOX.md'), 'utf8'), /HALTED/);
    } finally { s.cleanup(); }
  });

  it('on a guard kill: stashes plugin changes, keeps campaign records, writes an incident, restarts fresh with it; halts on the second kill', () => {
    const s = scenario([{ kill: 'secret-path', dirty: true, phase: 'implement', progress: true }, { kill: 'agent-escape', phase: 'implement' }]);
    try {
      assert.equal(s.r.status, 2);
      assert.deepEqual(s.decisions, ['fresh', 'halt']);
      assert.match(s.g('stash', 'list').stdout, /guard-kill-secret-path/);
      assert.equal(existsSync(path.join(s.repo, 'src-change.txt')), false, 'the uncommitted plugin edit was stashed');
      assert.ok(existsSync(path.join(s.campaign, 'STATE.md')), 'campaign records stay in place');
      const incidents = readdirSync(path.join(s.campaign, 'incidents'));
      assert.equal(incidents.length, 2);
      assert.match(s.argv[1][1], /terminated by the guard \(secret-path/);
      assert.equal(resumed(s.argv[1]), false, 'a session that tripped the guard is never resumed');
      assert.ok(existsSync(path.join(s.campaign, 'STOP')));
    } finally { s.cleanup(); }
  });

  it('a guard-kill rollback leaves the owner\'s uncommitted gym/plan edits in place', () => {
    // R1 guard kill #1 stashed the owner's uncommitted guard fix along with the lead's work.
    const s = scenario([{ kill: 'secret-path', dirty: true, phase: 'implement' }, { status: 'done' }], [], (repo) => {
      mkdirSync(path.join(repo, 'gym', 'plan', 'supervisor'), { recursive: true });
      writeFileSync(path.join(repo, 'gym', 'plan', 'supervisor', 'policy.mjs'), 'owner fix\n');
    });
    try {
      assert.equal(existsSync(path.join(s.repo, 'src-change.txt')), false, 'the lead\'s edit was stashed');
      assert.equal(readFileSync(path.join(s.repo, 'gym', 'plan', 'supervisor', 'policy.mjs'), 'utf8'), 'owner fix\n');
    } finally { s.cleanup(); }
  });

  it('reads the budget from the CAMPAIGN.md table row when --budget-usd is absent', () => {
    const s = scenario([{ status: 'done' }], ['--dry-run']);
    try {
      writeFileSync(path.join(s.campaign, 'CAMPAIGN.md'), '| key | value |\n|---|---|\n| budgetUsd | 150 | owner, L-002 |\n');
      const r = spawnSync(process.execPath, [SUPERVISE, 'run', '--campaign', 'c1', '--repo', s.repo, '--dry-run'], {
        env: { ...process.env, GYM_CLAUDE_BIN: STUB, GYM_NO_DESKTOP_NOTIFY: '1', GYM_NOTIFY_CMD: '' },
        encoding: 'utf8',
      });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      const starts = readFileSync(path.join(s.campaign, 'supervisor', 'supervisor.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.event === 'start');
      assert.equal(starts.at(-1).budgetUsd, 150);
    } finally { s.cleanup(); }
  });

  it('after a halt and the owner removing STOP, restarts fresh (never resuming the killed session) and --reset-violations clears the count', () => {
    const s = scenario([{ kill: 'secret-path' }, { kill: 'secret-path' }, { kill: 'secret-path' }, { status: 'done' }]);
    try {
      assert.deepEqual(s.decisions, ['fresh', 'halt']);
      rmSync(path.join(s.campaign, 'STOP'));
      const again = spawnSync(process.execPath, [SUPERVISE, 'run', '--campaign', 'c1', '--repo', s.repo, '--budget-usd', '100', '--sleep-seconds', '0', '--max-sessions', '8', '--reset-violations'], {
        env: { ...process.env, GYM_CLAUDE_BIN: STUB, GYM_STUB_PLAN: path.join(path.dirname(s.repo), 'plan.json'), GYM_NO_DESKTOP_NOTIFY: '1', GYM_NOTIFY_CMD: '' },
        encoding: 'utf8',
      });
      assert.equal(again.status, 0, again.stdout + again.stderr);
      const argv = readFileSync(path.join(path.dirname(s.repo), 'plan.json.argv'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      assert.deepEqual(argv.map(resumed), [false, false, false, false]);
      const log = readFileSync(path.join(s.campaign, 'supervisor', 'supervisor.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      assert.deepEqual(log.filter((e) => e.event === 'session-end').map((e) => e.decision.action), ['fresh', 'halt', 'fresh', 'exit']);
    } finally { s.cleanup(); }
  });

  it('sleeps on a usage limit and then resumes', () => {
    const s = scenario([{ exitCode: 1, isError: true, resultText: 'Claude usage limit reached', phase: 'measure', tokens: 1 }, { status: 'done' }]);
    try {
      assert.deepEqual(s.decisions, ['sleep', 'exit']);
      assert.equal(resumed(s.argv[1]), true);
    } finally { s.cleanup(); }
  });

  it('usage-limit sessions do not count toward the no-progress halt', () => {
    const limited = { exitCode: 1, isError: true, resultText: 'Claude usage limit reached', phase: 'measure', tokens: 1 };
    const s = scenario([limited, limited, limited, { phase: 'measure', tokens: 1 }, { status: 'done' }]);
    try {
      assert.equal(s.r.status, 0, s.r.stdout + s.r.stderr);
      assert.deepEqual(s.decisions, ['sleep', 'sleep', 'sleep', 'resume', 'exit']);
    } finally { s.cleanup(); }
  });

  it('sleeps through a subscription session limit instead of halting (R1 sessions 7-9)', () => {
    const limited = { exitCode: 1, isError: true, apiErrorStatus: 429, resultText: "You've hit your session limit · resets 9:20am (Europe/Warsaw)", phase: 'measure', tokens: 1 };
    const s = scenario([limited, limited, limited, { phase: 'measure', tokens: 1 }, { status: 'done' }]);
    try {
      assert.equal(s.r.status, 0, s.r.stdout + s.r.stderr);
      assert.deepEqual(s.decisions, ['sleep', 'sleep', 'sleep', 'resume', 'exit']);
    } finally { s.cleanup(); }
  });

  it('counts a resumed session once: total_cost_usd is cumulative per session id', () => {
    // R1 sessions 6-8 resumed one id; each reported 18.168202099999995 and the ledger tripled it.
    const s = scenario([{ exitCode: 1, isError: true, phase: 'measure', tokens: 1, cost: 10 }, { cost: 12, status: 'done' }]);
    try {
      assert.deepEqual(s.decisions, ['resume', 'exit']);
      assert.equal(JSON.parse(readFileSync(path.join(s.campaign, 'supervisor', 'state.json'), 'utf8')).spentUsd, 12);
    } finally { s.cleanup(); }
  });

  it('waits while blocked on the owner and continues fresh once labels.json changes', () => {
    const s = scenario([{ phase: 'blocked', writeLater: ['labels/labels.json', '{"L-001":{"label":"400"}}\n', 300] }, { status: 'done' }], ['--label-poll-seconds', '0.05'], (repo) => {
      mkdirSync(path.join(repo, 'gym', 'runs', 'c1', 'labels'), { recursive: true });
      writeFileSync(path.join(repo, 'gym', 'runs', 'c1', 'labels', 'labels.json'), '{}\n');
    });
    try {
      assert.equal(s.r.status, 0, s.r.stdout + s.r.stderr);
      assert.deepEqual(s.decisions, ['wait', 'exit']);
      assert.equal(resumed(s.argv[1]), false);
      assert.match(s.argv[1][1], /changed .*labels\/labels\.json while you were blocked/);
    } finally { s.cleanup(); }
  });

  it('a STOP file ends the wait for the owner without another launch', () => {
    const s = scenario([{ phase: 'blocked', writeLater: ['STOP', 'owner\n', 300] }], ['--label-poll-seconds', '0.05']);
    try {
      assert.equal(s.r.status, 0, s.r.stdout + s.r.stderr);
      assert.deepEqual(s.decisions, ['wait']);
      assert.equal(s.argv.length, 1);
    } finally { s.cleanup(); }
  });

  it('writes a heartbeat to supervisor.log while a session runs', () => {
    // R1: an hour-long session left supervisor.log and OWNER-INBOX.md silent, and the owner read that as a stall.
    const s = scenario([{ sleepMs: 600, status: 'done' }], ['--heartbeat-seconds', '0.1']);
    try {
      const beats = readFileSync(path.join(s.campaign, 'supervisor', 'supervisor.log'), 'utf8').split('\n').filter((l) => l.includes('"heartbeat"'));
      assert.ok(beats.length >= 2, `heartbeats: ${beats.length}`);
      assert.match(beats[0], /"index":1/);
    } finally { s.cleanup(); }
  });

  it('status prints the phase, context and the lead\'s latest actions', () => {
    const s = scenario([{ phase: 'measure', tokens: 116_000, status: 'done' }]);
    try {
      const transcript = path.join(s.campaign, 'supervisor', 't.jsonl');
      const row = (ts, content) => JSON.stringify({ type: 'assistant', timestamp: ts, message: { content } });
      writeFileSync(transcript, [
        row('2026-09-29T10:05:18.000Z', [{ type: 'tool_use', name: 'Bash', input: { command: 'npm run evals:preflight', description: 'Run preflight on Sonnet' } }]),
        row('2026-09-29T10:06:01.000Z', [{ type: 'text', text: 'Preflight passed; recording next.' }]),
      ].join('\n') + '\n');
      writeFileSync(path.join(s.campaign, 'supervisor', 'session.json'), JSON.stringify({ sessionId: 'abc12345-x', transcriptPath: transcript, at: '2026-09-29T09:48:15.000Z' }));
      const r = spawnSync(process.execPath, [SUPERVISE, 'status', '--campaign', 'c1', '--repo', s.repo], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /phase\s+it-001 measure/);
      assert.match(r.stdout, /context\s+116000 \/ soft 150000/);
      assert.match(r.stdout, /10:05:18 Bash: Run preflight on Sonnet/);
      assert.match(r.stdout, /10:06:01 says: Preflight passed; recording next\./);
    } finally { s.cleanup(); }
  });

  it('does not sleep when a healthy session merely mentions a rate limit', () => {
    const s = scenario([{ phase: 'handoff', tokens: 320_000, progress: true, resultText: 'noted: rate limit on eval runs' }, { status: 'done' }]);
    try { assert.deepEqual(s.decisions, ['fresh', 'exit']); } finally { s.cleanup(); }
  });

  it('exits without launching when STOP exists', () => {
    const s = scenario([{ status: 'done' }], [], (repo) => {
      spawnSync('mkdir', ['-p', path.join(repo, 'gym', 'runs', 'c1')]);
      writeFileSync(path.join(repo, 'gym', 'runs', 'c1', 'STOP'), 'owner\n');
    });
    try {
      assert.equal(s.r.status, 0);
      assert.deepEqual(s.argv, []);
      assert.deepEqual(s.decisions, []);
    } finally { s.cleanup(); }
  });

  it('loads the built dist candidate as the plugin, not the repository', () => {
    const s = scenario([{ status: 'done' }], ['--dry-run'], (repo) => {
      spawnSync('mkdir', ['-p', path.join(repo, 'dist', 'ambicode-9.9.9', '.claude-plugin')]);
      writeFileSync(path.join(repo, 'dist', 'ambicode-9.9.9', '.claude-plugin', 'plugin.json'), '{}');
      writeFileSync(path.join(repo, 'package.json'), '{"version":"9.9.9"}');
    });
    try {
      const line = readFileSync(path.join(s.campaign, 'supervisor', 'supervisor.log'), 'utf8').split('\n').find((l) => l.includes('dry-run'));
      const argv = JSON.parse(line).argv;
      assert.equal(argv[argv.indexOf('--plugin-dir') + 1], path.join(s.repo, 'dist', 'ambicode-9.9.9'));
    } finally { s.cleanup(); }
  });

  it('the dry run shows the locked-down argv and ignores supervisor state in git', () => {
    const s = scenario([{ status: 'done' }], ['--dry-run']);
    try {
      const line = readFileSync(path.join(s.campaign, 'supervisor', 'supervisor.log'), 'utf8').split('\n').find((l) => l.includes('dry-run'));
      const argv = JSON.parse(line).argv;
      for (const flag of ['--settings', '--strict-mcp-config', '--setting-sources', '--max-budget-usd']) assert.ok(argv.includes(flag), flag);
      assert.equal(argv[argv.indexOf('--permission-mode') + 1], 'dontAsk');
      assert.equal(argv.includes('--plugin-dir') && argv[argv.indexOf('--plugin-dir') + 1] === s.repo, false, 'the repository root must never be the plugin dir: it becomes read-only');
      assert.match(readFileSync(path.join(s.repo, 'gym', 'runs', '.gitignore'), 'utf8'), /\*\*\/supervisor\//);
    } finally { s.cleanup(); }
  });
});
