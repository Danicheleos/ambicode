import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRuntime } from '#composition/root';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { codeindexAdapter, VENDORED_CODEINDEX, refreshIndex, runIndexBuild, startIndexBuild } from './codeindex.ts';
import type { ProcessOutcome, ProcessRequest, ProcessRunner } from '#types/platform/ports';
import type { IndexStatus, IndexDeps } from '#types/modules/search';

const TS = ['ts', 'tsx', 'js'];
const SELF = ['/usr/bin/node', '/plugin/ambicode.mjs'];

class FakeRunner implements ProcessRunner {
  requests: ProcessRequest[] = [];
  respond: (request: ProcessRequest) => Partial<ProcessOutcome> | Promise<Partial<ProcessOutcome>> = () => ({ stdout: '[]' });
  async run(request: ProcessRequest): Promise<ProcessOutcome> {
    this.requests.push(request);
    const produced = request.output === 'detached' ? { kind: 'detached' as const } : await this.respond(request);
    return { kind: 'exited', exitCode: 0, stdout: '', stderr: '', truncated: false, durationMs: 1, failure: null, ...produced };
  }
}

interface Context { repo: TempRepo; deps: IndexDeps; runner: FakeRunner; project: never; binary: string; indexDir: string; time: { now: number }; adapter(): ReturnType<typeof codeindexAdapter>; dispose(): Promise<void> }

async function setup(options: { binary?: 'modules' | 'path' | null; ignored?: boolean; indexFiles?: number; driftFiles?: number; root?: string; alive?: (pid: number) => boolean; indexDir?: string } = {}): Promise<Context> {
  const repo = await TempRepo.create();
  await repo.write('.gitignore', options.ignored === false ? 'node_modules/\n' : 'node_modules/\n.ambicode/index/\n');
  await repo.write('src/a.ts', 'export const a = 1;\n');
  await repo.commitAll('files');
  const scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-bin-'));
  const kind = options.binary === undefined ? 'modules' : options.binary;
  const binary = kind === 'path' ? path.join(scratch, 'codeindex') : path.join(repo.root, 'node_modules', '.bin', 'codeindex');
  if (kind !== null) {
    await mkdir(path.dirname(binary), { recursive: true });
    await writeFile(binary, '#!/bin/sh\n');
    await chmod(binary, 0o755);
  }
  const runner = new FakeRunner();
  const time = { now: Date.UTC(2026, 9, 5, 10, 0, 0) };
  let tick = 0;
  const runtime = { ...(await createRuntime({ cwd: repo.root, runner, env: { PATH: kind === 'path' ? scratch : '' }, clock: { now: () => new Date(time.now), elapsed: () => (tick += 40) } })), pluginRoot: path.join(scratch, 'plugin') };
  const project = { id: 'app', root: options.root ?? '.', ecosystem: 'typescript', commands: {}, profile: { stamp: { commit: '', files: 0 }, sources: TS, companions: [], catalogs: [], featureKinds: [], exportOnly: true, ...(options.indexFiles === undefined ? {} : { index: { tool: 'codeindex', languages: [], files: options.indexFiles } }) } } as never;
  const deps: IndexDeps = { runtime, git: repo.git, repositoryRoot: repo.root, config: { search: { index: 'codeindex', ...(options.driftFiles === undefined ? {} : { indexDriftFiles: options.driftFiles }) } } as never, selfArgv: SELF, ...(options.alive === undefined ? {} : { isAlive: options.alive }), ...(options.indexDir === undefined ? {} : { indexDir: options.indexDir }) };
  return {
    repo, deps, runner, project, binary, time,
    indexDir: options.indexDir ?? path.join(repo.root, '.ambicode', 'index'),
    adapter: () => codeindexAdapter(deps, project),
    dispose: async () => {
      await repo.dispose();
      await rm(scratch, { recursive: true, force: true });
    },
  };
}

const exists = (file: string): Promise<boolean> => stat(file).then(() => true, () => false);
const built = async (ctx: Context): Promise<ReturnType<Context['adapter']>> => {
  const adapter = ctx.adapter();
  await adapter.build(ctx.project, { detached: false });
  ctx.runner.requests = [];
  return adapter;
};
const marker = async (ctx: Context, extra: object = {}): Promise<void> => {
  await mkdir(ctx.indexDir, { recursive: true });
  await writeFile(path.join(ctx.indexDir, 'ambicode-index.json'), JSON.stringify({ tool: 'codeindex', head: await ctx.repo.git.revParse('HEAD'), builtAt: 'x', builtMs: 321, ...extra }));
};
const building = async (ctx: Context, body: object): Promise<void> => {
  await mkdir(ctx.indexDir, { recursive: true });
  await writeFile(path.join(ctx.indexDir, 'building.json'), JSON.stringify(body));
};
const isoAgo = (ctx: Context, ms: number): string => new Date(ctx.time.now - ms).toISOString();

describe('05-A3 binary resolution', () => {
  const rows: ['modules' | 'path' | null, boolean][] = [['modules', true], ['path', true], [null, false]];
  for (const [kind, found] of rows) {
    it(`05-A3: ${String(kind)} ${found ? 'is spawned' : 'gives error and spawns nothing'}`, async () => {
      const ctx = await setup({ binary: kind });
      try {
        const status = await ctx.adapter().build(ctx.project, { detached: false });
        if (found) assert.equal(ctx.runner.requests[0]!.argv[0], ctx.binary);
        else assert.deepEqual([status.state, status.reason, ctx.runner.requests.length], ['error', 'codeindex not found (plugin vendor/, node_modules/.bin or PATH)', 0]);
      } finally {
        await ctx.dispose();
      }
    });
  }

  it('05-A3: the copy shipped in the plugin wins over node_modules/.bin and runs under Node', async () => {
    const ctx = await setup({ binary: 'modules' });
    try {
      const entry = path.join(ctx.deps.runtime.pluginRoot, VENDORED_CODEINDEX);
      await mkdir(path.dirname(entry), { recursive: true });
      await writeFile(entry, '');
      await ctx.adapter().build(ctx.project, { detached: false });
      assert.deepEqual(ctx.runner.requests[0]!.argv.slice(0, 2), [process.execPath, entry]);
    } finally {
      await ctx.dispose();
    }
  });

  it('05-A3: node_modules/.bin wins over PATH', async () => {
    const ctx = await setup({ binary: 'modules' });
    try {
      const other = await mkdtemp(path.join(tmpdir(), 'ambicode-bin-'));
      await writeFile(path.join(other, 'codeindex'), '');
      const adapter = codeindexAdapter({ ...ctx.deps, runtime: { ...ctx.deps.runtime, env: { PATH: other } } }, ctx.project);
      await adapter.build(ctx.project, { detached: false });
      assert.equal(ctx.runner.requests[0]!.argv[0], ctx.binary);
      await rm(other, { recursive: true, force: true });
    } finally {
      await ctx.dispose();
    }
  });

  it('05-A3: a non-executable file is skipped, and the next executable candidate is spawned', async () => {
    const ctx = await setup({ binary: 'modules' });
    const other = await mkdtemp(path.join(tmpdir(), 'ambicode-bin-'));
    try {
      await chmod(ctx.binary, 0o644);
      await writeFile(path.join(other, 'codeindex'), '#!/bin/sh\n');
      await chmod(path.join(other, 'codeindex'), 0o755);
      await codeindexAdapter({ ...ctx.deps, runtime: { ...ctx.deps.runtime, env: { PATH: other } } }, ctx.project).build(ctx.project, { detached: false });
      assert.equal(ctx.runner.requests[0]!.argv[0], path.join(other, 'codeindex'));
      ctx.runner.requests = [];
      const status = await ctx.adapter().build(ctx.project, { detached: false });
      assert.deepEqual([status.state, ctx.runner.requests.length], ['error', 0]);
    } finally {
      await ctx.dispose();
      await rm(other, { recursive: true, force: true });
    }
  });
});

describe('05-A4 05-A5 argv table', () => {
  it('05-A5: every form, cwd, timeout and output ceiling', async () => {
    const ctx = await setup();
    try {
      const adapter = ctx.adapter();
      const dir = ctx.indexDir;
      await adapter.build(ctx.project, { detached: false });
      await adapter.find('foo');
      await adapter.refs(['foo', 'bar']);
      await adapter.relates('src/a.ts');
      const sent = ctx.runner.requests.map((request) => request.argv.slice(1));
      assert.deepEqual(sent, [
        ['index', '--repo', '.', '--out', dir],
        ['find', 'foo', '--repo', '.', '--index', dir],
        ['refs', 'foo', '--repo', '.', '--index', dir],
        ['refs', 'bar', '--repo', '.', '--index', dir],
        ['impact', 'src/a.ts', '--repo', '.', '--index', dir],
      ]);
      ctx.runner.requests.forEach((request, index) => {
        assert.equal(request.cwd, ctx.repo.root);
        assert.deepEqual(request.env, { kind: 'inherited' });
        assert.equal(request.timeoutMs, index === 0 ? 600_000 : 10_000);
        assert.equal(request.maxOutputBytes, 4 * 1024 * 1024);
      });
    } finally {
      await ctx.dispose();
    }
  });

  it('05-A4: the index directory is .ambicode/index unless deps.indexDir is set; a project root is the cwd', async () => {
    const other = await mkdtemp(path.join(tmpdir(), 'ambicode-idx-'));
    const ctx = await setup({ indexDir: other, root: 'pkg' });
    try {
      await ctx.adapter().build(ctx.project, { detached: false });
      assert.deepEqual(ctx.runner.requests[0]!.argv.slice(-2), ['--out', other]);
      assert.equal(ctx.runner.requests[0]!.cwd, path.join(ctx.repo.root, 'pkg'));
      assert.ok(await exists(path.join(other, 'ambicode-index.json')));
      assert.ok(!(await exists(path.join(ctx.repo.root, '.ambicode', 'index'))));
    } finally {
      await ctx.dispose();
      await rm(other, { recursive: true, force: true });
    }
  });

  it('05-A4: the adapter build does not check the ignore line', async () => {
    const ctx = await setup({ ignored: false });
    try {
      await ctx.adapter().build(ctx.project, { detached: false });
      assert.ok(await exists(path.join(ctx.indexDir, 'ambicode-index.json')));
    } finally {
      await ctx.dispose();
    }
  });
});

describe('05-A6 query parsing', () => {
  const answered = async <T>(respond: Partial<ProcessOutcome>, ask: (adapter: ReturnType<Context['adapter']>) => Promise<T>, options: { root?: string } = {}): Promise<{ answer: T; argv: readonly string[] }> => {
    const ctx = await setup(options);
    try {
      const adapter = await built(ctx);
      ctx.runner.respond = () => respond;
      return { answer: await ask(adapter), argv: ctx.runner.requests.at(-1)?.argv ?? [] };
    } finally {
      await ctx.dispose();
    }
  };
  const find = (respond: Partial<ProcessOutcome>, options: { root?: string } = {}) => answered(respond, (adapter) => adapter.find('x'), options);

  it('05-A6: find reads the list of {name, kind, file, line}; absolute paths become repository-relative', async () => {
    const { answer } = await find({ stdout: '[{"name":"x","kind":"function","file":"src/a.ts","line":3},{"name":"x","file":"src/b.ts"}]' });
    assert.ok(answer.ok);
    assert.deepEqual(answer.value, [{ name: 'x', path: 'src/a.ts', line: 3, kind: 'function' }, { name: 'x', path: 'src/b.ts', line: null, kind: null }]);
    const ctx = await setup();
    try {
      const adapter = await built(ctx);
      ctx.runner.respond = () => ({ stdout: JSON.stringify([{ file: path.join(ctx.repo.root, 'src', 'a.ts') }]) });
      const absolute = await adapter.find('x');
      assert.ok(absolute.ok && absolute.value[0]!.path === 'src/a.ts');
    } finally {
      await ctx.dispose();
    }
  });

  it('05-A6: paths are repository-relative when the project root is a subdirectory', async () => {
    const { answer } = await find({ stdout: '[{"file":"a.ts"}]' }, { root: 'pkg' });
    assert.ok(answer.ok && answer.value[0]!.path === 'pkg/a.ts');
  });

  it('05-A6: a keyed object, unknown keys, a null row, nonzero exit, timeout, spawn failure and garbage are handled without a throw', async () => {
    const rows: [Partial<ProcessOutcome>, RegExp | null][] = [
      [{ stdout: '{"results":[{"file":"src/a.ts"}]}' }, /no result list/],
      [{ stdout: '[null, 3, {"file":"src/a.ts"}]' }, null],
      [{ exitCode: 2, stderr: 'bad\nthing happened\n' }, /exited 2: thing happened$/],
      [{ kind: 'timed-out', exitCode: null }, /timed out after 10000 ms/],
      [{ kind: 'spawn-failed', exitCode: null, failure: 'ENOENT' }, /did not start: ENOENT/],
      [{ stdout: 'hello' }, /not JSON/],
      [{ exitCode: 1, stderr: `${'e'.repeat(500)}\n` }, /^codeindex find exited 1: e+$/],
    ];
    for (const [respond, reason] of rows) {
      const { answer } = await find(respond);
      if (reason === null) {
        assert.ok(answer.ok && answer.value.length === 1, JSON.stringify(respond));
        continue;
      }
      assert.ok(!answer.ok && answer.status.state === 'error', JSON.stringify(respond));
      assert.match(answer.status.reason!, reason);
      assert.ok(answer.status.reason!.length <= 200);
    }
  });

  it('05-A6: refs reads callSites with lines and adds referencingFiles without a call site', async () => {
    const stdout = JSON.stringify({ defs: [{ name: 'x', file: 'src/a.ts', line: 1 }], callSites: [{ file: 'src/b.ts', line: 4 }, null], referencingFiles: ['src/b.ts', 'src/c.ts'] });
    const { answer } = await answered({ stdout }, (adapter) => adapter.refs(['x']));
    assert.ok(answer.ok);
    assert.deepEqual(answer.value, [{ path: 'src/b.ts', line: 4 }, { path: 'src/c.ts', line: null }]);
    const { answer: unknown } = await answered({ stdout: '{"defs":[]}' }, (adapter) => adapter.refs(['x']));
    assert.ok(!unknown.ok && /no result list/.test(unknown.status.reason!));
  });

  it('05-A6: relates sends a project-relative path and reads direct dependents from impact files; imports are unknown', async () => {
    const stdout = JSON.stringify({ target: 'src/a.ts', scope: 'file', seeds: ['src/a.ts'], files: [{ rel: 'src/a.ts', depth: 0 }, { rel: 'src/b.ts', module: 'src', depth: 1 }, { rel: 'src/c.ts', depth: 2 }, { rel: 'src/d.ts' }, { rel: 'src/e.ts', depth: '1' }, null], modules: ['src'] });
    const { answer, argv } = await answered({ stdout }, (adapter) => adapter.relates('pkg/src/a.ts'), { root: 'pkg' });
    assert.equal(argv[2], 'src/a.ts');
    assert.ok(answer.ok);
    assert.deepEqual(answer.value, { imports: null, importers: ['pkg/src/b.ts'] });
    const { answer: old } = await answered({ stdout: '{"importers":[{"file":"src/b.ts"}]}' }, (adapter) => adapter.relates('src/a.ts'));
    assert.ok(!old.ok && /no result list/.test(old.status.reason!));
  });

  it('05-A6: delta takes a base revision and answers not ok without spawning', async () => {
    const { answer, argv } = await answered({}, (adapter) => adapter.delta('main'));
    assert.ok(!answer.ok);
    assert.match(answer.status.reason!, /delta is not read before step 08/);
    assert.deepEqual(argv, []);
  });
});

describe('05-A7 query gating', () => {
  it('05-A7: absent, building and error spawn nothing; stale answers and says so', async () => {
    const absent = await setup();
    const busy = await setup({ alive: () => true });
    const missing = await setup({ binary: null });
    const stale = await setup({ driftFiles: 0 });
    try {
      await building(busy, { pid: 77, startedAt: isoAgo(busy, 1000) });
      for (const [ctx, state] of [[absent, 'absent'], [busy, 'building'], [missing, 'error']] as const) {
        const answer = await ctx.adapter().find('x');
        assert.deepEqual([answer.ok, answer.status.state, ctx.runner.requests.length], [false, state, 0]);
      }
      await built(stale);
      await stale.repo.write('src/b.ts', 'export const b = 2;\n');
      await stale.repo.commitAll('more');
      stale.runner.respond = () => ({ stdout: '[{"file":"src/a.ts"}]' });
      const answer = await stale.adapter().find('x');
      assert.ok(answer.ok);
      assert.deepEqual([answer.status.state, answer.status.fresh], ['stale', false]);
    } finally {
      await Promise.all([absent, busy, missing, stale].map((ctx) => ctx.dispose()));
    }
  });
});

describe('05-A8 indexable files', () => {
  it('05-A8: a profile measured with no indexable file is error and spawns nothing', async () => {
    const ctx = await setup({ indexFiles: 0 });
    try {
      const status = await ctx.adapter().status(ctx.project);
      assert.deepEqual([status.state, status.reason], ['error', 'codeindex indexes no file of this project']);
      await ctx.adapter().build(ctx.project, { detached: false });
      assert.equal(ctx.runner.requests.length, 0);
    } finally {
      await ctx.dispose();
    }
  });

  it('05-A8: an unmeasured profile or indexable files leave the decision to codeindex', async () => {
    for (const indexFiles of [undefined, 12]) {
      const ctx = await setup(indexFiles === undefined ? {} : { indexFiles });
      try {
        assert.equal((await ctx.adapter().build(ctx.project, { detached: false })).state, 'fresh');
      } finally {
        await ctx.dispose();
      }
    }
  });
});

describe('05-B1 index build refusals', () => {
  const rows: [string, Parameters<typeof setup>[0], string][] = [
    ['binary first, though the directory is not ignored', { binary: null, ignored: false }, 'index-unavailable'],
    ['no indexable file next, though the directory is not ignored', { indexFiles: 0, ignored: false }, 'index-unavailable'],
    ['the ignore line last', { ignored: false }, 'index-not-ignored'],
  ];
  for (const [title, options, code] of rows) {
    it(`05-B1: ${title}; nothing is created`, async () => {
      const ctx = await setup(options);
      try {
        await assert.rejects(runIndexBuild(ctx.deps, ctx.project), (error: Error & { code?: string }) => error.code === code);
        assert.ok(!(await exists(path.join(ctx.repo.root, '.ambicode'))));
        assert.equal(ctx.runner.requests.length, 0);
      } finally {
        await ctx.dispose();
      }
    });
  }

  it('05-B1: an ignored directory builds', async () => {
    const ctx = await setup();
    try {
      assert.equal((await runIndexBuild(ctx.deps, ctx.project)).state, 'fresh');
    } finally {
      await ctx.dispose();
    }
  });

  it('05-B1: search.index none builds nothing', async () => {
    const ctx = await setup();
    try {
      const status = await runIndexBuild({ ...ctx.deps, config: { search: { index: 'none' } } as never }, ctx.project);
      assert.equal(status.state, 'none');
      assert.equal(ctx.runner.requests.length, 0);
    } finally {
      await ctx.dispose();
    }
  });
});

describe('05-B2 build', () => {
  it('05-B2: building.json while it runs, then the marker with HEAD and builtMs, and the file is gone', async () => {
    const ctx = await setup();
    try {
      let during: Record<string, unknown> = {};
      ctx.runner.respond = async () => {
        during = JSON.parse(await readFile(path.join(ctx.indexDir, 'building.json'), 'utf8')) as Record<string, unknown>;
        return {};
      };
      const status = await ctx.adapter().build(ctx.project, { detached: false });
      assert.equal(during['pid'], process.pid);
      assert.equal(during['startedAt'], new Date(ctx.time.now).toISOString());
      const written = JSON.parse(await readFile(path.join(ctx.indexDir, 'ambicode-index.json'), 'utf8')) as Record<string, unknown>;
      assert.deepEqual(Object.keys(written).sort(), ['builtAt', 'builtMs', 'dirty', 'head', 'tool']);
      assert.deepEqual(written['dirty'], {});
      assert.equal(written['head'], await ctx.repo.git.revParse('HEAD'));
      assert.ok((written['builtMs'] as number) > 0);
      assert.ok(!(await exists(path.join(ctx.indexDir, 'building.json'))));
      assert.deepEqual([status.state, status.builtMs], ['fresh', written['builtMs']]);
    } finally {
      await ctx.dispose();
    }
  });

  it('05-B2: a failure keeps the old marker, removes building.json and throws index-build-failed', async () => {
    const ctx = await setup();
    try {
      await marker(ctx, { builtMs: 5 });
      const before = await readFile(path.join(ctx.indexDir, 'ambicode-index.json'), 'utf8');
      const rows: [Partial<ProcessOutcome>, RegExp, string[]][] = [
        [{ exitCode: 3, stderr: 'first\nboom boom\n' }, /exited 3/, ['boom boom']],
        [{ kind: 'timed-out', exitCode: null }, /timed out after 600000 ms/, []],
      ];
      for (const [respond, message, details] of rows) {
        ctx.runner.respond = () => respond;
        await assert.rejects(ctx.adapter().build(ctx.project, { detached: false }), (error: Error & { code?: string; details?: string[] }) => error.code === 'index-build-failed' && message.test(error.message) && JSON.stringify(error.details) === JSON.stringify(details));
        assert.equal(await readFile(path.join(ctx.indexDir, 'ambicode-index.json'), 'utf8'), before);
        assert.ok(!(await exists(path.join(ctx.indexDir, 'building.json'))));
      }
    } finally {
      await ctx.dispose();
    }
  });
});

describe('05-B3 status', () => {
  const commitFiles = async (ctx: Context, count: number): Promise<void> => {
    for (let n = 0; n < count; n++) await ctx.repo.write(`src/n${n}.ts`, `export const n${n} = ${n};\n`);
    await ctx.repo.commitAll('more');
  };
  const rows: [string, (ctx: Context) => Promise<void>, string, number | null, number | null][] = [
    ['a live pid', (ctx) => building(ctx, { pid: 4242, startedAt: isoAgo(ctx, 600_000) }), 'building', null, null],
    ['no pid, started 30 s ago', (ctx) => building(ctx, { pid: null, startedAt: isoAgo(ctx, 30_000) }), 'building', null, null],
    ['no pid, started 90 s ago', (ctx) => building(ctx, { pid: null, startedAt: isoAgo(ctx, 90_000) }), 'absent', null, null],
    ['nothing', async () => undefined, 'absent', null, null],
    ['a marker for HEAD on a clean tree', (ctx) => marker(ctx), 'fresh', 321, 0],
    ['a marker two commits back, two files changed', async (ctx) => {
      await marker(ctx);
      await commitFiles(ctx, 1);
      await ctx.repo.write('src/a.ts', 'export const a = 2;\n');
      await ctx.repo.commitAll('edit');
    }, 'fresh', 321, 2],
    ['a marker with 21 files changed or added since', async (ctx) => {
      await marker(ctx);
      await commitFiles(ctx, 20);
      await ctx.repo.write('src/untracked.ts', 'export const u = 1;\n');
    }, 'stale', 321, 21],
    ['a marker on a new branch back at the indexed state', async (ctx) => {
      await marker(ctx);
      const head = await ctx.repo.git.revParse('HEAD');
      await commitFiles(ctx, 25);
      await ctx.repo.run(['git', 'checkout', '-q', '-b', 'other', head!]);
    }, 'fresh', 321, 0],
    ['a marker whose commit does not exist', (ctx) => marker(ctx, { head: 'f'.repeat(40) }), 'stale', 321, null],
  ];
  for (const [title, arrange, state, builtMs, drift] of rows) {
    it(`05-B3: ${title} is ${state}`, async () => {
      const ctx = await setup({ alive: (pid) => pid === 4242 });
      try {
        await arrange(ctx);
        const status = await ctx.adapter().status(ctx.project);
        assert.deepEqual([status.state, status.fresh, status.builtMs, status.drift], [state, state === 'fresh', builtMs, drift]);
      } finally {
        await ctx.dispose();
      }
    });
  }

  it('05-B3: search.indexDriftFiles sets the limit; files outside a subdirectory project do not count', async () => {
    const strict = await setup({ driftFiles: 0 });
    const scoped = await setup({ driftFiles: 0, root: 'pkg' });
    try {
      await marker(strict);
      await strict.repo.write('src/a.ts', 'export const a = 3;\n');
      assert.equal((await strict.adapter().status(strict.project)).state, 'stale');
      await marker(scoped);
      await scoped.repo.write('src/a.ts', 'export const a = 3;\n');
      assert.equal((await scoped.adapter().status(scoped.project)).state, 'fresh');
    } finally {
      await strict.dispose();
      await scoped.dispose();
    }
  });

  it('05-B3: drift is measured against the contents the build indexed, uncommitted ones included', async () => {
    const ctx = await setup({ driftFiles: 0 });
    try {
      await ctx.repo.write('src/a.ts', 'export const a = 2;\n');
      await ctx.repo.write('src/new.ts', 'export const n = 1;\n');
      const built = await ctx.adapter().build(ctx.project, { detached: false });
      assert.deepEqual([built.state, built.drift], ['fresh', 0]);
      await ctx.repo.run(['git', 'restore', 'src/a.ts']);
      assert.deepEqual(await ctx.adapter().status(ctx.project).then((status) => [status.state, status.drift]), ['stale', 1]);
      await ctx.repo.write('src/a.ts', 'export const a = 2;\n');
      assert.equal((await ctx.adapter().status(ctx.project)).drift, 0);
      await ctx.repo.write('src/new.ts', 'export const n = 2;\n');
      assert.equal((await ctx.adapter().status(ctx.project)).drift, 1);
    } finally {
      await ctx.dispose();
    }
  });

  it('05-B3: more uncommitted files than the record holds leave the indexed contents unknown: stale', async () => {
    const ctx = await setup();
    try {
      await marker(ctx, { dirty: null });
      assert.deepEqual(await ctx.adapter().status(ctx.project).then((status) => [status.state, status.drift]), ['stale', null]);
    } finally {
      await ctx.dispose();
    }
  });

  it('05-B3: a failed rebuild keeps the marker, so the status stays what the drift says', async () => {
    const ctx = await setup();
    try {
      await ctx.adapter().build(ctx.project, { detached: false });
      ctx.runner.respond = () => ({ exitCode: 3 });
      await assert.rejects(ctx.adapter().build(ctx.project, { detached: false }));
      assert.equal((await ctx.adapter().status(ctx.project)).state, 'fresh');
    } finally {
      await ctx.dispose();
    }
  });

  it('05-B3: tool none, then a missing binary, are decided before any file', async () => {
    const none = await setup();
    const missing = await setup({ binary: null });
    try {
      await marker(missing);
      assert.equal((await missing.adapter().status(missing.project)).state, 'error');
      const status = await runIndexBuild({ ...none.deps, config: { search: { index: 'none' } } as never }, none.project);
      assert.deepEqual([status.tool, status.state], ['none', 'none']);
    } finally {
      await none.dispose();
      await missing.dispose();
    }
  });
});

describe('05-B4 05-B5 startIndexBuild and refreshIndex', () => {
  const spawned = (ctx: Context): ProcessRequest[] => ctx.runner.requests.filter((request) => request.output === 'detached');

  it('05-B4: spawns [...selfArgv, index, build, --project, id] detached and returns building without waiting', async () => {
    const ctx = await setup();
    try {
      const status = await startIndexBuild(ctx.deps, ctx.project);
      assert.equal(status.state, 'building');
      assert.deepEqual(spawned(ctx).map((request) => request.argv), [[...SELF, 'index', 'build', '--project', 'app']]);
      const written = JSON.parse(await readFile(path.join(ctx.indexDir, 'building.json'), 'utf8')) as Record<string, unknown>;
      assert.equal(written['pid'], null);
    } finally {
      await ctx.dispose();
    }
  });

  it('05-B4: does nothing when none, building or fresh', async () => {
    const none = await setup();
    const busy = await setup();
    const fresh = await setup();
    try {
      assert.equal((await startIndexBuild({ ...none.deps, config: { search: { index: 'none' } } as never }, none.project)).state, 'none');
      await building(busy, { pid: null, startedAt: isoAgo(busy, 1000) });
      assert.equal((await startIndexBuild(busy.deps, busy.project)).state, 'building');
      await marker(fresh);
      assert.equal((await startIndexBuild(fresh.deps, fresh.project)).state, 'fresh');
      for (const ctx of [none, busy, fresh]) assert.equal(ctx.runner.requests.length, 0);
    } finally {
      await Promise.all([none, busy, fresh].map((ctx) => ctx.dispose()));
    }
  });

  it('05-B4: not ignored, no binary or no indexable file spawn nothing and return error with the reason', async () => {
    const rows: [Parameters<typeof setup>[0], RegExp][] = [
      [{ ignored: false }, /not ignored/],
      [{ binary: null }, /codeindex not found/],
      [{ indexFiles: 0 }, /indexes no file/],
    ];
    for (const [options, reason] of rows) {
      const ctx = await setup(options);
      try {
        const status: IndexStatus = await startIndexBuild(ctx.deps, ctx.project);
        assert.equal(status.state, 'error');
        assert.match(status.reason!, reason);
        assert.equal(ctx.runner.requests.length, 0);
        assert.ok(!(await exists(path.join(ctx.indexDir, 'building.json'))));
      } finally {
        await ctx.dispose();
      }
    }
  });

  it('05-B5: refreshIndex spawns when the index is fresh', async () => {
    const ctx = await setup();
    try {
      await marker(ctx);
      assert.equal((await refreshIndex(ctx.deps, ctx.project)).state, 'building');
      assert.equal(spawned(ctx).length, 1);
    } finally {
      await ctx.dispose();
    }
  });
});
