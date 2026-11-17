import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reviewRouteFixture } from '#testing/fixtures/review-route-fixture';
import { finding } from '#testing/fixtures/review-fixture';
import { CHECK_CONFIG, PAGE_URL } from '#testing/fixtures/check-fixture';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { renderReviewPage } from '#modules/review/findings/page';
import { recordedResult } from './page.ts';

const MR = 'https://gitlab.example.com/g/p/-/merge_requests/7';
const DIFF = 'diff --git a/src/orders.ts b/src/orders.ts\n--- a/src/orders.ts\n+++ b/src/orders.ts\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n';
const MR_JSON = JSON.stringify({ title: 'T', description: 'D', diff_refs: { base_sha: 'b'.repeat(40), start_sha: 's'.repeat(40), head_sha: 'a'.repeat(40) } });
type Fixture = Awaited<ReturnType<typeof reviewRouteFixture>>;

// The fixture's own config has a propose and a forbid check, which would ask or refuse before the route reaches the reviewer.
const CONFIG = CHECK_CONFIG.replace(/checks:[\s\S]*$/, 'checks:\n      unit: { all: null, file: "true {file}" }\n');

async function withReview(body: (t: Fixture) => Promise<void>): Promise<void> {
  const t = await reviewRouteFixture({ config: CONFIG });
  try {
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

/** glab answers from the fake; the detached page start still goes to the fixture's stub. */
function glabFake(t: Fixture): void {
  const fake = new FakeProcessRunner().stubArgv(['glab', 'mr', 'diff'], { stdout: DIFF }).stubArgv(['glab', 'api'], { stdout: MR_JSON });
  const real = t.fx.runtime.runner;
  t.fx.runtime.runner = { run: (request) => (request.argv[0] === 'glab' ? fake.run(request) : real.run(request)) };
}

describe('review route: the local page step', () => {
  it('starts the page as a detached process and delivers its link to the readback, for a local target with a finding', async () => {
    await withReview(async (t) => {
      await t.start();
      const readback = await t.synthetic([finding({ id: 'f-1' })]);
      assert.equal(readback.position, 'readback');
      assert.match(readback.text, new RegExp(`## review\\.page\\nReview page: ${PAGE_URL}$`));
      assert.equal(t.pages.length, 1);
      const [request] = t.pages;
      assert.deepEqual([request!.detached, request!.argv.slice(-4)], [true, ['review', 'page', '--task', 'ord-7']]);
      assert.equal(await t.fx.runtime.fs.realpath(request!.cwd), await t.fx.runtime.fs.realpath(t.fx.repo.root));
    });
  });

  it('is skipped, with no process and no link, for a local target without findings', async () => {
    await withReview(async (t) => {
      await t.start();
      const readback = await t.synthetic([]);
      assert.equal(readback.position, 'readback');
      assert.equal(t.pages.length, 0);
      assert.doesNotMatch(readback.text, /^## review\.page|127\.0\.0\.1/m);
    });
  });

  it('runs for a merge request even with no finding, and shows each finding', async () => {
    await withReview(async (t) => {
      glabFake(t);
      await t.start({ target: { branch: false, base: null, mr: MR } });
      const found = [finding({ id: 'f-1' }), finding({ id: 'f-2', location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 1 } })];
      const readback = await t.synthetic(found);
      assert.match(readback.text, /^Review page: http/m);
      const result = (await recordedResult(t.fx.runtime.fs, t.fx.repo.root, await t.ledger()))!;
      const html = renderReviewPage(result, 'c', { reviewId: result.reviewId, findings: {} });
      const shown = [...html.matchAll(/value="(\d+)"> <b>#\d+<\/b>/g)].map((match) => match[1]);
      assert.deepEqual(shown, ['1', '2']);
      assert.equal(shown.length, 2);
    });
    await withReview(async (t) => {
      glabFake(t);
      await t.start({ target: { branch: false, base: null, mr: MR } });
      await t.synthetic([]);
      assert.equal(t.pages.length, 1, 'a merge-request review gets its page even without a finding');
    });
  });
});

describe('the page step when the page cannot start', () => {
  it('says so in the readback payload instead of leaving it empty', async () => {
    await withReview(async (t) => {
      const real = t.fx.runtime.runner;
      t.fx.runtime.runner = { run: (request) => (request.detached === true ? Promise.resolve({ kind: 'exited', exitCode: 2, stdout: '', stderr: 'error [review-unreadable]: x\n', truncated: false, durationMs: 1, failure: null }) : real.run(request)) };
      await t.start();
      const readback = await t.synthetic([finding({ id: 'f-1' })]);
      assert.match(readback.text, /^Review page unavailable: error \[review-unreadable\]/m);
      assert.doesNotMatch(readback.text, /^Review page: http/m);
    });
  });
});
