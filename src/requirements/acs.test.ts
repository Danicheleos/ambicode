import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitAcs } from './acs.ts';

const EXPLICIT = 'Context\n- not an AC\n\n## Acceptance criteria\n- Cart shows total\n- Empty cart hides pay\n\n## Notes\n- other';
const BULLETS = 'The cart page:\n- shows the total\n1. hides pay when empty\n2) keeps the items after login';
const PROSE = 'Short. The cart total must include the shipping fee at checkout time. The page cannot reload while the payment is running.';

describe('04-A acceptance criteria', () => {
  it('04-A1: the first tier that yields a unit wins: a named section, then every bullet, then long normative sentences', () => {
    assert.deepEqual(splitAcs([{ key: 'ORD-17', content: EXPLICIT }]).map((unit) => unit.quote), ['Cart shows total', 'Empty cart hides pay']);
    assert.deepEqual(splitAcs([{ key: 'ORD-17', content: BULLETS }]).map((unit) => unit.quote), ['shows the total', 'hides pay when empty', 'keeps the items after login']);
    assert.deepEqual(splitAcs([{ key: 'ORD-17', content: PROSE }]).map((unit) => unit.quote), [
      'The cart total must include the shipping fee at checkout time.',
      'The page cannot reload while the payment is running.',
    ]);
    assert.deepEqual(splitAcs([{ key: 'ORD-17', content: 'Nothing normative here.' }]), []);
  });

  it('04-A1: a section heading may be a Markdown line, a bold line or a line ending in a colon, and AC and definition of done count', () => {
    for (const heading of ['# AC', '**Definition of done**', 'Acceptance criteria:']) {
      assert.deepEqual(splitAcs([{ key: 'K-1', content: `Intro\n- loose\n${heading}\n- one\n- two` }]).map((unit) => unit.quote), ['one', 'two'], heading);
    }
  });

  it('04-A2: ids are AC-<key>-<nn> in reading order, ARGS for an args envelope, and where names the tier', () => {
    assert.deepEqual(splitAcs([{ key: 'ORD-17', content: EXPLICIT }]), [
      { id: 'AC-ORD-17-01', key: 'ORD-17', quote: 'Cart shows total', where: 'section:Acceptance criteria' },
      { id: 'AC-ORD-17-02', key: 'ORD-17', quote: 'Empty cart hides pay', where: 'section:Acceptance criteria' },
    ]);
    assert.deepEqual(splitAcs([{ key: 'ARGS', content: '- first\n- second' }]).map((unit) => [unit.id, unit.where]), [['AC-ARGS-01', 'list'], ['AC-ARGS-02', 'list']]);
    assert.deepEqual(splitAcs([{ key: 'ORD-2', content: PROSE }]).map((unit) => unit.where), ['prose', 'prose']);
    const long = splitAcs([{ key: 'ORD-3', content: Array.from({ length: 101 }, (_, index) => `- item ${index + 1}`).join('\n') }]);
    assert.deepEqual([long[8]!.id, long[99]!.id], ['AC-ORD-3-09', 'AC-ORD-3-100']);
  });

  it('04-A3: the same texts in the same order give the same output; duplicates get their own ids; sources number independently', () => {
    const sources = [{ key: 'ORD-17', content: '- same\n- same' }, { key: 'ORD-18', content: '- other' }];
    assert.equal(JSON.stringify(splitAcs(sources)), JSON.stringify(splitAcs(sources)));
    assert.deepEqual(splitAcs(sources).map((unit) => unit.id), ['AC-ORD-17-01', 'AC-ORD-17-02', 'AC-ORD-18-01']);
  });

  it('04-A2: a long bullet keeps its whole trimmed text as the quote', () => {
    const long = 'The application must preserve the submitted values and keep the record visible while synchronization completes, except when the session has expired. '.repeat(3).trim();
    assert.equal(splitAcs([{ key: 'ORD-17', content: `- ${long}` }])[0]!.quote, long);
  });

  it('04-A1: a lowercase line ending in a colon ends the explicit section', () => {
    const units = splitAcs([{ key: 'ORD-17', content: 'Acceptance criteria:\n- Cart must reject invalid items\nnotes:\n- Existing migration is unrelated' }]);
    assert.deepEqual(units.map((unit) => unit.quote), ['Cart must reject invalid items']);
  });

  it('04-A1: a short colon heading such as "qa:" ends the explicit section', () => {
    const units = splitAcs([{ key: 'ORD-17', content: 'Acceptance criteria:\n- Cart must reject invalid items\nqa:\n- Run the existing migration smoke test' }]);
    assert.deepEqual(units.map((unit) => unit.quote), ['Cart must reject invalid items']);
  });
});
