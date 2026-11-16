import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gapsOf } from '#modules/evidence/report/report';
import { CHECK_CONFIG, CHECK_TASK } from '#testing/fixtures/check-fixture';
import { reviewRouteFixture } from '#testing/fixtures/review-route-fixture';
import { taskFixture } from '#testing/fixtures/task-fixture';

const ANSWER = '```json\n{"findings":[],"coverageNotes":["read only the diff"]}\n```';
const FINDING = { risk: 'high', confidence: 'high', category: 'correctness', location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 2 }, problem: 'seeds nothing', impact: 'i', confidenceReason: 'c', suggestedComment: 'seed the reduce' };

const checksOf = (checks: string): string => CHECK_CONFIG.replace(/checks:[\s\S]*$/, `checks:\n${checks}`);
const REVIEW_CONFIG = checksOf('      unit: { all: null, file: "true {file}" }\n      typecheck: { all: "tsc --noEmit", file: null }\n      format: { all: null, file: "fmt {file}" }\n');

/** What the reviewer's Write tool leaves: its answer in the review folder, which the route reads at `route next`. */
const answer = (folder: string, text: string) => writeFile(path.join(folder, 'answer.json'), text);

describe('review route: route next records the reviewer answer file', { concurrency: 4 }, () => {
  it('the work file names the answer file and carries neither a cd line nor the request', async () => {
    const t = await reviewRouteFixture({ config: REVIEW_CONFIG });
    try {
      await t.start();
      assert.equal((await t.hook('estimate', 'run')).position, 'review-agent');
      const work = await readFile(path.join(t.dir, 'steps', 'work-review-agent.md'), 'utf8');
      assert.match(work, /answer: .*[\\/]1[\\/]answer\.json/);
      assert.doesNotMatch(work, /Run commands from|cd '|review record|review my change/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('route next records the answer and prints the report with the readback text, under review.record', async () => {
    const t = await reviewRouteFixture({ config: REVIEW_CONFIG });
    try {
      await t.start();
      await answer(t.bundle, ANSWER);
      const next = await t.next();
      assert.equal(next.position, 'readback');
      assert.match(next.text, /Review read-back[\s\S]*## review\.record\n1\. WHAT WAS REVIEWED[\s\S]*4\. OMISSIONS/);
      assert.match(next.text, /read only the diff/);
      assert.deepEqual((await t.kinds('review')).map((entry) => entry['stage']), ['pending', 'recorded']);
      assert.equal((await t.kinds('review')).at(-1)?.['status'], 'partial');
    } finally {
      await t.fx.dispose();
    }
  });

  it('a large report is printed whole on the CLI, part 4 included', async () => {
    const t = await reviewRouteFixture({ config: REVIEW_CONFIG });
    try {
      await t.start();
      await answer(t.bundle, JSON.stringify({ findings: [], coverageNotes: Array.from({ length: 200 }, (_, at) => `note ${at}: ${'x'.repeat(80)}`) }));
      const next = await t.next();
      assert.ok(next.bytes > 16_000, `${next.bytes}`);
      assert.equal(next.file, null);
      assert.match(next.text, /4\. OMISSIONS[\s\S]*note 199/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('no answer file is a failed review, not a clean one: recorded error, the reason printed, a gap on the report', async () => {
    const t = await reviewRouteFixture({ config: REVIEW_CONFIG });
    try {
      await t.start();
      const next = await t.next();
      assert.equal(next.position, 'readback');
      assert.match(next.text, /No finding list was produced[\s\S]*the reviewer wrote no answer\.json/);
      assert.deepEqual([(await t.kinds('review')).at(-1)?.['stage'], (await t.kinds('review')).at(-1)?.['status']], ['recorded', 'error']);
      assert.match(gapsOf(await t.ledger()).join('\n'), /The independent review failed/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('an answer file that is not JSON is a failed review and its text is kept beside the result', async () => {
    const t = await reviewRouteFixture({ config: REVIEW_CONFIG });
    try {
      await t.start();
      await answer(t.bundle, 'looks fine to me');
      assert.match((await t.next()).text, /not JSON/);
      assert.equal((await t.kinds('review')).at(-1)?.['status'], 'error');
      assert.equal(await readFile(path.join(t.bundle, 'rejected-output.txt'), 'utf8'), 'looks fine to me\n');
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('task route: route next records the reviewer answer file', { concurrency: 4 }, () => {
  async function toReviewer(t: Awaited<ReturnType<typeof taskFixture>>) {
    await t.start();
    await t.edit();
    return t.check('green', { ran: 1, failed: 0 });
  }
  const bundle = (t: Awaited<ReturnType<typeof taskFixture>>) => path.join(t.dir, 'reviews', '1');

  it('a clean answer file is recorded and route next reaches write', async () => {
    const t = await taskFixture();
    try {
      assert.equal((await toReviewer(t)).position, 'review-agent');
      await answer(bundle(t), ANSWER);
      assert.equal((await t.next()).position, 'write');
      assert.deepEqual((await t.kinds('review')).map((entry) => entry['stage']), ['pending', 'recorded']);
      assert.equal((await t.kinds('revise')).length, 0);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a recorded finding sends route next to fix', async () => {
    const t = await taskFixture();
    try {
      await toReviewer(t);
      await answer(bundle(t), `\`\`\`json\n${JSON.stringify({ findings: [FINDING], coverageNotes: [] })}\n\`\`\``);
      assert.equal((await t.next()).position, 'fix');
    } finally {
      await t.fx.dispose();
    }
  });

  it('no answer file is a failed review and a gap on the report, never a clean one', async () => {
    const t = await taskFixture();
    try {
      await toReviewer(t);
      const ended = await t.next();
      assert.equal(ended.position, 'complete', 'a failed review ends the route blocked: no write step');
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'blocked');
      assert.equal((await t.kinds('review')).at(-1)?.['status'], 'error');
      assert.match(gapsOf(await t.ledger()).join('\n'), /The independent review failed/);
    } finally {
      await t.fx.dispose();
    }
  });
});
