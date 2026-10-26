import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { downstreamCaseName, downstreamMetrics, downstreamTruth, isDownstreamCase, writeDownstream } from './downstream-cases.mjs';

const HEAD = 'a'.repeat(40);

// Made-up map cases: the real ones are NDA assets that are not in git.
function fixture(ids) {
  const root = mkdtempSync(path.join(tmpdir(), 'downstream-'));
  const maps = path.join(root, 'map');
  ids.forEach((id, at) => {
    const dir = path.join(maps, `${String(at + 1).padStart(2, '0')}-fe-vs-${id}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'prompt.md'), `---\nname: x\ntags: ["map"]\n---\n\nTicket ${id}: rename the widget\n`);
    writeFileSync(path.join(dir, 'truth.json'), JSON.stringify({ name: `fe-vs-${id}-map`, relevant: [`app/${id}/a.ts`, `app/${id}/dir/`], allowed: ['app/shared.ts'], dropped: [], bench: { head: HEAD, branch: 'dev', files: 3 } }));
  });
  return { root, maps, sources: { bench: path.join(root, "bench's repo"), context: path.join(root, 'ctx') } };
}
const read = (...parts) => readFileSync(path.join(...parts), 'utf8');
const answer = (text) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });

describe('downstream cases', () => {
  const ids = ['11', '22'];
  const { root, maps, sources } = fixture(ids);
  const rows = writeDownstream({ mapsDir: maps, evalsDir: root, sources, ids });
  const plugin = path.join(root, 'cases', 'downstream', '02-fe-vs-22-downstream');
  const bare = path.join(root, 'bare', 'downstream', '02-fe-vs-22-downstream');

  it('writes one case per id into both arms, with the truth counts', () => {
    assert.deepEqual(rows.map((row) => [row.id, row.relevant, row.allowed]), [['11', 2, 1], ['22', 2, 1]]);
    assert.ok(isDownstreamCase(downstreamCaseName('22')) && !isDownstreamCase('fe-vs-22-navigator'));
    for (const arm of [plugin, bare]) for (const file of ['case.yaml', 'scaffold.sh', 'prompt.md', 'truth.json', 'graders/files-section.md', 'graders/no-edit.md']) assert.ok(read(arm, file).length > 0, file);
  });

  it('the plugin prompt types the skill, the bare prompt does not, and both end with the same Files instruction and carry the ticket', () => {
    const body = (arm) => read(arm, 'prompt.md').replace(/^---[\s\S]*?---\n\n/, '');
    assert.ok(body(plugin).startsWith('/ambicode:investigate --task inv-22 '));
    for (const arm of [plugin, bare]) assert.doesNotMatch(body(arm).trim(), /\n/, 'one line');
    assert.doesNotMatch(read(bare, 'prompt.md'), /ambicode/);
    for (const arm of [plugin, bare]) {
      assert.match(body(arm), /Ticket 22: rename the widget/);
      assert.match(body(arm), /`## Files` section/);
      assert.match(read(arm, 'prompt.md'), /tags: \["downstream", "skill:investigate"\]\nruns: 3\nmax_turns: 40\n/);
    }
    assert.equal(body(plugin).replace('/ambicode:investigate --task inv-22 ', ''), body(bare));
  });

  it('only the plugin arm grades the route ledger and copies the bench config and context; both arms pin the bench head with no history', () => {
    assert.match(read(plugin, 'graders/route-done.md'), /target: \{ source: file, path: \.ambicode\/tasks\/inv-22\/ledger\.jsonl \}/);
    assert.match(read(plugin, 'graders/route-done.md'), /"kind":"exit"\[\^\\n\]\*"reason":"done"/);
    assert.throws(() => read(bare, 'graders/route-done.md'));
    assert.throws(() => read(plugin, 'graders/skill-called.md'));
    assert.match(read(plugin, 'scaffold.sh'), /cp -R '.*ctx' \.ambicode\/context/);
    assert.match(read(plugin, 'scaffold.sh'), /scripts\/ambicode\.mjs' context index/);
    assert.doesNotMatch(read(bare, 'scaffold.sh'), /\.ambicode/);
    for (const arm of [plugin, bare]) {
      const script = read(arm, 'scaffold.sh');
      assert.ok(script.includes(`archive --format=tar ${HEAD}`));
      assert.ok(script.includes("bench'\\''s repo'"), 'a quote in the bench path is escaped');
      assert.doesNotMatch(script, /git clone|mkdir repo|-C repo|cd repo/);
    }
  });

  it('truth.json is the file-level truth read from the Files section, found again by case name', () => {
    const truth = downstreamTruth('fe-vs-22-downstream', root);
    assert.deepEqual([truth.source, truth.level, truth.relevant, truth.allowed], ['files-section', 'file', ['app/22/a.ts', 'app/22/dir/'], ['app/shared.ts']]);
    assert.equal(downstreamTruth('fe-vs-99-downstream', root), null);
    assert.equal(downstreamTruth('fe-vs-22-navigator', root), null);
  });

  it('the files-section grader regex accepts a heading with paths and rejects other headings and prose', () => {
    const pattern = new RegExp(/pattern: '(.*)'\n/.exec(read(plugin, 'graders/files-section.md'))[1].replace(/''/g, "'"));
    assert.ok(pattern.test('Answer text\n\n## Files\n- app/22/a.ts\n- `app/22/dir/b.ts`\n'));
    assert.ok(pattern.test('x\n## Files\napp/22/a.ts'));
    assert.ok(!pattern.test('x\n## Files that look relevant\n- app/22/a.ts\n'));
    assert.ok(!pattern.test('The files are app/22/a.ts and more.'));
    assert.ok(!pattern.test('## Files\n\n## Notes\n'));
  });

  it('a blank line after the heading is valid markdown: 6292 run 1 at 0.6.26 (2026-10-26T03-53-34Z) failed files-section on it', () => {
    const pattern = new RegExp(/pattern: '(.*)'\n/.exec(read(plugin, 'graders/files-section.md'))[1].replace(/''/g, "'"));
    const final = '**Open points**\n- The ticket does not say which fields count.\n\n## Files\n\nmain/validators/scoring.validators.ts\nmain/features/score-types/shared/components/cycle-time-input/cycle-time-input.component.ts\nmain/features/score-types/ge-adv/services/ge-adv-form.service.ts';
    assert.ok(pattern.test(final));
    assert.ok(pattern.test('## Files\r\n\r\n- app/22/a.ts\r\n'));
    assert.ok(pattern.test('## Files:\n \t\n\n- app/22/a.ts'));
    assert.ok(!pattern.test('## Files\n\n\nNo paths here, only prose.\n'));
    assert.ok(!pattern.test('## Files\n\n## Notes\napp/22/a.ts'));
    const started = Date.now();
    assert.ok(!pattern.test(`## Files\n${'No paths here, only prose words\n'.repeat(40)}`));
    assert.ok(Date.now() - started < 1000, 'prose below the heading must not backtrack exponentially (the first regex took 82 s on ten lines)');
    const metrics = downstreamMetrics(downstreamTruth('fe-vs-22-downstream', root), answer('## Files\n\napp/22/a.ts\n'));
    assert.deepEqual([metrics.recall, metrics.contract], [0.5, true]);
  });

  it('metrics: the Files section of the final answer is scored; a file inside a directory item counts; no section is recall 0, no trace is no metrics', () => {
    const truth = downstreamTruth('fe-vs-22-downstream', root);
    const metrics = downstreamMetrics(truth, answer('Notes: app/zzz.ts is ruled out.\n\n## Files\n- app/22/a.ts\n- app/22/dir/b.ts\n- app/other.ts\n'));
    assert.deepEqual([metrics.recall, metrics.precision, metrics.contract, metrics.extra], [1, 0.667, true, ['app/other.ts']]);
    const none = downstreamMetrics(truth, answer('app/22/a.ts only'));
    assert.deepEqual([none.recall, none.f1, none.contract, none.precision], [0, 0, false, null]);
    assert.deepEqual(downstreamMetrics(truth, undefined), {});
    assert.deepEqual(downstreamMetrics(null, answer('x')), {});
  });

  it('a missing map case is an error, not a skipped case', () => {
    assert.throws(() => writeDownstream({ mapsDir: maps, evalsDir: root, sources, ids: ['33'] }), /map case for 33 missing/);
  });
});
