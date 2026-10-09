import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changeLines, filesSection } from './change-lines.ts';

interface Fixtures {
  changeLines: { name: string; text: string; change: string; excluded: string }[];
  filesSection: { name: string; text: string; section: string | null }[];
}
const fixtures = JSON.parse(readFileSync(new URL('../../../evals/common/fixtures/change-lines.json', import.meta.url), 'utf8')) as Fixtures;

describe('change-lines: shared fixtures (the eval scorer runs the same file)', () => {
  for (const fixture of fixtures.changeLines) {
    it(`changeLines: ${fixture.name}`, () => {
      assert.deepEqual(changeLines(fixture.text), { change: fixture.change, excluded: fixture.excluded });
    });
  }
  for (const fixture of fixtures.filesSection) {
    it(`filesSection: ${fixture.name}`, () => assert.equal(filesSection(fixture.text), fixture.section));
  }
});
