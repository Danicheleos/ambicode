import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { reviewRouteFixture } from '#testing/fixtures/review-route-fixture';
import { FakeProcessRunner } from '#testing/fakes/fake-process-runner';
import { SESSION_A } from '#testing/fixtures/ids';
import type { StartInput } from '#types/harness';

const MR = 'https://gitlab.example.com/g/sub/p/-/merge_requests/7';
const DIFF = 'diff --git a/src/orders.ts b/src/orders.ts\n--- a/src/orders.ts\n+++ b/src/orders.ts\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n';
const MR_JSON = JSON.stringify({ title: 'T', description: 'D', diff_refs: { base_sha: 'b'.repeat(40), start_sha: 's'.repeat(40), head_sha: 'a'.repeat(40) } });
type Fixture = Awaited<ReturnType<typeof reviewRouteFixture>>;

/** The standalone start: no `--task`, so the route names its own folder. */
const startUnnamed = (t: Fixture, input: Partial<StartInput> = {}) =>
  t.fx.engine.start({ skill: 'review', text: '', requirements: [], cwd: t.fx.repo.root, session: SESSION_A, channel: 'hook', scratchpadDir: t.fx.scratchpad, ...input });
const runs = async (t: Fixture): Promise<string[]> => readdir(path.join(t.fx.repo.root, '.ambicode', 'reviews')).catch(() => []);

function glabFake(t: Fixture): FakeProcessRunner {
  const fake = new FakeProcessRunner().stubArgv(['glab', 'mr', 'diff'], { stdout: DIFF }).stubArgv(['glab', 'api'], { stdout: MR_JSON });
  const real = t.fx.runtime.runner;
  t.fx.runtime.runner = { run: (request) => (request.argv[0] === 'glab' ? fake.run(request) : real.run(request)) };
  return fake;
}

describe('standalone review folder names', () => {
  it('a working-tree review is local-<date>-<time> from the runtime clock', async () => {
    const t = await reviewRouteFixture();
    try {
      await startUnnamed(t);
      assert.deepEqual(await runs(t), ['local-20261005-1000']);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a branch review is branch-<slug of the current branch>', async () => {
    const t = await reviewRouteFixture();
    try {
      await t.fx.repo.run(['git', 'checkout', '-q', '-b', 'feature/ORD-17_retry']);
      await startUnnamed(t, { target: { branch: true, base: 'main', mr: null } });
      assert.deepEqual(await runs(t), ['branch-feature-ord-17_retry']);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a merge-request review is mr-<iid>', async () => {
    const t = await reviewRouteFixture();
    try {
      glabFake(t);
      await startUnnamed(t, { target: { branch: false, base: null, mr: MR } });
      assert.deepEqual(await runs(t), ['mr-7']);
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('a merge-request URL typed as the review text', () => {
  it('is the target, not a requirement: mr-fetch runs and the folder is mr-<iid>', async () => {
    const t = await reviewRouteFixture();
    try {
      const fake = glabFake(t);
      const start = await startUnnamed(t, { text: MR });
      const route = (await t.fx.kinds('mr-7', 'route')).at(-1)!;
      const args = route['args'] as { hasRequirement: boolean; target?: { mr: string | null } };
      assert.equal(args.hasRequirement, false);
      assert.equal(args.target?.mr, MR);
      assert.equal(start.position, 'estimate', 'no requirement fetch or gate precedes the estimate');
      assert.equal(fake.calls.length, 2, 'mr-fetch ran against the runner');
      assert.match(start.text, /merge-request|merge request/i);
    } finally {
      await t.fx.dispose();
    }
  });
});
