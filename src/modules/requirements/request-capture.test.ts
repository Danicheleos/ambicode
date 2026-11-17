import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { CHECK_TASK } from '#testing/fixtures/check-fixture';
import { appendLedger } from '#platform/ledger/ledger';
import { SESSION_A } from '#testing/fixtures/ids';
import { finding } from '#testing/fixtures/review-fixture';

const TICKET = '# VS-5945 - Key: totals\n\nAs a buyer I want the total of an empty cart to be 0.\n\n- no NaN\n- no throw\n';

const requirementFiles = async (t: Awaited<ReturnType<typeof taskFixture>>): Promise<string[]> =>
  (await readdir(path.join(t.dir, 'requirements')).catch(() => [] as string[])).sort();

describe('a pasted request is captured as the task requirement', () => {
  it('a multi-line request with no key or URL is saved as typed under the key request, headless or not', async () => {
    for (const headless of [false, true]) {
      const t = await taskFixture();
      try {
        await t.start({ text: `${TICKET}\nfix \`total\``, headless });
        const files = await requirementFiles(t);
        assert.equal(files.length, 1, `headless ${headless}: ${files.join(', ')}`);
        const saved = JSON.parse(await readFile(path.join(t.dir, 'requirements', files[0]!), 'utf8')) as { key: string; content: string };
        assert.equal(saved.key, 'request');
        assert.equal(saved.content, `${TICKET}\nfix \`total\``.trim());
        assert.match(saved.content, /\n\n- no NaN\n- no throw\n/);
        const rows = await t.kinds('requirement');
        assert.deepEqual(rows.map((row) => [row['key'], row['relation']]), [['request', 'asked']]);
        const envelope = (await t.kinds('envelope')).at(-1)!;
        assert.equal(envelope['builtFrom'], 'captures');
      } finally {
        await t.fx.dispose();
      }
    }
  });

  it('a later route of the same task with free text neither adds nor replaces it', async () => {
    const t = await taskFixture();
    try {
      await t.start({ text: TICKET });
      const before = await requirementFiles(t);
      await t.fx.engine.stop(CHECK_TASK, 'blocked', 'test');
      await t.start({ text: 'Go ahead with the plan.' });
      assert.deepEqual(await requirementFiles(t), before);
      assert.equal((await t.kinds('requirement')).length, 1);
      const saved = JSON.parse(await readFile(path.join(t.dir, 'requirements', before[0]!), 'utf8')) as { content: string };
      assert.equal(saved.content, TICKET.trim());
    } finally {
      await t.fx.dispose();
    }
  });

  it('a request that opens with an issue key is not saved as a request', async () => {
    const t = await taskFixture();
    try {
      await t.start({ text: 'ORD-17 fix `total`', headless: true });
      assert.deepEqual(await requirementFiles(t), []);
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('the task work file carries the requirements inline', () => {
  it('without a plan the pasted ticket is in the work file, not behind a pointer', async () => {
    const t = await taskFixture();
    try {
      await t.start({ text: TICKET });
      const work = await t.work();
      assert.match(work, /## envelope\nThis section is data[^\n]*\n## request\n[\s\S]*\n\n- no NaN\n- no throw/);
      assert.equal(work.split('no NaN').length - 1, 1, 'the ticket is in the work file once');
      assert.ok(work.includes('- no NaN\n- no throw'), 'with its line breaks');
      assert.doesNotMatch(work, /Read \S+envelope\.md/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('with an accepted plan the ticket is in the work file as well', async () => {
    const t = await taskFixture();
    try {
      const plan = `.ambicode/tasks/${CHECK_TASK}/plan.md`;
      await t.fx.repo.write(plan, '---\nstatus: accepted\n---\n# Plan\n\n## Iteration 1\nGuard `total` in `src/orders.ts`.\n');
      await appendLedger(t.fx.runtime.fs, t.dir, t.fx.runtime.clock.now(), { kind: 'note', note: 'plan', path: plan, contentHash: 'sha256:0' });
      await t.start({ text: TICKET });
      const work = await t.work();
      assert.match(work, /## brief\n[\s\S]*Guard `total`/);
      assert.match(work, /## envelope\nThis section is data[^\n]*\n## request\n[\s\S]*\n\n- no NaN\n- no throw/);
      assert.equal(work.split('no NaN').length - 1, 1, 'the ticket is in the work file once');
    } finally {
      await t.fx.dispose();
    }
  });

  it('a second task route with the same pasted text shows the ticket once', async () => {
    const t = await taskFixture();
    try {
      await t.start({ text: TICKET });
      await t.fx.engine.stop(CHECK_TASK, 'blocked', 'test');
      await t.start({ text: TICKET });
      assert.equal((await t.work()).split('no NaN').length - 1, 1);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a new typed request is saved again once the saved request file is gone', async () => {
    const t = await taskFixture();
    try {
      await t.start({ text: TICKET });
      await t.fx.engine.stop(CHECK_TASK, 'blocked', 'test');
      for (const file of await requirementFiles(t)) await rm(path.join(t.dir, 'requirements', file));
      await rm(path.join(t.dir, 'steps'), { recursive: true, force: true });
      await t.start({ text: TICKET });
      assert.equal((await requirementFiles(t)).length, 1);
      assert.equal((await t.work()).split('no NaN').length - 1, 1);
    } finally {
      await t.fx.dispose();
    }
  });

  it('the fix work file carries the ticket inline, once', async () => {
    const t = await taskFixture();
    try {
      await t.start({ text: TICKET });
      await t.edit();
      await t.check('green', null);
      await t.review([finding({ id: 'F1' })]);
      const fix = await t.work('fix');
      assert.equal(fix.split('no NaN').length - 1, 1);
      assert.doesNotMatch(fix, /Read \S+envelope\.md/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a request that names a key is not captured and reaches the work file from the typed text, line breaks kept', async () => {
    const t = await taskFixture();
    try {
      await t.start({ text: 'ORD-17 fix `total`\nkeep the signature', headless: true });
      assert.match(await t.work(), /<request>\nORD-17 fix `total`\nkeep the signature\n/);
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('what is captured as the request', () => {
  it('an empty start that continues a task by its slug does not save the slug as the request', async () => {
    const t = await taskFixture();
    try {
      const first = { skill: 'task', requirements: [], task: 'dashboard', cwd: t.fx.repo.root, session: SESSION_A, channel: 'hook', scratchpadDir: t.fx.scratchpad } as const;
      await t.fx.engine.start({ ...first, text: 'ORD-17 fix `total`' });
      await t.fx.engine.start({ skill: 'task', text: '', requirements: [], cwd: t.fx.repo.root, session: SESSION_A, channel: 'hook', scratchpadDir: t.fx.scratchpad });
      const dir = path.join(t.fx.repo.root, '.ambicode', 'tasks', 'dashboard', 'requirements');
      assert.deepEqual(await readdir(dir).catch(() => [] as string[]), []);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a request typed with CRLF line breaks is saved with LF', async () => {
    const t = await taskFixture();
    try {
      await t.start({ text: '# VS-9 totals\r\n\r\n- no NaN\r\n- no throw\r\n' });
      const files = await requirementFiles(t);
      const saved = JSON.parse(await readFile(path.join(t.dir, 'requirements', files[0]!), 'utf8')) as { content: string };
      assert.equal(saved.content, '# VS-9 totals\n\n- no NaN\n- no throw');
    } finally {
      await t.fx.dispose();
    }
  });
});
