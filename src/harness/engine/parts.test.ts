import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { workParts } from './parts.ts';

const PART_BUDGET_BYTES = 32 * 1024;

const name = (at: number): string => (at === 0 ? 'work-x.md' : `work-x-${at + 1}.md`);
const STAMP = '<!-- ambicode work: task/x, task t -->';
const lines = (count: number, tag: string): string => Array.from({ length: count }, (_, at) => `${tag} line ${at}`).join('\n');
const bytes = (text: string): number => Buffer.byteLength(text);

describe('workParts', () => {
  it('a small payload is one file: the stamp, the sections joined by a blank line, a newline', () => {
    assert.deepEqual(workParts(['## a\none', '## b\ntwo'], STAMP, name), [`${STAMP}\n\n## a\none\n\n## b\ntwo\n`]);
  });

  it('a section that does not fit the room left but fits a part starts the next part, whole', () => {
    const big = (tag: string): string => `## ${tag}\n${lines(2000, tag)}`;
    const parts = workParts(['## a\nfirst', big('b1'), big('b2'), big('b3'), '## z\nlast'], STAMP, name);
    assert.equal(parts.length, 3);
    assert.ok(parts.every((part) => bytes(part) <= PART_BUDGET_BYTES));
    assert.ok(parts[0]!.includes('## a\nfirst') && parts[0]!.includes('## b1\n') && !parts[0]!.includes('b2 line'));
    assert.ok(parts[1]!.includes('## b2\n') && !parts[1]!.includes('## b3'));
    assert.ok(parts[2]!.includes('## b3\n') && parts[2]!.includes('## z\nlast'));
    assert.ok(parts.every((part) => !part.includes('(continued)')), 'no section was split');
  });

  it('a section larger than a part is split on line boundaries and every line survives once', () => {
    const parts = workParts([`## huge\n${lines(6000, 'huge')}`], STAMP, name);
    assert.ok(parts.length >= 3);
    assert.ok(parts.every((part) => bytes(part) <= PART_BUDGET_BYTES));
    assert.ok(parts.slice(1).every((part) => part.includes('## huge (continued)\n')));
    const seen = parts.join('\n').split('\n').filter((line) => /^huge line \d+$/.test(line));
    assert.deepEqual(seen, Array.from({ length: 6000 }, (_, at) => `huge line ${at}`));
  });

  it('one line longer than the room is split at the room: no part exceeds the budget and every byte survives once', () => {
    for (const unit of ['q', 'é']) {
      const parts = workParts([`## wide\n${unit.repeat(40 * 1024)}`], STAMP, name);
      assert.ok(parts.length >= 2, unit);
      assert.ok(parts.every((part) => bytes(part) <= PART_BUDGET_BYTES), `${unit}: ${parts.map(bytes)}`);
      assert.equal(parts.join('').split(unit).length - 1, 40 * 1024, `${unit}: no character lost or cut`);
    }
  });

  it('the first part lists every part and says to read them in order; each part points at the next', () => {
    const parts = workParts([`## huge\n${lines(6000, 'huge')}`], STAMP, name);
    const names = parts.map((_, at) => name(at)).join(', ');
    assert.ok(parts[0]!.includes(`This work file has ${parts.length} parts: ${names}. Read every part, in order`));
    parts.forEach((part, at) => assert.equal(part.includes(`(continued in ${name(at + 1)}, part ${at + 2} of ${parts.length})`), at < parts.length - 1));
  });
});
