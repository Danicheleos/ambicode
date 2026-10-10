import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { skillHandlers } from '#skills/handlers';
import { CONFIG, routeFixture } from '#testing/fixtures/route-fixture';
import { REPO_ROOT } from '#testing/paths';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TASK = 'ORD-17';
const SHIPPED = await readFile(path.join(REPO_ROOT, 'routes', 'review', 'review.yaml'), 'utf8');
const STEPS: Record<string, string> = {};
for (const name of ['review/fetch', 'review/readback', 'review/agent', 'review/run']) STEPS[`routes/${name}.md`] = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');

describe('review route, model-typed estimate answer (08-P3)', () => {
  it('08-P3: a later model route next --answer estimate=run is declined and no reviewer step runs', async () => {
    const fx = await routeFixture({ routes: { review: SHIPPED }, handlers: skillHandlers(), step: STEPS, config: CONFIG });
    try {
      await fx.repo.write('src/a.ts', 'export const a = 1;\n');
      await fx.repo.commitAll('a');
      await fx.repo.write('src/a.ts', 'export const a = 2;\n');
      const started = await fx.engine.start({ skill: 'review', text: 'review it', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      assert.equal(started.position, 'estimate');
      const next = await fx.engine.advance({ task: TASK, session: A, cause: 'route-next', answers: [{ gate: 'estimate', option: 'run' }], scratchpadDir: fx.scratchpad });
      const declined = (await fx.kinds(TASK, 'declined')).filter((entry) => entry['gate'] === 'estimate');
      assert.deepEqual(declined.map((entry) => [entry['answer'], entry['reason']]), [['run', 'acting-needs-human']]);
      assert.equal((await fx.kinds(TASK, 'acceptance')).filter((entry) => entry['gate'] === 'estimate').length, 0);
      assert.equal((await fx.kinds(TASK, 'review')).length, 0);
      assert.equal(next.position, 'estimate');
      assert.deepEqual((await fx.kinds(TASK, 'exit')).map((entry) => entry['reason']), []);
    } finally {
      await fx.dispose();
    }
  });
});
