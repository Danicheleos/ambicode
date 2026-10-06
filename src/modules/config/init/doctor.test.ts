import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { parseArgs } from '#cli/args';
import { runDoctorCommand, DOCTOR_OPTIONS } from '#cli/commands/config/doctor';
import { createRuntime } from '#composition/root';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { initConfig } from '#testing/fixtures/init-config';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { AmbicodeError } from '#util/errors';
import { loadConfigWithNotices } from '../load.ts';
import { probeArgv, runDoctor } from './doctor.ts';
import type { Runtime } from '#types/composition';
import type { SetPair } from '#types/modules/config';
import type { ProcessOutcome, ProcessRequest, ProcessRunner } from '#types/platform/ports';

const outcome = (patch: Partial<ProcessOutcome>): ProcessOutcome => ({ kind: 'exited', exitCode: 0, stdout: '', stderr: '', truncated: false, durationMs: 1, failure: null, ...patch });

/** Real git for the repository, scripted answers for the probed executables. */
class ScriptedRunner implements ProcessRunner {
  readonly probes: ProcessRequest[] = [];
  private readonly real = new NodeProcessRunner();
  private readonly script: Readonly<Record<string, ProcessOutcome>>;
  constructor(script: Readonly<Record<string, ProcessOutcome>>) {
    this.script = script;
  }
  run(request: ProcessRequest): Promise<ProcessOutcome> {
    const scripted = this.script[request.argv[0]!];
    if (scripted === undefined) return this.real.run(request);
    this.probes.push(request);
    return Promise.resolve(scripted);
  }
}

async function setup(script: Record<string, ProcessOutcome>, overrides: SetPair[], files: Record<string, string> = {}) {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{"name":"a"}');
  for (const [name, text] of Object.entries(files)) await repo.write(name, text);
  await repo.commitAll('initial');
  const runner = new ScriptedRunner(script);
  const runtime: Runtime = await createRuntime({ cwd: repo.root, runner });
  const written = await initConfig(runtime, overrides);
  const { config } = await loadConfigWithNotices(runtime.fs, repo.root);
  return { repo, runner, runtime, config, configPath: written.configPath };
}

const lint = (argv: string[] = ['./bin/lint']): SetPair => ({ key: 'projects.app.commands.lint', value: argv });
const rowOf = (table: Awaited<ReturnType<typeof runDoctor>>, slot: string) => table.rows.find((row) => row.slot === slot)!;

describe('09-D1: one row per command slot', () => {
  it('09-D1: a null slot is "null" and every slot of the project has a row', async () => {
    const { repo, runtime, config } = await setup({}, []);
    try {
      const table = await runDoctor(runtime, repo.root, config);
      assert.deepEqual(table.rows.map((row) => row.slot), ['lint', 'unit', 'e2e', 'format']);
      assert.ok(table.rows.every((row) => row.project === 'app' && row.result === 'null'));
    } finally {
      await repo.dispose();
    }
  });

  it('09-D1: an unknown --project is unknown-project', async () => {
    const { repo, runtime, config } = await setup({}, []);
    try {
      await assert.rejects(runDoctor(runtime, repo.root, config, { project: 'nope' }), (error: unknown) => error instanceof AmbicodeError && error.code === 'unknown-project');
      assert.equal((await runDoctor(runtime, repo.root, config, { project: 'app' })).rows.length, 4);
    } finally {
      await repo.dispose();
    }
  });
});

describe('09-D2: probing a command', () => {
  it('09-D2: a missing executable is not-found and is not run', async () => {
    const { repo, runtime, runner, config } = await setup({}, [lint(['./bin/missing'])]);
    try {
      const row = rowOf(await runDoctor(runtime, repo.root, config), 'lint');
      assert.equal(row.result, 'not-found');
      assert.equal(row.resolved, null);
      assert.equal(runner.probes.length, 0);
    } finally {
      await repo.dispose();
    }
  });

  it('09-D2: a command the policy proposes is not-run with the policy reason', async () => {
    const { repo, runtime, runner, config } = await setup({ './bin/lint': outcome({}) }, [{ key: 'projects.app.commands.e2e', value: ['./bin/lint'] }], { 'bin/lint': '#!/bin/sh\n' });
    try {
      const row = rowOf(await runDoctor(runtime, repo.root, config), 'e2e');
      assert.equal(row.result, 'not-run');
      assert.match(row.detail, /policy declares "e2e" as propose/);
      assert.equal(runner.probes.length, 0);
    } finally {
      await repo.dispose();
    }
  });

  it('09-D2: a command no enabled pack declares is not-run with the refusal reason', async () => {
    const { repo, runtime, runner, config } = await setup({ './bin/lint': outcome({}) }, [{ key: 'projects.app.commands.format', value: ['./bin/lint'] }], { 'bin/lint': '#!/bin/sh\n' });
    try {
      const row = rowOf(await runDoctor(runtime, repo.root, config), 'format');
      assert.equal(row.result, 'not-run');
      assert.match(row.detail, /not declared by any enabled pack/);
      assert.equal(runner.probes.length, 0);
    } finally {
      await repo.dispose();
    }
  });

  it('09-D2: exit 0 is ok with the first stdout line, probed with --version and a 15 s timeout', async () => {
    const { repo, runtime, runner, config } = await setup({ './bin/lint': outcome({ stdout: '\nlint 1.2.3\nsecond\n' }) }, [lint(['./bin/lint', '--', '{files}'])], { 'bin/lint': '#!/bin/sh\n' });
    try {
      const row = rowOf(await runDoctor(runtime, repo.root, config), 'lint');
      assert.equal(row.result, 'ok');
      assert.equal(row.detail, 'lint 1.2.3');
      assert.deepEqual(runner.probes[0]!.argv, ['./bin/lint', '--version']);
      assert.equal(runner.probes[0]!.timeoutMs, 15_000);
    } finally {
      await repo.dispose();
    }
  });

  it('09-D2: a nonzero probe is failed with the exit code and the first stderr line', async () => {
    const { repo, runtime, config } = await setup({ './bin/lint': outcome({ exitCode: 2, stderr: 'boom\nmore\n' }) }, [lint()], { 'bin/lint': '#!/bin/sh\n' });
    try {
      const row = rowOf(await runDoctor(runtime, repo.root, config), 'lint');
      assert.equal(row.result, 'failed');
      assert.equal(row.detail, 'exit 2: boom');
    } finally {
      await repo.dispose();
    }
  });

  it('09-D2: a timed-out probe is timeout', async () => {
    const { repo, runtime, config } = await setup({ './bin/lint': outcome({ kind: 'timed-out', exitCode: null }) }, [lint()], { 'bin/lint': '#!/bin/sh\n' });
    try {
      assert.equal(rowOf(await runDoctor(runtime, repo.root, config), 'lint').result, 'timeout');
    } finally {
      await repo.dispose();
    }
  });

  it('09-D1: a failing command stays in the config file', async () => {
    const { repo, runtime, config, configPath } = await setup({ './bin/lint': outcome({ exitCode: 1, stderr: 'bad' }) }, [lint()], { 'bin/lint': '#!/bin/sh\n' });
    try {
      const before = await runtime.fs.readText(configPath);
      assert.equal(rowOf(await runDoctor(runtime, repo.root, config), 'lint').result, 'failed');
      assert.equal(await runtime.fs.readText(configPath), before);
      assert.match(before, /- \.\/bin\/lint/);
    } finally {
      await repo.dispose();
    }
  });
});

describe('09-D5: the probe form', () => {
  it('09-D5: the tokens before -- or {files}, then --version', () => {
    assert.deepEqual(probeArgv(['./node_modules/.bin/eslint', '--', '{files}']), ['./node_modules/.bin/eslint', '--version']);
    assert.deepEqual(probeArgv(['./.venv/bin/python', '-m', 'pytest', '{files}']), ['./.venv/bin/python', '-m', 'pytest', '--version']);
    assert.deepEqual(probeArgv(['./bin/tool', 'run']), ['./bin/tool', 'run', '--version']);
  });

  it('09-D5: ruff probes as --version without its subcommand', () => {
    assert.deepEqual(probeArgv(['./.venv/bin/ruff', 'check', '--', '{files}']), ['./.venv/bin/ruff', '--version']);
    assert.deepEqual(probeArgv(['./.venv/bin/ruff', 'format', '--', '{files}']), ['./.venv/bin/ruff', '--version']);
  });
});

describe('09-D3: the index build', () => {
  it('09-D3: with search.index codeindex, startIndex is called once per project and its status is in the table', async () => {
    const { repo, runtime, config } = await setup({}, [{ key: 'search.index', value: 'codeindex' }]);
    try {
      const calls: string[] = [];
      const table = await runDoctor(runtime, repo.root, config, {
        buildIndex: true,
        startIndex: (_deps, project) => {
          calls.push(project.id);
          return Promise.resolve({ state: 'building' } as never);
        },
      });
      assert.deepEqual(calls, ['app']);
      assert.equal(table.index, 'codeindex building');
      assert.match(table.text, /^index: codeindex building$/m);
    } finally {
      await repo.dispose();
    }
  });

  it('09-D3: a rejected build is reported as error with its message, not thrown', async () => {
    const { repo, runtime, config } = await setup({}, [{ key: 'search.index', value: 'codeindex' }]);
    try {
      const table = await runDoctor(runtime, repo.root, config, { buildIndex: true, startIndex: () => Promise.reject(new Error('not ignored')) });
      assert.equal(table.index, 'codeindex error (not ignored)');
    } finally {
      await repo.dispose();
    }
  });

  it('09-D3: with search.index none the build is not started and index is null', async () => {
    const { repo, runtime, config } = await setup({}, []);
    try {
      let called = 0;
      const table = await runDoctor(runtime, repo.root, config, { buildIndex: true, startIndex: () => { called += 1; return Promise.resolve({ state: 'building' } as never); } });
      assert.equal(called, 0);
      assert.equal(table.index, null);
    } finally {
      await repo.dispose();
    }
  });
});

describe('09-D5: standalone doctor', () => {
  it('09-D5 (amend-09 P6): standalone doctor reports the index state, starts no build and writes nothing', async () => {
    const { repo, runtime, config } = await setup({}, [{ key: 'search.index', value: 'codeindex' }]);
    try {
      await repo.commitAll('config');
      let started = 0;
      const table = await runDoctor(runtime, repo.root, config, { startIndex: () => { started += 1; return Promise.resolve({ state: 'building' } as never); } });
      assert.equal(started, 0);
      assert.doesNotMatch(table.index ?? '', /building/);
      const output = await runDoctorCommand(runtime, parseArgs('doctor', [], DOCTOR_OPTIONS));
      assert.match(output.index ?? '', /^codeindex (absent|error|stale|fresh)/);
      assert.equal(await runtime.fs.exists(`${repo.root}/.ambicode/index`), false);
      assert.equal(await repo.run(['git', 'status', '--porcelain', '--untracked-files=all']), '');
    } finally {
      await repo.dispose();
    }
  });
});

describe('09-D4: stable text', () => {
  it('09-D4: the same inputs give the same bytes and hash, and the text ends with the hash marker', async () => {
    const { repo, runtime, config } = await setup({ './bin/lint': outcome({ stdout: 'v1\n' }) }, [lint()], { 'bin/lint': '#!/bin/sh\n' });
    try {
      const first = await runDoctor(runtime, repo.root, config);
      const second = await runDoctor(runtime, repo.root, config);
      assert.equal(first.text, second.text);
      assert.equal(first.hash, second.hash);
      assert.ok(first.text.endsWith(`<!-- ambicode doctor ${first.hash} -->\n`));
      assert.match(first.text, /^project +slot +command +result +detail$/m);
    } finally {
      await repo.dispose();
    }
  });

  it('09-D4: a different probe result changes the hash', async () => {
    const a = await setup({ './bin/lint': outcome({ stdout: 'v1\n' }) }, [lint()], { 'bin/lint': '#!/bin/sh\n' });
    const b = await setup({ './bin/lint': outcome({ stdout: 'v2\n' }) }, [lint()], { 'bin/lint': '#!/bin/sh\n' });
    try {
      assert.notEqual((await runDoctor(a.runtime, a.repo.root, a.config)).hash, (await runDoctor(b.runtime, b.repo.root, b.config)).hash);
    } finally {
      await a.repo.dispose();
      await b.repo.dispose();
    }
  });
});

describe('09-D5: standalone doctor writes nothing', () => {
  it('09-D5: runDoctorCommand leaves the working tree and git status unchanged', async () => {
    const { repo, runtime } = await setup({ './bin/lint': outcome({ stdout: 'v1\n' }) }, [lint()], { 'bin/lint': '#!/bin/sh\n' });
    try {
      const listing = async (): Promise<string[]> => (await readdir(repo.root, { recursive: true })).filter((entry) => !entry.startsWith('.git/') && entry !== '.git').sort();
      const before = { files: await listing(), status: await repo.run(['git', 'status', '--porcelain', '--ignored']) };
      const output = await runDoctorCommand(runtime, parseArgs('doctor', [], DOCTOR_OPTIONS));
      assert.equal(output.command, 'doctor');
      assert.equal(output.rows.find((row) => row.slot === 'lint')!.result, 'ok');
      assert.deepEqual({ files: await listing(), status: await repo.run(['git', 'status', '--porcelain', '--ignored']) }, before);
    } finally {
      await repo.dispose();
    }
  });
});
