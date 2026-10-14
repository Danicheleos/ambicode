import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CALLERS_MAX_BYTES, CALLERS_MAX_NAMES, changedLines, nearestNames, renderCallers } from './callers.ts';
import type { Declaration } from '#types/modules/search';

const decl = (name: string, path: string, line: number): Declaration => ({ name, kind: 'function', path, line, declarations: 1 });
const PATCH = 'diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -10,3 +10,4 @@\n keep\n-old\n+new\n+more\n keep2\n@@ -40,2 +41,1 @@\n keep\n-gone\n';

describe('callers block', () => {
  it('changedLines lists added new-side lines and the line after a pure deletion', () => {
    assert.deepEqual(changedLines(PATCH), [{ path: 'a.js', lines: [11, 11, 12, 42] }]);
  });

  it('nearestNames takes the nearest declaration above each changed line, once per name', () => {
    const declared = new Map([['a.js', [decl('top', 'a.js', 1), decl('total', 'a.js', 8), decl('later', 'a.js', 30)]]]);
    assert.deepEqual(nearestNames(changedLines(PATCH), declared), [{ name: 'total', path: 'a.js', line: 8 }, { name: 'later', path: 'a.js', line: 30 }]);
    assert.deepEqual(nearestNames(changedLines(PATCH), new Map([['a.js', [decl('below', 'a.js', 50)]]])), [], 'no declaration above: no name');
  });

  it('nearestNames stops at the name cap', () => {
    const lines = Array.from({ length: 10 }, (_, index) => index * 10 + 5);
    const declared = new Map([['b.js', lines.map((line) => decl(`fn${line}`, 'b.js', line - 1))]]);
    assert.equal(nearestNames([{ path: 'b.js', lines }], declared).length, CALLERS_MAX_NAMES);
  });

  it('renderCallers lists hits per name, omits names without hits, and stays under the byte cap', () => {
    const names = [{ name: 'total', path: 'a.js', line: 8 }, { name: 'quiet', path: 'a.js', line: 30 }];
    assert.equal(renderCallers(names, new Map([['total', ['x/service.js:55', 'y/service.js:53']], ['quiet', []]])), '- total: x/service.js:55, y/service.js:53');
    assert.equal(renderCallers(names, new Map()), '');
    const many = Array.from({ length: 400 }, (_, index) => `some/long/path/module-${index}.js:${index + 1}`);
    const text = renderCallers(names, new Map([['total', many]]));
    assert.ok(Buffer.byteLength(text) <= CALLERS_MAX_BYTES);
    assert.match(text, /\(\+\d+ more\)$/);
  });
});
