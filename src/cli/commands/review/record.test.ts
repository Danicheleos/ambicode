import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error untyped fixture modules
import { fixtureByName } from '../../../../fixtures/definitions.mjs';
// @ts-expect-error untyped fixture modules
import { materialize } from '../../../../fixtures/materialize.mjs';
import { parseArgs } from '#util/args';
import { createRuntime } from '#composition/root';
import { combineDiff, addressableLines } from '#platform/git/diff';
import { ReviewResult } from '#types/modules/review';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { readLedger } from '#platform/ledger/ledger';
import { runReview, REVIEW_OPTIONS } from './review.ts';
import { runReviewRecord, renderRecord, REVIEW_RECORD_OPTIONS } from './record.ts';
import type { Runtime } from '#types/composition';

const TASK = 'src-regression';
const scratches: string[] = [];
afterEach(async () => {
  for (const scratch of scratches.splice(0)) await rm(scratch, { recursive: true, force: true });
});

/** A real `review --task` on the ts-source-regression fixture, leaving a pending review; `record` feeds the reviewer's answer on stdin. */
async function pending() {
  const scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-record-'));
  scratches.push(scratch);
  const root = path.join(scratch, 'repo');
  await materialize(fixtureByName('ts-source-regression'), root, { ambicodeInit: true });
  const runtime = await createRuntime({ cwd: root });
  const reviewed = await runReview(runtime, parseArgs('review', ['--task', TASK], REVIEW_OPTIONS));
  const file = reviewed.result.changedFiles.find((entry) => entry.included)!;
  const diff = combineDiff([{ oldPath: file.oldPath, newPath: file.newPath, changeKind: file.changeKind, oldMode: '', newMode: '' }], await readFile(path.join(reviewed.snapshotDirectory, 'changed.diff'), 'utf8'))[0]!;
  const line = [...addressableLines(diff, 'new')][0]!;
  const location = (at: number) => ({ oldPath: file.oldPath, newPath: file.newPath, side: 'new', line: at });
  const finding = (at: number) => ({ risk: 'high', confidence: 'high', category: 'correctness', location: location(at), explanation: 'drops the last element', suggestedComment: 'check the slice end' });
  const record = (stdin: string, ...extra: string[]) => runReviewRecord({ ...runtime, stdin: { read: async () => stdin } } as Runtime, parseArgs('review record', ['--task', TASK, ...extra], REVIEW_RECORD_OPTIONS));
  const ledger = () => readLedger(nodeFileSystem, path.join(root, '.ambicode', 'task', TASK));
  return { root, reviewed, line, finding, record, ledger };
}

describe('review record', () => {
  it('a pending review carries the brief and stage pending', async () => {
    const t = await pending();
    const entry = (await t.ledger()).findLast((candidate) => candidate.kind === 'review')!;
    assert.deepEqual([entry['stage'], entry['reviewerRan']], ['pending', false]);
    const result = ReviewResult.parse(JSON.parse(await readFile(t.reviewed.resultPath, 'utf8')));
    assert.match(await readFile(path.join(t.root, result.brief!), 'utf8'), /^# Review brief /);
  });

  it('valid findings, fenced, are recorded: stage recorded, the count, findings.json and the four-part report', async () => {
    const t = await pending();
    const out = await t.record(`Here is my review.\n\`\`\`json\n${JSON.stringify({ findings: [t.finding(t.line)], coverageNotes: ['did not run the tests'] })}\n\`\`\`\n`);
    assert.equal(out.result.findings.length, 1);
    assert.equal(out.result.findings[0]!.evidence === '', false, 'the excerpt comes from the snapshot');
    assert.equal(out.result.reviewer?.status, 'ok');
    assert.notEqual(out.result.status, 'error');
    const entry = (await t.ledger()).findLast((candidate) => candidate.kind === 'review')!;
    assert.deepEqual([entry['stage'], entry['reviewerRan'], entry['findings']], ['recorded', true, 1]);
    assert.equal(JSON.parse(await readFile(path.join(path.dirname(out.resultPath), 'findings.json'), 'utf8')).length, 1);
    const text = renderRecord(out);
    for (const heading of ['1. WHAT WAS REVIEWED', '2. FINDINGS', '3. CHECKS AND VERIFICATION EVIDENCE', '4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE']) assert.ok(text.includes(heading), heading);
    assert.match(text, /did not run the tests/);
  });

  it('bare JSON is accepted as well as a fenced block', async () => {
    const t = await pending();
    const out = await t.record(JSON.stringify({ findings: [], coverageNotes: [] }));
    assert.deepEqual([out.result.findings.length, out.result.reviewer?.status], [0, 'ok']);
  });

  it('one bad line voids the whole answer: status error, no findings, the rejection printed, the entry still written', async () => {
    const t = await pending();
    const out = await t.record(`\`\`\`json\n${JSON.stringify({ findings: [t.finding(t.line), t.finding(9999)], coverageNotes: [] })}\n\`\`\``);
    assert.deepEqual([out.result.status, out.result.findings.length, out.result.reviewer?.status], ['error', 0, 'failed']);
    assert.match(out.result.reviewer!.rejections.join('\n'), /line 9999 is not present on the new side/);
    assert.match(renderRecord(out), /No finding list was produced[\s\S]*line 9999/);
    const entry = (await t.ledger()).findLast((candidate) => candidate.kind === 'review')!;
    assert.deepEqual([entry['stage'], entry['status'], entry['findings']], ['recorded', 'error', 0]);
  });

  it('an answer that is not JSON is a failed review, not a clean one', async () => {
    const t = await pending();
    const out = await t.record('I looked and it seems fine.');
    assert.deepEqual([out.result.status, out.result.findings.length], ['error', 0]);
    assert.match(out.result.reviewer!.rejections[0]!, /not JSON/);
  });

  it('refuses when nothing is pending, and when the review was already recorded', async () => {
    const t = await pending();
    await t.record(JSON.stringify({ findings: [] }));
    await assert.rejects(t.record(JSON.stringify({ findings: [] })), (error: Error & { code?: string }) => error.code === 'review-recorded' || error.code === 'review-not-found');
    await assert.rejects(t.record('{}', '--review', 'no-such-review'), (error: Error & { code?: string }) => error.code === 'review-not-found');
  });
});
