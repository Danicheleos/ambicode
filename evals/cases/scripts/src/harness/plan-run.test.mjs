import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { parsePlanRunArgs, planSessions } from './plan-run.mjs';

const SCRIPT = fileURLToPath(new URL('./plan-run.mjs', import.meta.url));
let benchmarks;
before(async () => {
  benchmarks = await mkdtemp(path.join(tmpdir(), 'plan-run-'));
  for (const epic of ['alpha', 'beta']) {
    await mkdir(path.join(benchmarks, epic));
    await writeFile(path.join(benchmarks, epic, 'prompt.md'), `plan ${epic}\n`);
  }
});
after(() => rm(benchmarks, { recursive: true, force: true }));

const base = () => ['--benchmarks', benchmarks, '--plugin', '/p', '--model', 'm', '--runs', '2', '--epics', '2', '--dry-run'];

describe('plan-run', () => {
  it('06-E3: a second invocation (smoke, then the full run) never reuses a session id', () => {
    const ids = (sessions) => sessions.map((s) => s.argv[s.argv.indexOf('--session-id') + 1]);
    const first = new Set(ids(planSessions(parsePlanRunArgs(base()))));
    assert.ok(ids(planSessions(parsePlanRunArgs(base()))).every((id) => !first.has(id)));
  });

  it('06-E3: dry run lists one session per epic, arm and run, never --resume', () => {
    const sessions = planSessions(parsePlanRunArgs(base()));
    assert.equal(sessions.length, 2 * 2 * 2);
    assert.equal(new Set(sessions.map((s) => s.argv[s.argv.indexOf('--session-id') + 1])).size, sessions.length);
    for (const session of sessions) assert.ok(!session.argv.includes('--resume'));
  });
  it('06-E3: epics come from the configured directory and the route prompt carries the trusted preanswer', () => {
    const sessions = planSessions(parsePlanRunArgs(base()));
    assert.deepEqual([...new Set(sessions.map((s) => s.epic))], ['alpha', 'beta']);
    const route = sessions.find((s) => s.arm === 'route');
    assert.equal(route.stdin, '/ambicode:plan --answer plan-accept=Accept plan alpha');
    assert.ok(route.argv.includes('--plugin-dir'));
    assert.equal(sessions.find((s) => s.arm === 'naked').stdin, 'plan alpha');
  });
  it('06-E3: the dry-run command spawns nothing and prints each session', () => {
    const lines = execFileSync('node', [SCRIPT, ...base()], { encoding: 'utf8' }).trim().split('\n');
    assert.equal(lines.length, 8);
  });
  it('06-E3: a real run is refused without --authorized, and --resume is refused', () => {
    const real = base().filter((arg) => arg !== '--dry-run');
    assert.throws(() => parsePlanRunArgs(real), /--authorized/);
    assert.throws(() => parsePlanRunArgs([...base(), '--resume']), /--resume/);
  });
});
