import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { reviewRouteFixture } from '#testing/fixtures/review-route-fixture';
import { finding } from '#testing/fixtures/review-fixture';
import { CHECK_TASK } from '#testing/fixtures/check-fixture';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';

const MR = 'https://gitlab.example.com/g/p/-/merge_requests/7';
const HEAD = 'a'.repeat(40);
const DIFF = 'diff --git a/src/orders.ts b/src/orders.ts\n--- a/src/orders.ts\n+++ b/src/orders.ts\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n';
const MR_JSON = JSON.stringify({ title: 'T', description: 'D', diff_refs: { base_sha: 'b'.repeat(40), start_sha: 's'.repeat(40), head_sha: HEAD } });
type Fixture = Awaited<ReturnType<typeof reviewRouteFixture>>;

/** glab answers from the fake; git still reaches the real repository. */
function glabFake(t: Fixture, fake = new FakeProcessRunner().stubArgv(['glab', 'mr', 'diff'], { stdout: DIFF }).stubArgv(['glab', 'api'], { stdout: MR_JSON })): FakeProcessRunner {
  const real = t.fx.runtime.runner;
  t.fx.runtime.runner = { run: (request) => (request.argv[0] === 'glab' ? fake.run(request) : real.run(request)) };
  return fake;
}
const posts = (fake: FakeProcessRunner): string[][] => fake.argvs().filter((argv) => argv.includes('POST'));

async function toReadback(t: Fixture, fake: FakeProcessRunner, findings = [finding({ id: 'f-1' }), finding({ id: 'f-2', risk: 'low', location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'old', line: 2 } }), finding({ id: 'f-3', location: { oldPath: 'src/orders.ts', newPath: 'src/orders.ts', side: 'new', line: 1 } })]) {
  const start = await t.start({ target: { branch: false, base: null, mr: MR } });
  assert.equal(start.position, 'estimate', 'mr-fetch is code: the route is already at the estimate gate');
  assert.equal(fake.calls.length, 2);
  const meta = JSON.parse(await t.fx.runtime.fs.readText(path.join(t.fx.repo.root, '.ambicode', 'reviews', CHECK_TASK, 'mr-diff.json')));
  assert.equal(meta.sha, HEAD);
  // The pin is code: the fetched merge-request diff is pinned and no check runs on a checkout that is not the merge request.
  assert.equal((await t.hook('estimate', 'run')).position, 'review-agent');
  assert.deepEqual([(await t.kinds('review')).map((entry) => entry['stage']), await t.kinds('check')], [['pending'], []]);
  return t.synthetic(findings, { stage: 'recorded' });
}

describe('review route: --mr through glab', () => {
  it('fetch writes the diff and head sha; publish lists the findings and delivers only the selected ones', async () => {
    const t = await reviewRouteFixture();
    try {
      const fake = glabFake(t);
      assert.equal((await toReadback(t, fake)).position, 'readback');
      const gate = await t.next();
      assert.equal(gate.position, 'publish');
      assert.match(gate.text, /Post which findings as merge-request comments\?/);
      assert.match(gate.text, /1\. src\/orders\.ts:2 — Consider seeding the reduce so an empty list returns zero\. \(high\/medium\)\n2\. src\/orders\.ts:2 — /);
      await t.hook('publish', '1, 3');
      const sent = posts(fake);
      assert.equal(sent.length, 2);
      const positions = sent.map((argv) => JSON.parse(argv[argv.indexOf('-F') + 1]!.slice(9)));
      assert.deepEqual(positions.map(({ old_line, new_line }) => [old_line, new_line]), [[undefined, 2], [1, 1]]);
      for (const position of positions) assert.ok(position.new_line === undefined || [1, 2].includes(position.new_line), 'the position lies in the diff');
      assert.equal(positions[0].head_sha, HEAD);
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
    } finally {
      await t.fx.dispose();
    }
  });

  it('a finding on a removed line is posted on the old side', async () => {
    const t = await reviewRouteFixture();
    try {
      const fake = glabFake(t);
      await toReadback(t, fake);
      await t.next();
      await t.hook('publish', '2');
      const position = JSON.parse(posts(fake)[0]![posts(fake)[0]!.indexOf('-F') + 1]!.slice(9));
      assert.deepEqual([position.old_path, position.old_line, position.new_line], ['src/orders.ts', 2, undefined]);
    } finally {
      await t.fx.dispose();
    }
  });

  it('`all` posts every finding; `none` posts nothing and ends the route', async () => {
    const all = await reviewRouteFixture();
    try {
      const fake = glabFake(all);
      await toReadback(all, fake);
      await all.next();
      await all.hook('publish', 'all');
      assert.equal(posts(fake).length, 3);
    } finally {
      await all.fx.dispose();
    }
    const none = await reviewRouteFixture();
    try {
      const fake = glabFake(none);
      await toReadback(none, fake);
      await none.next();
      await none.hook('publish', 'none');
      assert.equal(posts(fake).length, 0);
      assert.equal((await none.kinds('exit')).at(-1)?.['reason'], 'done');
    } finally {
      await none.fx.dispose();
    }
  });

  it('a failed post stops the route with mr-publish-failed and glab stderr', async () => {
    const t = await reviewRouteFixture();
    try {
      const fake = glabFake(t, new FakeProcessRunner().stub((argv) => argv.includes('POST'), { exitCode: 1, stderr: '403 Forbidden' }).stubArgv(['glab', 'mr', 'diff'], { stdout: DIFF }).stubArgv(['glab', 'api'], { stdout: MR_JSON }));
      await toReadback(t, fake);
      await t.next();
      const end = await t.hook('publish', 'all');
      assert.match(end.text, /mr-publish-failed/);
      assert.match(end.text, /403 Forbidden/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('glab exit 1 on fetch ends the route with mr-fetch-failed carrying stderr', async () => {
    const t = await reviewRouteFixture();
    try {
      glabFake(t, new FakeProcessRunner().stubArgv(['glab'], { exitCode: 1, stderr: 'glab: not logged in' }));
      const start = await t.start({ target: { branch: false, base: null, mr: MR } });
      assert.match(start.text, /mr-fetch-failed/);
      assert.match(start.text, /not logged in/);
      assert.equal((await t.kinds('exit')).length, 1);
    } finally {
      await t.fx.dispose();
    }
  });

  it('no findings ends the route at publish-list and asks nothing', async () => {
    const t = await reviewRouteFixture();
    try {
      await toReadback(t, glabFake(t), []);
      const end = await t.next();
      assert.match(end.text, /no findings to publish/);
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
      assert.equal((await t.kinds('gate')).filter((entry) => entry['gate'] === 'publish').length, 0);
    } finally {
      await t.fx.dispose();
    }
  });
});
