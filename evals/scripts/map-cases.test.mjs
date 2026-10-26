import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCase, correctTruth, generate, renderPrompt } from './map-cases.mjs';
import { CASE_ORDER, ancestorShares } from './folder-truth.mjs';
import { promptOf } from './map-bench.mjs';

const benchFiles = ['app/a/one.ts', 'app/a/one.html', 'app/b/two.ts', 'app/c/three.ts', 'app/d/page.html', 'app/e/deep/four.ts', 'app/g/x.ts'];
const source = {
  truth: ['app/a/one.ts', 'app/a/new.ts', 'app/gone/old.ts', 'app/c/three.ts', 'app/c/three.html', 'app/d/page.html', 'app/d/page.scss', 'app/f/page.html', 'app/f/page.css', 'app/h/x.png', 'app/m/x.ts', 'app/e/deep/four.ts', 'app/g/x.html'],
  missingFromSnapshot: ['app/a/new.ts', 'app/f/page.html'],
};
const run = (relevant, allowed = []) => correctTruth({ relevant, allowed, source, benchFiles });

test('a tracked file is kept', () => {
  assert.deepEqual(run(['app/a/one.ts']), { relevant: ['app/a/one.ts'], allowed: [], dropped: [] });
});

test('an untracked file is dropped as created when the merge request added it, else removed', () => {
  const out = run(['app/a/new.ts', 'app/gone/old.ts']);
  assert.deepEqual(out.relevant, []);
  assert.deepEqual(out.dropped, [{ item: 'app/a/new.ts', reason: 'created' }, { item: 'app/gone/old.ts', reason: 'removed' }]);
});

test('a tracked file with a non-code extension is dropped as nonCode', () => {
  assert.deepEqual(run(['app/a/one.html', 'app/a/one.ts']), { relevant: ['app/a/one.ts'], allowed: [], dropped: [{ item: 'app/a/one.html', reason: 'nonCode' }] });
});

test('a directory that exists with code is kept even when the merge request only touched html there', () => {
  assert.deepEqual(run(['app/c/', 'app/e/', 'app/g/']).relevant, ['app/c/', 'app/e/', 'app/g/']);
});

test('a directory whose files at HEAD are all non-code is dropped as nonCode', () => {
  assert.deepEqual(run(['app/d/']).dropped, [{ item: 'app/d/', reason: 'nonCode' }]);
});

test('a directory absent at HEAD is dropped as created when the merge request added a file under it, else removed', () => {
  assert.deepEqual(run(['app/f/', 'app/m/']).dropped, [{ item: 'app/f/', reason: 'created' }, { item: 'app/m/', reason: 'removed' }]);
});

test('allowed keeps only what exists, files and directories', () => {
  assert.deepEqual(run([], ['app/b/two.ts', 'app/gone/old.ts', 'app/e/', 'app/m/']).allowed, ['app/b/two.ts', 'app/e/']);
});

test('buildCase derives the navigation truth from the source, recomputes ancestors from the kept items and records the correction', () => {
  const full = { ...source, truth: ['app/a/one.ts', 'app/a/new.ts', 'app/e/deep/four.ts', 'app/b/two.ts', 'app/b/two.spec.ts', 'app/gone/old.ts'] };
  const { truth, before } = buildCase({ id: '1', source: full, sourcePrompt: '---\nname: x\n---\nintro\n\n<ticket>\nTicket\n</ticket>\n', benchFiles, head: 'abc', branch: 'dev' });
  assert.equal(before, 5);
  assert.deepEqual(truth.relevant, ['app/a/one.ts', 'app/e/deep/four.ts', 'app/b/two.ts']);
  assert.deepEqual(truth.ancestors, ancestorShares(truth.relevant, benchFiles));
  assert.deepEqual(truth.allowed, []);
  assert.deepEqual(truth.dropped, [{ item: 'app/a/new.ts', reason: 'created' }, { item: 'app/gone/old.ts', reason: 'removed' }]);
  assert.deepEqual(truth.bench, { head: 'abc', branch: 'dev', files: benchFiles.length });
  assert.deepEqual([truth.name, truth.source, truth.level, truth.ancestorShare], ['fe-vs-1-map', 'files-block', 'folder', 0.3]);
});

test('renderPrompt keeps the ticket block and adds no instruction', () => {
  const text = renderPrompt('7', '---\nname: x\n---\nIn the repository, do this.\n\n<ticket>\nTitle\n\nBody\n</ticket>\n');
  assert.equal(text, '---\nname: fe-vs-7-map\ndescription: \'Scope of a real ticket in a real codebase (map bench).\'\ntags: ["map"]\n---\n\nTitle\n\nBody\n');
  assert.equal(promptOf(text), 'Title\n\nBody');
});

test('generate writes the cases numbered in CASE_ORDER and fails on a missing source truth', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'map-cases-'));
  try {
    const sources = path.join(root, 'sources');
    const out = path.join(root, 'out');
    assert.throws(() => generate({ sourcesDir: sources, outDir: out, benchFiles, head: 'h', branch: 'b' }), /source truth missing/);
    for (const id of CASE_ORDER) {
      mkdirSync(path.join(sources, `fe-vs-${id}-investigate`), { recursive: true });
      writeFileSync(path.join(sources, `fe-vs-${id}-investigate`, 'truth.json'), JSON.stringify(source));
      writeFileSync(path.join(sources, `fe-vs-${id}-investigate`, 'prompt.md'), `---\nname: x\n---\n\n<ticket>\nTicket ${id}\n</ticket>\n`);
    }
    const rows = generate({ sourcesDir: sources, outDir: out, benchFiles, head: 'h', branch: 'b' });
    assert.deepEqual(rows.map((row) => row.dir), CASE_ORDER.map((id, i) => `${String(i + 1).padStart(2, '0')}-fe-vs-${id}`));
    assert.equal(JSON.parse(readFileSync(path.join(out, '02-fe-vs-6141', 'truth.json'), 'utf8')).name, 'fe-vs-6141-map');
    assert.match(readFileSync(path.join(out, '02-fe-vs-6141', 'prompt.md'), 'utf8'), /^---\nname: fe-vs-6141-map\n[\s\S]*Ticket 6141\n$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
