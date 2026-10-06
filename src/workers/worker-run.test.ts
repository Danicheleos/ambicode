import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { runWorkerCommand } from '../cli/commands/worker.ts';
import { parseArgs } from '../cli/args.ts';
import { createRuntime, type Runtime } from '../composition/root.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';
import { NodeProcessRunner } from '../ports/node-process-runner.ts';
import { TempRepo } from '../testing/temp-repo.ts';
import { AmbicodeError } from '../util/errors.ts';
import { LEDGER_FILE, readLedger } from '../task/ledger.ts';
import { runWorker } from './worker-run.ts';
import { WORKER_RUN_OPTIONS } from '../cli/commands/worker.ts';

const NOW = new Date(2026, 9, 2, 14, 35);
const TASK = 'ORD-17';
const A = 'aaaaaaaa';
const B = 'bbbbbbbb';
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

const SCHEMA = { type: 'object', required: ['summary'], properties: { summary: { type: 'string' }, count: { type: 'number' } } };

interface Env { repo: TempRepo; runtime: Runtime; definitions: string; scripts: string; taskDir: string }

async function withEnv(run: (env: Env) => Promise<void>): Promise<void> {
  const repo = await TempRepo.create();
  const aux = await mkdtemp(path.join(tmpdir(), 'ambicode-worker-'));
  try {
    await repo.write('package.json', '{}\n');
    await repo.commitAll('initial');
    const definitions = path.join(aux, 'defs');
    const scripts = path.join(aux, 'scripts');
    await mkdir(definitions);
    await mkdir(scripts);
    const runtime = await createRuntime({ cwd: repo.root, clock: { now: () => NOW, elapsed: () => 0 } });
    await run({ repo, runtime, definitions, scripts, taskDir: path.join(repo.root, '.ambicode', 'task', TASK) });
  } finally {
    await repo.dispose();
    await rm(aux, { recursive: true, force: true });
  }
}

async function define(env: Env, id: string, script: string, over: Record<string, unknown> = {}): Promise<void> {
  const file = path.join(env.scripts, `${id}.mjs`);
  await writeFile(file, script);
  const definition = { id, argv: [process.execPath, file, '{taskDir}'], timeoutMs: 20_000, outputSchema: SCHEMA, ...over };
  await writeFile(path.join(env.definitions, `${id}.yaml`), JSON.stringify(definition));
}

const emit = (value: string): string => `process.stdout.write(${value});`;
const ok = emit('JSON.stringify({ summary: "hi", count: 2, extra: true })');

const route = (id: string, session: string, extra: object = {}): object => ({
  id, at: 't', kind: 'route', skill: 'plan', args: 'x', mode: 'interactive', channel: 'hook', trusted: true, session, epoch: 1, ...extra,
});

async function seed(env: Env, entries: object[]): Promise<void> {
  await mkdir(env.taskDir, { recursive: true });
  await writeFile(path.join(env.taskDir, LEDGER_FILE), `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
}

const snapshot = async (env: Env): Promise<string> => {
  const names = await readdir(env.taskDir, { recursive: true }).catch(() => []);
  return `${names.sort().join(',')}\n${await readFile(path.join(env.taskDir, LEDGER_FILE), 'utf8').catch(() => '')}`;
};

const exec = (env: Env, id: string, session: string | null = null) =>
  runWorker({ runtime: env.runtime, session, context: null, runner: new NodeProcessRunner(), definitions: env.definitions }, { id, task: TASK });

const entries = (env: Env) => readLedger(nodeFileSystem, env.taskDir);

describe('worker run: definitions', () => {
  it('06-W4: a missing definition, an id outside the pattern and an invalid definition are bad-argument on id', async () => {
    await withEnv(async (env) => {
      await writeFile(path.join(env.definitions, 'broken.yaml'), 'id: broken\nargv: []\n');
      await writeFile(path.join(env.definitions, 'other.yaml'), JSON.stringify({ id: 'x', argv: ['a'], timeoutMs: 1, outputSchema: SCHEMA }));
      await writeFile(path.join(env.definitions, 'notyaml.yaml'), 'a: [unclosed');
      for (const id of ['absent', '../x', 'Bad', 'broken', 'other', 'notyaml']) {
        await assert.rejects(exec(env, id), (error: AmbicodeError) => error.code === 'bad-argument' && error.field === 'id', id);
      }
    });
  });

  it('06-W4: {taskDir} becomes the absolute task directory in an argv element and nothing else is substituted', async () => {
    await withEnv(async (env) => {
      const record = path.join(env.scripts, 'seen.json');
      await define(env, 'echo', `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(record)}, JSON.stringify(process.argv.slice(2)));\n${ok}`);
      const file = path.join(env.scripts, 'echo.mjs');
      await writeFile(path.join(env.definitions, 'echo.yaml'), JSON.stringify({ id: 'echo', argv: [process.execPath, file, '{taskDir}', 'a/{taskDir}/b', '{task}', '{repoRoot}'], timeoutMs: 20_000, outputSchema: SCHEMA }));
      await exec(env, 'echo');
      const seen = JSON.parse(await readFile(record, 'utf8')) as string[];
      assert.ok(path.isAbsolute(seen[0] ?? ''));
      assert.equal(await realpathOf(seen[0] ?? ''), await realpathOf(env.taskDir));
      assert.equal(seen[1], `a/${seen[0]}/b`);
      assert.deepEqual(seen.slice(2), ['{task}', '{repoRoot}']);
    });
  });
});

async function realpathOf(p: string): Promise<string> {
  const { realpath } = await import('node:fs/promises');
  return realpath(p);
}

describe('worker run: ownership', () => {
  const live = [route(`${A}-1`, A)];
  const takenOver = [route(`${A}-1`, A), route(`${B}-1`, B, { resumes: `${A}-1`, adopts: true })];
  const cases: { label: string; ledger: object[]; session: string | null; code: string }[] = [
    { label: 'an owned route and no session', ledger: live, session: null, code: 'session-unbound' },
    { label: 'any other session', ledger: live, session: 'cccccccc', code: 'route-busy' },
    { label: 'a session that was taken over', ledger: takenOver, session: A, code: 'route-taken-over' },
  ];
  for (const { label, ledger, session, code } of cases) {
    it(`06-W5: ${label} writes nothing`, async () => {
      await withEnv(async (env) => {
        await define(env, 'ok', ok);
        await seed(env, ledger);
        const before = await snapshot(env);
        await assert.rejects(exec(env, 'ok', session), { code });
        assert.equal(await snapshot(env), before);
        assert.ok(!before.includes('workers'));
      });
    });
  }

  it('06-W5: the owner runs and the entry carries the route', async () => {
    await withEnv(async (env) => {
      await define(env, 'ok', ok);
      await seed(env, live);
      const ran = await exec(env, 'ok', A);
      assert.equal(ran.entry.route, `${A}-1`);
    });
  });
});

describe('worker run: output', () => {
  it('06-W6: a valid object is written whole to workers/<id>-<timestamp>.json and ledgered as ran', async () => {
    await withEnv(async (env) => {
      await define(env, 'ok', ok);
      const ran = await exec(env, 'ok');
      assert.equal(ran.artifact, '.ambicode/task/ORD-17/workers/ok-2026-10-02T14-35.json');
      assert.deepEqual(JSON.parse(await readFile(path.join(env.repo.root, ran.artifact), 'utf8')), { summary: 'hi', count: 2, extra: true });
      const last = (await entries(env)).at(-1);
      assert.deepEqual([last?.kind, last?.worker, last?.outcome, last?.artifact], ['worker', 'ok', 'ran', ran.artifact]);
    });
  });

  it('06-W6: exactly 65,536 serialized bytes is accepted', async () => {
    await withEnv(async (env) => {
      const pad = 65_536 - Buffer.byteLength(JSON.stringify({ summary: '' }));
      await define(env, 'edge', emit(`JSON.stringify({ summary: 'x'.repeat(${pad}) })`));
      assert.equal((await exec(env, 'edge')).entry.outcome, 'ran');
    });
  });

  const bad: { label: string; script: string; reason: RegExp; over?: Record<string, unknown> }[] = [
    { label: 'non-JSON output', script: emit('"not json"'), reason: /not JSON/ },
    { label: 'a missing required key', script: emit('JSON.stringify({ count: 1 })'), reason: /misses summary/ },
    { label: 'a wrong property type', script: emit('JSON.stringify({ summary: 1 })'), reason: /wrong type for summary/ },
    { label: 'a JSON array', script: emit('"[1]"'), reason: /array/ },
    { label: '65,537 serialized bytes', script: emit(`JSON.stringify({ summary: 'x'.repeat(${65_536 - Buffer.byteLength(JSON.stringify({ summary: '' })) + 1}) })`), reason: /65537 bytes/ },
    { label: 'a nonzero exit', script: `${ok}\nprocess.exit(3);`, reason: /nonzero-exit/ },
  ];
  for (const { label, script, reason } of bad) {
    it(`06-W7: ${label} is ledgered inline, throws worker-output-invalid and writes no artifact`, async () => {
      await withEnv(async (env) => {
        await define(env, 'bad', script);
        await assert.rejects(exec(env, 'bad'), { code: 'worker-output-invalid' });
        const last = (await entries(env)).at(-1);
        assert.deepEqual([last?.kind, last?.worker, last?.outcome, last?.artifact], ['worker', 'bad', 'inline', null]);
        assert.match(String(last?.reason), reason);
        assert.deepEqual(await readdir(path.join(env.taskDir, 'workers')).catch(() => []), []);
      });
    });
  }
});

describe('worker run: command', () => {
  it('06-W4: worker run reads definitions from <pluginRoot>/workers', async () => {
    await withEnv(async (env) => {
      const plugin = path.join(env.scripts, 'plugin');
      await mkdir(plugin);
      await symlink(path.join(REPO_ROOT, 'routes'), path.join(plugin, 'routes'));
      await symlink(path.join(REPO_ROOT, 'skills'), path.join(plugin, 'skills'));
      await symlink(env.definitions, path.join(plugin, 'workers'));
      await define(env, 'ok', ok);
      const runtime = await createRuntime({ cwd: env.repo.root, pluginRoot: plugin, clock: { now: () => NOW, elapsed: () => 0 } });
      const out = await runWorkerCommand(runtime, parseArgs('worker run', ['ok', '--task', TASK], WORKER_RUN_OPTIONS));
      assert.equal(out.worker, 'ok');
      assert.equal(out.artifact, '.ambicode/task/ORD-17/workers/ok-2026-10-02T14-35.json');
      await assert.rejects(runWorkerCommand(runtime, parseArgs('worker run', ['ok', 'two', '--task', TASK], WORKER_RUN_OPTIONS)), { code: 'bad-argument', field: 'id' });
    });
  });
});
