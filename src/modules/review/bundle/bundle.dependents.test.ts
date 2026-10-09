import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRuntime } from '#composition/root';
import { findDependents } from './dependents.ts';
import { CONFIG } from '#testing/fixtures/route-fixture';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { assembleBundle } from './bundle.ts';

const LIB = 'export function computeTotal(a: number) {\n  return a;\n}\n';

async function withBundle(
  options: { collide?: boolean },
  body: (run: () => ReturnType<typeof assembleBundle>, repo: TempRepo) => Promise<void>,
): Promise<void> {
  const repo = await TempRepo.create();
  try {
    await repo.write('.gitignore', 'node_modules/\n');
    await repo.write('.ambicode/config.yaml', CONFIG);
    await repo.write('package.json', '{"name":"app"}\n');
    await repo.write('src/lib.ts', LIB);
    for (let i = 1; i <= 3; i += 1) await repo.write(`src/user${i}.ts`, `import { computeTotal } from './lib';\nexport const v${i} = computeTotal(1);\n`);
    for (let i = 0; i < 12; i += 1) await repo.write(`lib/filler${i}.ts`, `export const filler${i} = ${i};\n`);
    if (options.collide === true) await repo.write('src/other.ts', 'export function computeTotal(a: number) {\n  return a + 1;\n}\n');
    await repo.commitAll('base');
    await repo.write('src/lib.ts', 'export function computeTotal(a: number, b = 2) {\n  return a * b;\n}\n');
    const runtime = await createRuntime({ cwd: repo.root, runner: repo.runner });
    const run = () => assembleBundle({ runtime, target: { kind: 'working' }, requirementUrls: [], evidence: null, approvals: new Set(), declines: new Set(), task: null });
    await body(run, repo);
  } finally {
    await repo.dispose();
  }
}

describe('bundle dependents (08-D)', () => {
  it('08-D1: the dependents are the name search over what the change declares', async () => {
    await withBundle({}, async (run, repo) => {
      const bundle = await run();
      const direct = await findDependents({ git: repo.git, projects: bundle.policies.map(({ project }) => project), files: bundle.files });
      assert.deepEqual(bundle.dependents.map((entry) => entry.path), ['src/user1.ts', 'src/user2.ts', 'src/user3.ts']);
      assert.equal(JSON.stringify(bundle.dependents), JSON.stringify(direct.dependents));
      assert.ok(!bundle.result.omissions.some((line) => line.startsWith('index')));
    });
  });

  it('08-D3: a term declared in more than one file adds the verify-import reason', async () => {
    await withBundle({ collide: true }, async (run) => {
      const bundle = await run();
      assert.ok(bundle.dependents.length > 0);
      for (const entry of bundle.dependents) assert.ok(entry.reasons.includes('verify import: computeTotal is declared in more than one file'), entry.path);
    });
  });

  it('08-D3: a term declared once carries no verify-import reason', async () => {
    await withBundle({}, async (run) => {
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
