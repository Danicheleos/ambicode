import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { listContext, parseBundle, renderListing, tokensOf, writeContext } from './context.ts';

const LIMITS = { maxTotalTokens: 200, maxFileTokens: 50 };
const bundle = (...files: [string, string][]): string => files.map(([name, body]) => `=== ${name}\n${body}`).join('\n');
const OVERVIEW = '# Overview of x\n## Purpose\n- a tool\n';

async function sandbox(t: { after(fn: () => unknown): void }): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ambicode-context-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

describe('context write', () => {
  it('writes accepted kinds and lists them', async (t) => {
    const root = await sandbox(t);
    const out = await writeContext(nodeFileSystem, root, bundle(['overview.md', OVERVIEW], ['modules/search-map.md', '# Search map module\n']), LIMITS, false);
    assert.deepEqual(out.written, ['modules/search-map.md', 'overview.md']);
    assert.deepEqual(out.check.problems, []);
    const files = await listContext(nodeFileSystem, root);
    assert.deepEqual(files.map((file) => [file.path, file.title]), [['modules/search-map.md', 'Search map module'], ['overview.md', 'Overview of x']]);
    assert.match(renderListing(files, LIMITS), /total ~\d+ of 200 tokens/);
    assert.equal(renderListing([], LIMITS), 'no context: run /ambicode:init');
  });

  it('refuses paths outside the four kinds, code fences, per-file and total overflow, and writes nothing', async (t) => {
    const root = await sandbox(t);
    const cases: [string, [string, string][], string][] = [
      ['path', [['INDEX.md', '# i\n']], 'path'],
      ['path', [['modules/Bad_Name.md', '# i\n']], 'path'],
      ['code-fence', [['conventions.md', '# c\n```\nx\n```\n']], 'code-fence'],
      ['file-too-large', [['overview.md', `# o\n${'x'.repeat(400)}\n`]], 'file-too-large'],
    ];
    for (const [, files, kind] of cases) {
      const out = await writeContext(nodeFileSystem, root, bundle(...files), LIMITS, false);
      assert.ok(out.check.problems.some((problem) => problem.kind === kind), kind);
      assert.deepEqual(out.written, []);
    }
    const four = bundle(...['overview.md', 'navigation.md', 'conventions.md', 'modules/a.md', 'modules/b.md'].map((name, i): [string, string] => [name, `# T${i}\n${'y'.repeat(180)}\n`]));
    const out = await writeContext(nodeFileSystem, root, four, { maxTotalTokens: 200, maxFileTokens: 50 }, false);
    assert.ok(out.check.problems.some((problem) => problem.kind === 'total-too-large'));
    assert.deepEqual(await listContext(nodeFileSystem, root), []);
  });

  it('refuses duplicate H2 in a file and duplicate H1 across files, also against files already on disk', async (t) => {
    const root = await sandbox(t);
    const dup2 = await writeContext(nodeFileSystem, root, bundle(['overview.md', '# o\n## Purpose\n## Purpose\n']), LIMITS, false);
    assert.equal(dup2.check.problems[0]?.kind, 'duplicate-h2');
    const dup1 = await writeContext(nodeFileSystem, root, bundle(['overview.md', '# Same\n'], ['navigation.md', '# Same\n']), LIMITS, false);
    assert.equal(dup1.check.problems[0]?.kind, 'duplicate-h1');
    await writeContext(nodeFileSystem, root, bundle(['overview.md', '# Same\n']), LIMITS, false);
    const later = await writeContext(nodeFileSystem, root, bundle(['conventions.md', '# Same\n']), LIMITS, false);
    assert.equal(later.check.problems[0]?.kind, 'duplicate-h1');
  });

  it('--replace removes files not in the bundle; without it they stay', async (t) => {
    const root = await sandbox(t);
    await writeContext(nodeFileSystem, root, bundle(['overview.md', '# O\n'], ['modules/old.md', '# Old\n']), LIMITS, false);
    await writeContext(nodeFileSystem, root, bundle(['navigation.md', '# N\n']), LIMITS, false);
    assert.equal((await listContext(nodeFileSystem, root)).length, 3);
    const out = await writeContext(nodeFileSystem, root, bundle(['overview.md', '# O2\n']), LIMITS, true);
    assert.deepEqual(out.removed, ['modules/old.md', 'navigation.md']);
    assert.equal(await readFile(path.join(root, '.ambicode/context/overview.md'), 'utf8'), '# O2\n');
    assert.deepEqual((await listContext(nodeFileSystem, root)).map((file) => file.path), ['overview.md']);
  });

  it('rejects a bundle with text before the first header, duplicate paths, or nothing', () => {
    assert.throws(() => parseBundle('stray\n=== overview.md\n# x\n'));
    assert.throws(() => parseBundle('=== a.md\n=== a.md\n'));
    assert.throws(() => parseBundle(''));
    assert.equal(tokensOf('abcdefghi'), 3);
  });
});
