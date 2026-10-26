import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertPrintedAgrees, funnel, halvesOf, indexMetaOf, ledgerMapOf, mapOf, mean, promptOf } from './map-bench.mjs';
import { reachedBy, retrievalCounts } from './map-funnel.mjs';

test('promptOf drops front matter and the contract line', () => {
  const md = '---\nname: x\n---\n\nTitle\n\nBody line\n\nDo not change anything. Return files.\n';
  assert.equal(promptOf(md), 'Title\n\nBody line');
});

test('mapOf reads the ranked candidates', () => {
  const doc = { candidates: [['x/a.ts', 3, []], ['y/b.ts', 2, []]] };
  const out = mapOf(`head\n## map\nlayers: shortlist\n${JSON.stringify(doc)}\ntail`);
  assert.deepEqual(out, { files: ['x/a.ts', 'y/b.ts'] });
  assert.equal(mapOf('no map here'), null);
});

test('ledgerMapOf reads the terms and candidate count of the last map entry', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'map-bench-ledger-'));
  try {
    mkdirSync(path.join(dir, '.ambicode', 'tasks', 't'), { recursive: true });
    writeFileSync(path.join(dir, '.ambicode', 'tasks', 't', 'ledger.jsonl'), `${JSON.stringify({ kind: 'step' })}\n${JSON.stringify({ kind: 'map', terms: { pass1: ['a', 'b'], pass2: [] }, candidates: 9 })}\n`);
    assert.deepEqual(ledgerMapOf(dir, 't'), { terms: ['a', 'b'], candidates: 9 });
    assert.equal(ledgerMapOf(dir, 'missing'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('funnel counts truth folders with a file at or below them', () => {
  const truth = { relevant: ['a/b/', 'c/d.ts', 'e/f/g.ts'] };
  assert.deepEqual(funnel(truth, ['a/b/x/y.ts', 'c/z.ts']), { hit: 2, total: 3 });
});

test('assertPrintedAgrees names the case whose funnel printed a different number of files', () => {
  assert.doesNotThrow(() => assertPrintedAgrees([{ case: 'a', files: 3 }], [{ case: 'a', printed: 3 }]));
  assert.throws(() => assertPrintedAgrees([{ case: 'a', files: 3 }], [{ case: 'a', printed: 4 }]), /a: funnel printed 4 files, the bench row has 3/);
  assert.throws(() => assertPrintedAgrees([{ case: 'a', files: 3 }], []), /a: no funnel row/);
});

test('mean ignores null', () => {
  assert.equal(mean([1, null, 0]), 0.5);
  assert.equal(mean([null]), null);
});

test('halvesOf sorts by target-folder count and alternates, so each half holds one of the two widest cases', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'halves-'));
  try {
    const sizes = { a: 1, b: 45, c: 42, d: 3, e: 16, f: 15 };
    for (const [name, size] of Object.entries(sizes)) {
      mkdirSync(path.join(dir, name));
      writeFileSync(path.join(dir, name, 'truth.json'), JSON.stringify({ relevant: Array.from({ length: size }, (_, at) => `f${at}/x.ts`) }));
    }
    const halves = halvesOf(dir, Object.keys(sizes));
    assert.deepEqual(Object.fromEntries(halves), { b: 'tune', c: 'hold', e: 'tune', f: 'hold', d: 'tune', a: 'hold' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reachedBy marks a target retrieved by a retrieved or neighbour reason, and label-only when a label is its only retrieved item', () => {
  assert.deepEqual(reachedBy(['term "refund"']), { retrieved: false, label: false, labelOnly: false });
  assert.deepEqual(reachedBy(['retrieved: path "refund", label "Return shipment"']), { retrieved: true, label: true, labelOnly: false });
  assert.deepEqual(reachedBy(['retrieved: label "Return shipment"']), { retrieved: true, label: true, labelOnly: true });
  assert.deepEqual(reachedBy(['neighbour of src/a']), { retrieved: true, label: false, labelOnly: false });
  const rows = [{ targets: [reachedBy(['retrieved: label "x"']), reachedBy(['retrieved: name "Y"'])] }, { targets: [reachedBy([])] }];
  assert.deepEqual(retrievalCounts(rows), { retrieved: 2, label: 1, labelOnly: 1 });
});

test('indexMetaOf reads the meta row of the search index and is null without one', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'index-meta-'));
  try {
    assert.equal(indexMetaOf(dir), null);
    mkdirSync(path.join(dir, '.ambicode', 'context', 'search'), { recursive: true });
    writeFileSync(path.join(dir, '.ambicode', 'context', 'search', 'folders.jsonl'), `${JSON.stringify({ kind: 'meta', head: 'abc', buildMs: 12, folders: 3, files: 7, roots: [] })}\n{"path":"src/a"}\n`);
    assert.deepEqual(indexMetaOf(dir), { head: 'abc', buildMs: 12, folders: 3, files: 7 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
