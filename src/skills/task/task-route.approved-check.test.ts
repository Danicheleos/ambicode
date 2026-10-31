import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { finding } from '#testing/fixtures/review-fixture';
import { taskFixture } from '#testing/fixtures/task-fixture';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

async function withTask(body: (t: Fixture) => Promise<void>): Promise<void> {
  const t = await taskFixture();
  try {
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

const GATE = 'check-only-unauthorized';
const prints = async (t: Fixture) => (await t.kinds('gate')).filter((entry) => entry['gate'] === GATE);

/** The change's green check is on record, so the position is already `format` when the model asks for a whole-project check. */
async function askAll(t: Fixture) {
  await t.start();
  await t.edit();
  await t.held('green');
  return t.runCheck({ name: 'typecheck', files: [], phase: 'green' });
}

describe('an all-form check that needs approval (A5)', () => {
  it('the question names the whole project, not an empty file list', async () => {
    await withTask(async (t) => {
      assert.equal((await askAll(t)).outcome, 'waiting');
      const [print] = await prints(t);
      assert.match(String(print?.['question']), /^Run app\/typecheck on the whole project\?/);
    });
  });

  it('the file form keeps its file list in the question', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.edit();
      await t.held('green');
      assert.equal((await t.runCheck({ name: 'e2e', phase: 'green' })).outcome, 'waiting');
      assert.match(String((await prints(t))[0]?.['question']), /^Run app\/e2e on src\/a\.spec\.ts\?/);
    });
  });

  it('approving runs the check and ledgers it, and the key is not asked again', async () => {
    await withTask(async (t) => {
      assert.equal((await askAll(t)).outcome, 'waiting');
      await t.hook(GATE, 'approve');
      const ran = (await t.kinds('check')).filter((entry) => entry['key'] === 'app/typecheck');
      assert.equal(ran.length, 1);
      assert.deepEqual([ran[0]?.['files'], ran[0]?.['phase']], [[], 'green']);
      assert.equal((await t.runCheck({ name: 'typecheck', files: [], phase: 'green' })).outcome, 'ran');
      assert.equal((await prints(t)).length, 1);
    });
  });
});

describe('a gate instance never ends unanswered (A5)', () => {
  it('a question raised in fix and left printed while the route ends is recorded as the default taken', async () => {
    await withTask(async (t) => {
      await t.start();
      await t.edit();
      await t.check('green', null);
      await t.hook('review-offer', 'run');
      assert.equal((await t.review([finding({ id: 'F1' })])).position, 'fix');
      assert.equal((await t.runCheck({ name: 'typecheck', files: [], phase: 'green' })).outcome, 'waiting');
      const [print] = await prints(t);
      await t.held('green');
      await t.next();
      await t.hook('review-again', 'skip');
      await t.fx.engine.stop('ord-7', 'blocked')
      const answered = [...(await t.kinds('default-taken')), ...(await t.kinds('acceptance')), ...(await t.kinds('declined'))].filter((entry) => entry['instance'] === print!.id);
      assert.deepEqual(answered.map((entry) => [entry.kind, entry['answer']]), [['default-taken', 'decline']]);
    });
  });
});
