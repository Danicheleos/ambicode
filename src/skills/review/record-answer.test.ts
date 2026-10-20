import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error untyped fixture modules
import { fixtureByName } from '../../../fixtures/definitions.mjs';
// @ts-expect-error untyped fixture modules
import { materialize } from '../../../fixtures/materialize.mjs';
import { createRuntime } from '#composition/root';
import { combineDiff, addressableLines } from '#platform/git/diff';
import { ReviewResult } from '#types/modules/review';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { appendLedger, readLedger } from '#platform/ledger/ledger';
import { pinReview } from '#modules/review/bundle/bundle';
import { pendingReview } from '#modules/review/answer/captured';
import { recordReviewerAnswer, renderRecord } from './record-answer.ts';
import type { Runtime } from '#types/composition';

const TASK = 'src-regression';
const pin = async (runtime: Runtime) => {
  const { bundle } = await pinReview(runtime, { assemble: { target: { kind: 'working' }, task: TASK, requirements: [], excludePaths: [], onlyPaths: [], withTests: false }, omissions: [], ledger: {} });
  return bundle;
};
const scratches: string[] = [];
afterEach(async () => {
  for (const scratch of scratches.splice(0)) await rm(scratch, { recursive: true, force: true });
});

/** A task-scoped review pinned in process on the ts-source-regression fixture, leaving it pending; `record` hands the reviewer's answer text to the recording the route's review.record step does. */
async function pending() {
  const scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-record-'));
  scratches.push(scratch);
  const root = path.join(scratch, 'repo');
  await materialize(fixtureByName('ts-source-regression'), root, { ambicodeInit: true });
  const runtime = await createRuntime({ cwd: root });
  await mkdir(path.join(root, '.ambicode', 'tasks', TASK), { recursive: true });
  const reviewed = await pin(runtime);
  const file = reviewed.result.changedFiles.find((entry) => entry.exclusionReason === null)!;
  const diff = combineDiff([{ oldPath: file.oldPath, newPath: file.newPath, changeKind: file.changeKind, oldMode: '', newMode: '' }], await readFile(path.join(reviewed.reviewDirectory, 'changed.diff'), 'utf8'))[0]!;
  const line = [...addressableLines(diff, 'new')][0]!;
  const location = (at: number) => ({ oldPath: file.oldPath, newPath: file.newPath, side: 'new', line: at });
  const finding = (at: number) => ({ risk: 'high', confidence: 'high', category: 'correctness', location: location(at), explanation: 'drops the last element', suggestedComment: 'check the slice end' });
  const taskDirectory = path.join(root, '.ambicode', 'tasks', TASK);
  const record = async (answer: string | null) => {
    const entry = pendingReview(await readLedger(nodeFileSystem, taskDirectory), null)!;
    return recordReviewerAnswer(runtime, { pending: entry, answer, append: async (fields) => (await appendLedger(nodeFileSystem, taskDirectory, new Date(), 'test-writer', fields)).entry });
  };
  const ledger = () => readLedger(nodeFileSystem, path.join(root, '.ambicode', 'tasks', TASK));
  return { root, reviewed, line, finding, record, ledger };
}

describe('recording the reviewer answer', () => {
  it('a pending review has stage pending and names its brief path', async () => {
    const t = await pending();
    const entry = (await t.ledger()).findLast((candidate) => candidate.kind === 'review')!;
    assert.deepEqual([entry['stage'], entry['reviewerRan']], ['pending', false]);
    const result = ReviewResult.parse(JSON.parse(await readFile(t.reviewed.resultPath, 'utf8')));
    assert.match(result.brief!, /brief\.md$/);
  });

  it('valid findings, fenced, are recorded: stage recorded, the count, findings.json and the four-part report', async () => {
    const t = await pending();
    const out = await t.record(`Here is my review.\n\`\`\`json\n${JSON.stringify({ findings: [t.finding(t.line)], coverageNotes: ['did not run the tests'] })}\n\`\`\`\n`);
    assert.equal(out.result.findings.length, 1);
    assert.equal(out.result.findings[0]!.evidence === '', false, 'the excerpt comes from the checkout');
    assert.equal(out.result.reviewer?.status, 'ok');
    assert.notEqual(out.result.status, 'error');
    const entry = (await t.ledger()).findLast((candidate) => candidate.kind === 'review')!;
    assert.deepEqual([entry['stage'], entry['reviewerRan'], entry['findings']], ['recorded', true, 1]);
    assert.equal(JSON.parse(await readFile(path.join(path.dirname(out.resultPath), 'findings.json'), 'utf8')).length, 1);
    const text = renderRecord(out);
    for (const heading of ['1. WHAT WAS REVIEWED', '2. FINDINGS', '3. CHECKS AND VERIFICATION EVIDENCE', '4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE']) assert.ok(text.includes(heading), heading);
    assert.match(text, /did not run the tests/);
  });

  it('the excerpt is read from the checkout at record time, not from a mirror', async () => {
    const t = await pending();
    const target = path.join(t.root, t.reviewed.result.changedFiles.find((entry) => entry.exclusionReason === null)!.newPath!);
    const lines = (await readFile(target, 'utf8')).split('\n');
    lines[t.line - 1] = 'const markerFromTheCheckout = 1;';
    await writeFile(target, lines.join('\n'));
    const out = await t.record(`\`\`\`json\n${JSON.stringify({ findings: [t.finding(t.line)], coverageNotes: [] })}\n\`\`\``);
    assert.match(out.result.findings[0]!.evidence, /markerFromTheCheckout/);
  });

  it('bare JSON is accepted as well as a fenced block', async () => {
    const t = await pending();
    const out = await t.record(JSON.stringify({ findings: [], coverageNotes: [] }));
    assert.deepEqual([out.result.findings.length, out.result.reviewer?.status], [0, 'ok']);
  });

  it('an invented rule id is dropped: the finding is recorded and the report, result and ledger carry one omission', async () => {
    const t = await pending();
    const out = await t.record(`\`\`\`json\n${JSON.stringify({ findings: [{ ...t.finding(t.line), ruleRefs: ['common-rules/callers'] }], coverageNotes: [] })}\n\`\`\``);
    assert.deepEqual([out.result.reviewer?.status, out.result.findings.length, out.result.findings[0]!.ruleRefs], ['ok', 1, []]);
    assert.equal(out.result.omissions.filter((line) => line.includes('common-rules/callers')).length, 1);
    assert.match(renderRecord(out), /4\. OMISSIONS[\s\S]*cited rule "common-rules\/callers"[\s\S]*the reference was dropped/);
    const entry = (await t.ledger()).findLast((candidate) => candidate.kind === 'review')!;
    assert.equal(entry['omissions'], out.result.omissions.length);
  });

  it('one bad line drops only that finding: it stays partial and part 4 lists the rejected finding with its reason', async () => {
    const t = await pending();
    const out = await t.record(`\`\`\`json\n${JSON.stringify({ findings: [t.finding(t.line), t.finding(9999)], coverageNotes: [] })}\n\`\`\``);
    assert.deepEqual([out.result.status, out.result.findings.length, out.result.reviewer?.status], ['partial', 1, 'ok']);
    assert.match(out.result.statusReason!, /1 finding\(s\) rejected/);
    assert.match(renderRecord(out), /4\. OMISSIONS[\s\S]*finding 2 \(.*:9999 new\): line 9999 is not present on the new side/);
    const entry = (await t.ledger()).findLast((candidate) => candidate.kind === 'review')!;
    assert.deepEqual([entry['stage'], entry['status'], entry['findings']], ['recorded', 'partial', 1]);
  });

  it('an answer whose every finding is at a bad line is a failed review: status error, no findings, the rejection printed', async () => {
    const t = await pending();
    const out = await t.record(`\`\`\`json\n${JSON.stringify({ findings: [t.finding(9998), t.finding(9999)], coverageNotes: [] })}\n\`\`\``);
    assert.deepEqual([out.result.status, out.result.findings.length, out.result.reviewer?.status], ['error', 0, 'failed']);
    assert.match(renderRecord(out), /No finding list was produced[\s\S]*line 9998[\s\S]*line 9999/);
  });

  it('an answer that is not JSON is a failed review, not a clean one', async () => {
    const t = await pending();
    const out = await t.record('I looked and it seems fine.');
    assert.deepEqual([out.result.status, out.result.findings.length], ['error', 0]);
    assert.match(out.result.reviewer!.rejections[0]!, /not JSON/);
  });

  it('no answer, or a blank one, is a failed review with its reason and no rejected output kept', async () => {
    for (const none of [null, '  \n']) {
      const t = await pending();
      const out = await t.record(none);
      assert.deepEqual([out.result.status, out.result.findings.length, out.result.reviewer?.status, out.result.reviewer?.rejectedOutputRef], ['error', 0, 'failed', null]);
      assert.match(out.result.reviewer!.rejections[0]!, /wrote no answer\.json/);
      assert.match(renderRecord(out), /No finding list was produced[\s\S]*wrote no answer\.json/);
    }
  });

  it('a review with no check recorded is partial, and says so in part 3', async () => {
    const t = await pending();
    const out = await t.record(JSON.stringify({ findings: [], coverageNotes: [] }));
    assert.equal(out.result.status, 'partial');
    assert.match(renderRecord(out), /No check recorded/);
  });
});
