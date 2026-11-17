import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { K12, generate, truthOf } from './map-k12-cases.mjs';
import { promptOf } from './map-bench.mjs';

test('five or more tickets, each plain: 2-6 sentences, no path, identifier or file name', () => {
  assert.ok(K12.length >= 5);
  for (const [id, sha, title, body] of K12) {
    const sentences = body.split(/(?<=\.)\s+/).length;
    assert.ok(sentences >= 2 && sentences <= 6, `${id}: ${sentences} sentences`);
    assert.match(sha, /^[0-9a-f]{7,}$/);
    for (const text of [title, body]) assert.doesNotMatch(text, /[\w-]+\/[\w-]+|\w+_\w+|\.py\b|\b[a-z]+[A-Z]\w*\b|\w+\(\)/, `${id}: identifier-like text`);
  }
});

test('truthOf drops tests, migrations, manual noise, created and removed files, and keeps tracked source', () => {
  const touched = [['M', 'src/a/x.py'], ['M', 'tests/a/test_x.py'], ['M', 'src/migrations/versions/m.py'], ['A', 'src/new/y.py'], ['M', 'src/gone/z.py'], ['M', 'src/b/w.py'], ['M', 'src/a/readme.md']];
  const out = truthOf({ touched, benchFiles: ['src/a/x.py', 'src/b/w.py', 'src/a/readme.md'], drops: { 'src/b/w.py': 'noise' } });
  assert.deepEqual(out.relevant, ['src/a/x.py']);
  assert.deepEqual(out.dropped.map((row) => [row.item, row.reason]), [['src/b/w.py', 'noise'], ['src/new/y.py', 'created'], ['src/gone/z.py', 'removed'], ['src/a/readme.md', 'nonCode']]);
});

test('generate writes a prompt and folder-level truth per ticket and refuses a ticket with no target left', () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'k12-cases-'));
  try {
    const touchedOf = () => [['M', 'src/a/x.py']];
    const rows = generate({ benchFiles: ['src/a/x.py'], head: 'abc', out, touchedOf });
    assert.equal(rows.length, K12.length);
    const dirs = readdirSync(out).sort();
    const truth = JSON.parse(readFileSync(path.join(out, dirs[0], 'truth.json'), 'utf8'));
    assert.deepEqual(truth.relevant, ['src/a/x.py']);
    assert.equal(truth.level, 'folder');
    assert.equal(truth.bench.head, 'abc');
    assert.match(promptOf(readFileSync(path.join(out, dirs[0], 'prompt.md'), 'utf8')), new RegExp(K12[0][2]));
    assert.throws(() => generate({ benchFiles: [], head: 'abc', out, touchedOf }), /no target left/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
