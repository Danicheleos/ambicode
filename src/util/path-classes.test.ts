import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { autoLoaded, TEST_CASE_PATTERN } from './path-classes.ts';

describe('TEST_CASE_PATTERN', () => {
  it('matches the line that declares one test case and not a group, a hook or a fixture', () => {
    const cases = ["it('a', () => {", 'it.only("a", () => {', 'test.skip("a", async () => {', 'it.each([1])("a", () => {', 'xit("a", () => {', 'fit("a", () => {', 'it "totals" do', "it 'totals' do",
      'def test_total(self):', 'async def test_total():', '@Test', '#[test]', 'func TestTotal(t *testing.T) {', 'func (s *Suite) TestTotal() {'];
    for (const line of cases) assert.equal(TEST_CASE_PATTERN.test(line), true, line);
    const others = ["describe('a', () => {", 'test.describe("a", () => {', 'test.describe.serial("a", () => {', 'test.beforeEach(async () => {', 'test.afterEach(() => {', 'test.beforeAll(() => {', 'test.afterAll(() => {', 'test.use({ x: 1 });', 'test.step("a", async () => {',
      'const it = 1;', 'item(1)', 'def helper():', 'func helper() {', 'func (s *Suite) SetupTest() {', '// it("a")', 'expect(it).toBe(1)'];
    for (const line of others) assert.equal(TEST_CASE_PATTERN.test(line), false, line);
  });
});

describe('autoLoaded', () => {
  it('judges a CLAUDE.md at any depth and the root .claude/rules tree as loaded, and near misses as not', () => {
    for (const file of ['CLAUDE.md', 'docs/CLAUDE.md', 'CLAUDE.local.md', '.claude/rules/a.md']) assert.equal(autoLoaded(file), true, file);
    for (const file of ['docs/CLAUDE.md.bak', 'MYCLAUDE.md', 'AGENTS.md', 'x/.claude/rules/a.md']) assert.equal(autoLoaded(file), false, file);
  });
});
