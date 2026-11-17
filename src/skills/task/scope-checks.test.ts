import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { CHECK_CONFIG, COMMAND_PACK } from '#testing/fixtures/check-fixture';
import { gapsOf } from '#modules/evidence/report/report';

type Fixture = Awaited<ReturnType<typeof taskFixture>>;

const PLAN = '.ambicode/tasks/ord-7/plan.md';
const TWO = '---\nstatus: accepted\n---\n# Plan\n\n## Iteration 1\nAdd the guard.\n\n## Iteration 2\nSeed the reduce.\n';
const TEXT = 'fix `total` for an empty list';
const SKIP = 'skip — verification incomplete';
const REPORT_GAP = 'report the gap';
/** unit has both forms, typecheck only `all`: the shapes the end step must tell apart. e2e (propose) and lint (forbid) are left out of this fixture. */
const CONFIG = CHECK_CONFIG.split('\n').filter((line) => !/^\s+(e2e|lint):/.test(line)).join('\n');
const NO_CHECKS = CONFIG.replace(/^(\s+)(unit|typecheck|format):.*$/gm, '$1$2: null');
const FAIL = 'FAIL src/orders.spec.ts\n  expected 0 received NaN\n';

async function withTask(body: (t: Fixture) => Promise<void>, options: Parameters<typeof taskFixture>[0] = { config: CONFIG, askChecks: true }): Promise<void> {
  const t = await taskFixture(options);
  try {
    await t.fx.repo.write(PLAN, TWO);
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

/** The check commands that ran, format left out: the end step's own runs. */
const ran = (t: Fixture): string[] => t.runner.calls.map((call) => call.join(' ')).filter((call) => !call.startsWith('fmt')).sort();
const scopeRuns = async (t: Fixture) => (await t.kinds('check')).filter((entry) => entry['route'] !== undefined && entry['ms'] !== 3);
const gateNames = async (t: Fixture): Promise<unknown[]> => (await t.kinds('gate')).map((entry) => entry['gate']);
const green = (t: Fixture) => t.check('green', { ran: 1, failed: 0 });

describe('task route: the end-of-run checks', { concurrency: 4 }, () => {
  it('no named iteration: no check runs of its own; the full key is asked once, then after the one review each runnable key runs once, on the files the task changed', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT.replace(' iteration 1', '') });
      await t.edit();
      assert.equal((await green(t)).position, 'checks-offer');
      assert.equal((await t.hook('checks-offer', 'run')).position, 'review-agent');
      assert.deepEqual(ran(t), [], 'the implementer ran no check of the route');
      assert.equal((await t.review([])).position, 'write');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'", 'tsc --noEmit'], 'unit by file on the changed file; typecheck has no file form, so its all form, once');
      assert.deepEqual((await scopeRuns(t)).map((entry) => [entry['key'], entry['phase'], entry['exit']]).sort(), [['app/typecheck', 'green', 0], ['app/unit', 'green', 0]]);
      assert.ok(!(await gateNames(t)).includes('check-only-unauthorized'), 'the answer to checks-offer is the consent for the all form');
      assert.deepEqual(gapsOf(await t.ledger()).filter((gap) => /skipped|not run/.test(gap)), []);
    });
  });

  it('a named iteration runs the file-scoped checks with no question; a key without a file form is offered by name, and skipping it names it in the gap', async () => {
    const FILE_ONLY = CONFIG.replace(/^\s+typecheck:.*\n/m, '');
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      assert.equal((await green(t)).position, 'review-agent', 'no full key: no checks question at all');
      assert.equal((await t.review([])).position, 'write');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'"]);
      assert.deepEqual(await gateNames(t), []);
      assert.ok(!gapsOf(await t.ledger()).some((gap) => /checks skipped/.test(gap)));
    }, { config: FILE_ONLY, askChecks: true });
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      const offer = await green(t);
      assert.equal(offer.position, 'checks-offer');
      assert.match(offer.text, /app\/typecheck/, 'the question names the full key it would run');
      assert.doesNotMatch(offer.text, /app\/unit/);
      assert.equal((await t.hook('checks-offer', SKIP)).position, 'review-agent');
      assert.equal((await t.review([])).position, 'write');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'"], 'the scoped key ran without being asked, the full key did not');
      assert.ok(gapsOf(await t.ledger()).includes('checks skipped: app/typecheck — verification incomplete'), gapsOf(await t.ledger()).join('\n'));
    });
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      await green(t);
      assert.equal((await t.hook('checks-offer', 'run')).position, 'review-agent');
      assert.equal((await t.review([])).position, 'write');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'", 'tsc --noEmit']);
      assert.ok(!gapsOf(await t.ledger()).some((gap) => /checks skipped/.test(gap)));
    });
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      await green(t);
      assert.ok(!(await gateNames(t)).includes('checks-offer'), 'no runnable check: nothing to offer');
    }, { config: NO_CHECKS, askChecks: true });
  });

  it('headless starts no reviewer and waits for no one: the review gap derived from the route mode, the scoped checks run, the full key takes the checks-offer skip default', async () => {
    const SKIPPED = 'checks skipped: app/typecheck — verification incomplete';
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: TEXT.replace(' iteration 1', ''), headless: true });
      await t.edit();
      assert.equal((await green(t)).position, 'write');
      assert.deepEqual(await gateNames(t), ['checks-offer']);
      assert.equal((await t.kinds('review')).length, 0);
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'"]);
      assert.ok(gapsOf(await t.ledger()).includes(SKIPPED), gapsOf(await t.ledger()).join('\n'));
      assert.equal(gapsOf(await t.ledger()).filter((gap) => /independent review.*not run.*headless/i.test(gap)).length, 1, 'a headless run states the review was not run');
    });
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2`, headless: true });
      await t.edit();
      assert.equal((await green(t)).position, 'write', 'a named iteration in a headless run starts no review');
      assert.deepEqual(await gateNames(t), ['checks-offer']);
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'"], 'the full key is never run unasked');
      assert.ok(gapsOf(await t.ledger()).includes(SKIPPED), gapsOf(await t.ledger()).join('\n'));
    });
  });

  it('with no runnable check the end step does nothing, and the report adds no check gap line for it', async () => {
    await withTask(async (t) => {
      await t.start({ text: TEXT.replace(' iteration 1', ''), headless: true });
      await t.edit();
      assert.equal((await t.next({ cause: 'route-next' })).position, 'write');
      assert.deepEqual(ran(t), []);
      assert.deepEqual(gapsOf(await t.ledger()), ['The independent review was not run: the run was headless']);
    }, { config: NO_CHECKS, askChecks: true });
  });

  it('a red end check goes back to the implementer once on its own, with the output; only the red key runs again; a still-red key is asked about and headless takes the default', async () => {
    await withTask(async (t) => {
      t.runner.outFor = (command) => (command.startsWith('jest') ? { exitCode: 1, stdout: FAIL } : null);
      await t.start({ text: TEXT.replace(' iteration 1', ''), headless: true });
      await t.edit();
      const fix = await green(t);
      assert.equal(fix.position, 'fix');
      const work = await t.work('fix');
      const red = (await t.kinds('check')).findLast((entry) => entry['exit'] === 1)!;
      const file = String(red['output']);
      assert.ok(work.includes(`app/unit exited non-zero: exit 1; ${String(red['bytes'])} bytes of output in ${file}`), work);
      assert.doesNotMatch(work, /expected 0 received NaN/, 'the work file points at the output, it does not carry it');
      const saved = await readFile(path.join(t.fx.repo.root, file), 'utf8');
      assert.ok(saved.includes(FAIL));
      assert.equal(red['bytes'], Buffer.byteLength(saved));
      assert.doesNotMatch(work, /app\/typecheck/, 'a green key is not part of the fix');
      const after = await green(t);
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'", "jest 'src/orders.ts'"], 'the second run is the red key alone; the full key was skipped by default');
      assert.deepEqual(await gateNames(t), ['checks-offer', 'checks-again'], 'a second round is a question; headless takes the default without asking');
      assert.equal((await t.kinds('default-taken')).findLast((entry) => entry['gate'] === 'checks-again')?.['answer'], REPORT_GAP);
      assert.ok(gapsOf(await t.ledger()).some((gap) => /^app\/unit: last run: exit 1; \d+ bytes of output in \.ambicode\/tasks\/ord-7\/checks\/app-unit_\d+\.log$/.test(gap)), gapsOf(await t.ledger()).join('\n'));
      assert.doesNotMatch(after.text, /^$/);
    });
  });

  it('a long red check output reaches the implementer whole in its file; the revise args carry the path, not the text', async () => {
    await withTask(async (t) => {
      const trailer = `${'at frame '.repeat(300)}end-of-trace\n`;
      t.runner.outFor = (command) => (command.startsWith('jest') ? { exitCode: 1, stdout: `${FAIL}${trailer}` } : null);
      await t.start({ text: TEXT.replace(' iteration 1', ''), headless: true });
      await t.edit();
      await green(t);
      const args = (await t.kinds('revise')).find((entry) => entry['reason'] === 'scope-checks: checks-red')?.['args'] as Record<string, string[]> | undefined;
      const lines = args?.['Failing checks'] ?? [];
      assert.ok(trailer.length > 1500);
      assert.equal(lines.length, 1);
      assert.ok(lines[0]!.length < 300, lines[0]);
      const red = (await t.kinds('check')).findLast((entry) => entry['exit'] === 1)!;
      const file = String(red['output']);
      assert.equal(lines[0], `app/unit exited non-zero: exit 1; ${String(red['bytes'])} bytes of output in ${file}`);
      assert.ok((await readFile(path.join(t.fx.repo.root, file), 'utf8')).includes(`${FAIL}${trailer}`), 'the whole output, first line to the end of the trace');
    });
  });

  it('a second red round needs the user: fix goes back to the implementer, report the gap goes on to the report with the red key as a gap', async () => {
    const toSecondRound = async (t: Fixture) => {
      t.runner.outFor = (command) => (command.startsWith('jest') ? { exitCode: 1, stdout: FAIL } : null);
      await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
      await t.edit();
      await green(t);
      assert.equal((await t.hook('checks-offer', 'run')).position, 'review-agent');
      assert.equal((await t.review([])).position, 'fix');
      return green(t);
    };
    await withTask(async (t) => {
      const asked = await toSecondRound(t);
      assert.equal(asked.position, 'scope-checks');
      assert.deepEqual(await gateNames(t), ['checks-offer', 'checks-again']);
      t.runner.outFor = null;
      t.runner.out = { exitCode: 0, stdout: '' };
      assert.equal((await t.hook('checks-again', 'fix')).position, 'fix', 'the user chose another round');
      assert.equal((await green(t)).position, 'report-step', 'the fix changed the code after the review: review-again is asked');
      assert.equal((await t.hook('review-again', 'skip')).position, 'write');
      assert.deepEqual(ran(t).filter((call) => call.startsWith('jest')), ["jest 'src/orders.ts'", "jest 'src/orders.ts'", "jest 'src/orders.ts'"]);
      assert.ok(!gapsOf(await t.ledger()).some((gap) => /^app\/unit/.test(gap)), 'a later green pass of the key closes the gap');
    });
    await withTask(async (t) => {
      await toSecondRound(t);
      await t.hook('checks-again', REPORT_GAP);
      await t.hook('review-again', 'skip');
      assert.ok(gapsOf(await t.ledger()).some((gap) => /^app\/unit: last run: exit 1; /.test(gap)), 'never reported as clean');
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'blocked');
    });
  });

  it('the work brief tells the implementer a check without a file form is the end step\'s, and never to run it directly', async () => {
    await withTask(async (t) => {
      await t.start({ text: `${TEXT} iteration 1` });
      const work = await t.work();
      assert.match(work, /typecheck \(no file form: left to the end step, never run it\)/);
      assert.match(work, /unit \(--file runs freely, all needs approval\)/);
    });
  });
});

describe('task route: a propose key and a full key need the human\'s answer (F13)', { concurrency: 4 }, () => {
  /** unit (run), e2e (propose, file form only): typecheck is left out so the all form is not in the way. */
  const PROPOSE = CHECK_CONFIG.split('\n').filter((line) => !/^\s+(lint|typecheck):/.test(line)).join('\n');
  const UNNAMED = TEXT.replace(' iteration 1', '');
  const pw = (t: Fixture): string[] => ran(t).filter((call) => call.startsWith('pw'));
  const GATE = 'check-only-unauthorized';

  it('interactive, no named iteration: the end step parks at check-only-unauthorized for the propose key, runs nothing before the answer, then runs it on approve', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: UNNAMED });
      await t.edit();
      await green(t);
      const parked = await t.review([]);
      assert.equal(parked.position, 'scope-checks');
      assert.match(parked.text, /app\/e2e/, 'the question names the key');
      assert.deepEqual(pw(t), [], 'no process for the propose key before the answer');
      assert.ok((await gateNames(t)).includes(GATE));
      assert.equal((await t.hook(GATE, 'approve')).position, 'write');
      assert.deepEqual(pw(t), ["pw 'src/orders.ts'"]);
    }, { config: PROPOSE, askChecks: true });
  });

  it('interactive, declined: the propose key never runs and the others do', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: UNNAMED });
      await t.edit();
      await green(t);
      await t.review([]);
      assert.equal((await t.hook(GATE, 'decline')).position, 'write');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'"]);
      assert.ok(gapsOf(await t.ledger()).includes(`${GATE}: declined "decline" for app/e2e on src/orders.ts`), gapsOf(await t.ledger()).join('\n'));
    }, { config: PROPOSE, askChecks: true });
  });

  it('headless: the propose key is not run, the gate takes its decline default, and the report lists it under Not verified', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: UNNAMED, headless: true });
      await t.edit();
      assert.equal((await green(t)).position, 'write');
      assert.deepEqual(pw(t), []);
      const taken = (await t.kinds('default-taken')).filter((entry) => entry['gate'] === GATE);
      assert.deepEqual(taken.map((entry) => [entry['answer'], entry['via']]), [['decline', 'headless']]);
      assert.ok(gapsOf(await t.ledger()).some((gap) => gap.startsWith(`${GATE}: default taken, "decline"`)), gapsOf(await t.ledger()).join('\n'));
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'"]);
    }, { config: PROPOSE, askChecks: true });
  });

  describe('two propose keys, each asked on its own print', () => {
    const TWO_PROPOSE ={ config: PROPOSE, pack: COMMAND_PACK.replace('{ command: unit, action: run, reason: "unit" }', '{ command: unit, action: propose, reason: "unit" }'), askChecks: true };
    const prints = async (t: Fixture) => (await t.kinds('gate')).filter((entry) => entry['gate'] === GATE);
    // The implementer's `check` raises one print per key; the end step then judges both keys, so each answer must count for its own key only.
    it('interactive: each key is asked on its own print, and the second answer does not take the first key back; the route goes on with two prints', async () => {
      await withTask(async (t) => {
        await t.start({ plan: PLAN, text: `${TEXT} iteration 2` });
        await t.edit();
        assert.equal((await t.runCheck({ name: 'unit' })).outcome, 'waiting');
        await t.hook(GATE, 'approve');
        assert.equal((await t.runCheck({ name: 'e2e' })).outcome, 'waiting');
        await t.hook(GATE, 'approve');
        assert.equal((await prints(t)).length, 2);
        assert.equal((await t.runCheck({ name: 'unit' })).outcome, 'ran', 'the first key is still approved');
        assert.equal((await t.runCheck({ name: 'e2e' })).outcome, 'ran');
        assert.equal((await green(t)).position, 'review-agent');
        assert.equal((await t.review([])).position, 'write');
        assert.equal((await prints(t)).length, 2, 'no third question');
        assert.deepEqual(ran(t), ["jest 'src/a.spec.ts'", "jest 'src/orders.ts'", "pw 'src/a.spec.ts'", "pw 'src/orders.ts'"], 'each key once by the implementer and once by the end step');
      }, TWO_PROPOSE);
    });

    it('a key approved on an earlier print runs once in the whole route: the end step asks the second key, and its answer does not run the first again (review M1)', async () => {
      await withTask(async (t) => {
        await t.start({ plan: PLAN, text: UNNAMED });
        await t.edit();
        assert.equal((await t.runCheck({ name: 'unit' })).outcome, 'waiting');
        await t.hook(GATE, 'approve');
        await green(t);
        const parked = await t.review([]);
        assert.equal(parked.position, 'scope-checks');
        assert.match(parked.text, /app\/e2e/);
        assert.equal((await t.hook(GATE, 'approve')).position, 'write');
        assert.deepEqual(ran(t).filter((call) => call.startsWith('jest')), ["jest 'src/orders.ts'"], 'unit spawned once');
        assert.deepEqual(pw(t), ["pw 'src/orders.ts'"]);
      }, TWO_PROPOSE);
    });

    it('the end step raises one print per key: its own key and only its own files, and an all-form key says the whole project (review M3)', async () => {
      const ALL_FORM = { config: CHECK_CONFIG.split('\n').filter((line) => !/^\s+lint:/.test(line)).join('\n'), pack: COMMAND_PACK.replace('  - { command: lint,', '  - { command: typecheck, action: propose, reason: "tc" }\n  - { command: lint,'), askChecks: true };
      await withTask(async (t) => {
        await t.start({ plan: PLAN, text: UNNAMED });
        await t.edit();
        assert.equal((await green(t)).position, 'checks-offer');
        assert.equal((await t.hook('checks-offer', 'run')).position, 'review-agent');
        const first = await t.review([]);
        assert.equal(first.position, 'scope-checks');
        assert.deepEqual((await prints(t)).map((entry) => entry['values']), [{ key: ['app/e2e'], files: ['src/orders.ts'] }]);
        assert.match(first.text, /Run app\/e2e on src\/orders\.ts\?/);
        const second = await t.hook(GATE, 'approve');
        assert.equal(second.position, 'scope-checks');
        assert.deepEqual((await prints(t)).map((entry) => entry['values']).at(-1), { key: ['app/typecheck'], files: [] });
        assert.match(second.text, /Run app\/typecheck on the whole project\?/);
        assert.equal((await t.hook(GATE, 'approve')).position, 'write');
        assert.equal((await prints(t)).length, 2);
        assert.deepEqual(ran(t), ["jest 'src/orders.ts'", "pw 'src/orders.ts'", 'tsc --noEmit'], 'each key once');
      }, ALL_FORM);
    });

    it('headless: each key takes its own decline default and the report names each with its own scope; the route ends with no key run', async () => {
      await withTask(async (t) => {
        await t.start({ plan: PLAN, text: UNNAMED, headless: true });
        await t.edit();
        assert.equal((await green(t)).position, 'write');
        assert.deepEqual(ran(t), []);
        const taken = (await t.kinds('default-taken')).filter((entry) => entry['gate'] === GATE);
        assert.equal(taken.length, 2, 'one default per key');
        const gaps = gapsOf(await t.ledger()).filter((gap) => gap.startsWith(GATE));
        assert.deepEqual(gaps, [`${GATE}: default taken, "decline" (headless) for app/e2e on src/orders.ts`, `${GATE}: default taken, "decline" (headless) for app/unit on src/orders.ts`]);
      }, TWO_PROPOSE);
    });
  });

  it('a key with no file form is asked once by checks-offer before it runs, with no named iteration too; skipping names it in the gap', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: UNNAMED });
      await t.edit();
      const offer = await green(t);
      assert.equal(offer.position, 'checks-offer');
      assert.match(offer.text, /app\/typecheck/);
      assert.deepEqual(ran(t), [], 'nothing ran before the answer');
      assert.equal((await t.hook('checks-offer', 'run')).position, 'review-agent');
      assert.equal((await t.review([])).position, 'write');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'", 'tsc --noEmit']);
      assert.deepEqual((await gateNames(t)).filter((gate) => gate === 'checks-offer'), ['checks-offer'], 'asked once');
    });
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: UNNAMED });
      await t.edit();
      await green(t);
      await t.hook('checks-offer', SKIP);
      assert.equal((await t.review([])).position, 'write');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'"]);
      assert.ok(gapsOf(await t.ledger()).includes('checks skipped: app/typecheck — verification incomplete'), gapsOf(await t.ledger()).join('\n'));
    });
  });

  it('headless: a key with no file form is never run unasked; the checks-offer default skips it and the report says so', async () => {
    await withTask(async (t) => {
      await t.start({ plan: PLAN, text: UNNAMED, headless: true });
      await t.edit();
      assert.equal((await green(t)).position, 'write');
      assert.deepEqual(ran(t), ["jest 'src/orders.ts'"]);
      assert.ok(gapsOf(await t.ledger()).includes('checks skipped: app/typecheck — verification incomplete'), gapsOf(await t.ledger()).join('\n'));
    });
  });
});
