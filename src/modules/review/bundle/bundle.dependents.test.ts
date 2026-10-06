import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRuntime } from '#composition/root';
import { findDependents } from '#modules/search/declarations/dependents';
import { CONFIG } from '#testing/fixtures/route-fixture';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { assembleBundle } from './bundle.ts';
import { MAX_DEPENDENTS } from '#types/modules/search';
import type { ProcessOutcome, ProcessRequest, ProcessRunner } from '#types/platform/ports';

interface Script { importers: string[]; fail: boolean; calls: string[] }

class IndexRunner implements ProcessRunner {
  readonly script: Script = { importers: [], fail: false, calls: [] };
  private readonly real: ProcessRunner;
  constructor(real: ProcessRunner) {
    this.real = real;
  }
  async run(request: ProcessRequest): Promise<ProcessOutcome> {
    if (!request.argv[0]?.endsWith('codeindex')) return this.real.run(request);
    this.script.calls.push(request.argv[1] ?? '');
    const base = { kind: 'exited' as const, truncated: false, durationMs: 1, failure: null };
    if (this.script.fail) return { ...base, exitCode: 1, stdout: '', stderr: 'boom' };
    return { ...base, exitCode: 0, stdout: JSON.stringify({ files: this.script.importers.map((rel) => ({ rel, depth: 1 })) }), stderr: '' };
  }
}

const LIB = 'export function computeTotal(a: number) {\n  return a;\n}\n';
const USERS = ['src/user1.ts', 'src/user2.ts', 'src/user3.ts'];

async function withBundle(
  options: { index: 'none' | 'codeindex'; collide?: boolean; users?: number },
  body: (run: () => ReturnType<typeof assembleBundle>, repo: TempRepo, runner: IndexRunner) => Promise<void>,
): Promise<void> {
  const repo = await TempRepo.create();
  try {
    await repo.write('.gitignore', 'node_modules/\n.ambicode/index/\n');
    await repo.write('.ambicode/config.yaml', `${CONFIG}\nsearch: { index: ${options.index} }\n`);
    await repo.write('package.json', '{"name":"app"}\n');
    await repo.write('src/lib.ts', LIB);
    const users = Array.from({ length: options.users ?? USERS.length }, (_, i) => `src/user${i + 1}.ts`);
    for (const user of users) await repo.write(user, `import { computeTotal } from '../../../review/lib';\nexport const v${user.length} = computeTotal(1);\n`);
    for (let i = 0; i < 12; i += 1) await repo.write(`lib/filler${i}.ts`, `export const filler${i} = ${i};\n`);
    if (options.collide === true) await repo.write('src/other.ts', 'export function computeTotal(a: number) {\n  return a + 1;\n}\n');
    await repo.commitAll('base');
    await repo.write('src/lib.ts', 'export function computeTotal(a: number, b = 2) {\n  return a * b;\n}\n');
    if (options.index === 'codeindex') {
      const binary = path.join(repo.root, 'node_modules', '.bin', 'codeindex');
      await mkdir(path.dirname(binary), { recursive: true });
      await writeFile(binary, '#!/bin/sh\n');
      await chmod(binary, 0o755);
      await mkdir(path.join(repo.root, '.ambicode', 'index'), { recursive: true });
      const head = (await repo.run(['git', 'rev-parse', 'HEAD'])).trim();
      await writeFile(path.join(repo.root, '.ambicode', 'index', 'ambicode-index.json'), JSON.stringify({ tool: 'codeindex', head, builtMs: 5, dirty: {} }));
    }
    const runner = new IndexRunner(repo.runner);
    runner.script.importers = users;
    const runtime = await createRuntime({ cwd: repo.root, runner });
    const run = () => assembleBundle({ runtime, target: { kind: 'working' }, requirementUrls: [], evidence: null, approvals: new Set(), declines: new Set(), task: null });
    await body(run, repo, runner);
  } finally {
    await repo.dispose();
  }
}

describe('bundle dependents (08-D)', () => {
  it('08-D1: with index none the dependents are byte-identical to the name search and the index is not asked', async () => {
    await withBundle({ index: 'none' }, async (run, repo, runner) => {
      const bundle = await run();
      const git = repo.git;
      const direct = await findDependents({ git, projects: bundle.policies.map(({ project }) => project), files: bundle.files });
      assert.ok(direct.dependents.length > 0);
      assert.equal(JSON.stringify(bundle.dependents), JSON.stringify(direct.dependents));
      assert.deepEqual(runner.script.calls, []);
      assert.ok(!bundle.result.omissions.some((line) => line.startsWith('index unavailable')));
    });
  });

  it('08-D2: a fresh index supplies importers with the index reason, in place of the name search', async () => {
    await withBundle({ index: 'codeindex' }, async (run, _repo, runner) => {
      const bundle = await run();
      assert.deepEqual(bundle.dependents.map((entry) => entry.path), USERS);
      for (const entry of bundle.dependents) assert.deepEqual(entry.reasons, ['imports src/lib.ts (index)']);
      assert.deepEqual(runner.script.calls, ['impact']);
    });
  });

  it('08-D2: importers are capped at MAX_DEPENDENTS', async () => {
    await withBundle({ index: 'codeindex', users: MAX_DEPENDENTS + 4 }, async (run) => {
      const bundle = await run();
      assert.equal(bundle.dependents.length, MAX_DEPENDENTS);
    });
  });

  it('08-D2: an adapter error falls back to the name search and adds the omission', async () => {
    await withBundle({ index: 'codeindex' }, async (run, repo, runner) => {
      runner.script.fail = true;
      const bundle = await run();
      assert.ok(bundle.result.omissions.includes('index unavailable: codeindex impact exited 1: boom; dependents by name search'));
      const direct = await findDependents({ git: repo.git, projects: bundle.policies.map(({ project }) => project), files: bundle.files });
      assert.equal(JSON.stringify(bundle.dependents), JSON.stringify(direct.dependents));
    });
  });

  it('08-D2: an absent index binary is unavailable too and the name search still answers', async () => {
    await withBundle({ index: 'codeindex' }, async (run, repo) => {
      await repo.run(['rm', '-rf', 'node_modules']);
      const bundle = await run();
      assert.ok(bundle.result.omissions.some((line) => /^index unavailable: .*; dependents by name search$/.test(line)));
      assert.ok(bundle.dependents.length > 0);
    });
  });

  it('08-D3: a term declared in more than one file adds the verify-import reason', async () => {
    await withBundle({ index: 'none', collide: true }, async (run) => {
      const bundle = await run();
      assert.ok(bundle.dependents.length > 0);
      for (const entry of bundle.dependents) assert.ok(entry.reasons.includes('verify import: computeTotal is declared in more than one file'), entry.path);
    });
  });

  it('08-D3: a term declared once carries no verify-import reason', async () => {
    await withBundle({ index: 'none' }, async (run) => {
      const bundle = await run();
      for (const entry of bundle.dependents) assert.ok(!entry.reasons.some((reason) => reason.startsWith('verify import')));
    });
  });

  it('08-D4: no module of the review path imports refs, a language service or LSP', async () => {
    const groups = ['bundle', 'findings', 'reviewer'].map((group) => `src/modules/review/${group}`);
    const files = [...(await Promise.all(groups.map(async (group) => (await readdir(group)).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts')).map((name) => `${group}/${name}`)))).flat(), 'src/cli/commands/review/review.ts'];
    for (const file of files) {
      const imports = [...(await readFile(file, 'utf8')).matchAll(/from '([^']+)'/g)].map((match) => match[1]!);
      assert.deepEqual(imports.filter((source) => /refs|lsp|language/i.test(source)), [], file);
    }
  });
});
