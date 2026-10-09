import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DiffHunk } from '#types/platform/git';
import { excerptOf } from './snapshot.ts';

const hunk = (newStart: number, newLines: number): DiffHunk => ({ oldStart: newStart, oldLines: newLines, newStart, newLines, lines: [] });
const file = (count: number) => `${Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n')}\n`;

test('U09 an excerpt keeps the changed lines with numbered context and names what it left out', () => {
  const out = excerptOf(file(1000), [hunk(500, 2)], 'a.json', 999_999, 100_000);
  assert.ok(out);
  assert.equal(out.contextLines, 50);
  assert.match(out.text, /^\[AMBICODE excerpt of a\.json: the file is 999999 bytes/);
  assert.match(out.text, /\n {1}500\| line 500\n {1}501\| line 501\n/);
  assert.match(out.text, /\n\[lines 1-449 not mirrored\]\n/);
  assert.match(out.text, /\n\[lines 552-1000 not mirrored\]\n$/);
});

test('U09 far apart hunks leave a named gap and near ones merge', () => {
  const out = excerptOf(file(1000), [hunk(10, 1), hunk(12, 1), hunk(900, 1)], 'a.json', 1_000_000, 100_000);
  assert.ok(out);
  const narrow = excerptOf(file(1000), [hunk(10, 1), hunk(12, 1), hunk(900, 1)], 'a.json', 1_000_000, 700);
  assert.ok(narrow);
  assert.ok(narrow.contextLines < out.contextLines, 'a tight limit narrows the window');
  assert.match(narrow.text, /\[lines \d+-\d+ not mirrored\]/);
  assert.equal((narrow.text.match(/\| line 10\n/g) ?? []).length, 1, 'a merged window prints a line once');
  assert.ok(narrow.bytes <= 700);
});

test('U09 no hunks, or hunks that alone do not fit, give no excerpt', () => {
  assert.equal(excerptOf(file(10), [], 'a.json', 100, 10_000), null);
  assert.equal(excerptOf(file(1000), [hunk(1, 1000)], 'a.json', 100, 500), null);
});
