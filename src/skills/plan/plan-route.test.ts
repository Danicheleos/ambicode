import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { answerGates } from '#hook/events/gate-answer';
import { runHook } from '#hook/events/run-hook';
import { buildReport } from '#modules/evidence/report/report';
import { appendLedger } from '#platform/ledger/ledger';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { PLAN_TASK, planFixture, type PlanFixture } from '#testing/fixtures/plan-fixture';
import { CONFIG } from '#testing/fixtures/route-fixture';
import { REPO_ROOT } from '#testing/paths';
import { SESSION_A, SESSION_B } from '#testing/fixtures/ids';

/** SHA-256 of routes/plan/plan.yaml. */
const CONTRACT_SHA256 = '78d70f8c6e809a8c419c4ae9fbcae9755e854d5118190a7e4975fd6f64f2ff0b';
const GOOD = '# Plan\n\n- *Changes*: `src/orders/limit.ts:1` `orderLimit`\n';
const BAD = '# Plan\n\n- *Changes*: `src/orders/limit.ts:40` `orderLimit`\n';
const PLATFORM = { askBinding: 'supported', answerContext: 'supported' } as const;

const shipped = (): Promise<PlanFixture> => planFixture({ shipped: true });
const taskDir = (plan: PlanFixture): string => path.join(plan.fx.repo.root, '.ambicode', 'tasks', PLAN_TASK);
const notes = async (plan: PlanFixture, kind: string) => (await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === kind);
const steps = async (plan: PlanFixture, step: string, status: string) => (await plan.fx.kinds(PLAN_TASK, 'step')).filter((entry) => entry['step'] === step && entry['status'] === status);
const lastPrint = async (plan: PlanFixture) => (await plan.prints()).at(-1)!;

/** The model's call: write the body, then `route next` runs the plan-check step. */
async function planCheck(plan: PlanFixture, body: string) {
  await plan.body(body);
  return plan.next();
}

/** Start, then deliver plan-write: the point where the model writes its body. */
async function toWrite(plan: PlanFixture, input: Parameters<PlanFixture['start']>[0] = {}) {
  await plan.start(input);
  return plan.next();
}

const hookAnswer = (plan: PlanFixture, question: string, label: string, options: string[]) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'AskUserQuestion',
  session_id: SESSION_A,
  cwd: plan.fx.repo.root,
  scratchpad_dir: plan.fx.scratchpad,
  tool_input: { questions: [{ question, options: options.map((value) => ({ label: value })) }] },
  tool_response: { answers: { [question]: label } },
});
const hookDeps = (plan: PlanFixture) => ({ engine: plan.fx.engine, routes: plan.fx.routes, pointer: plan.fx.pointer });

describe('06-R1/06-R2 the shipped plan route', () => {
  it('06-R2: with a requirement, fetch is delivered first', async () => {
    const plan = await shipped();
    try {
      const first = await plan.start({ requirements: ['https://example.atlassian.net/browse/ORD-17'] });
      assert.equal(first.position, 'fetch');
    } finally {
      await plan.dispose();
    }
  });

  it('06-R1: routes/plan/plan.yaml is the Contract YAML, parses cleanly, builds, is packaged and marks Accept and Revise acting', async () => {
    const text = await readFile(path.join(REPO_ROOT, 'routes', 'plan', 'plan.yaml'), 'utf8');
    assert.equal(createHash('sha256').update(text).digest('hex'), CONTRACT_SHA256);
    assert.deepEqual(YAML.parseDocument(text).errors, []);
    const route = YAML.parse(text) as { steps: { id: string; gate?: { acting?: string[] } }[] };
    assert.deepEqual(route.steps.map((step) => step.id), ['fetch', 'ground', 'design', 'plan-step', 'plan-write', 'plan-check', 'plan-accept', 'promote']);
    assert.deepEqual(route.steps.find((step) => step.id === 'plan-accept')?.gate?.acting, ['Accept', 'Revise']);
    assert.match(await readFile(path.join(REPO_ROOT, 'tools', 'package-candidate.mjs'), 'utf8'), /from: 'routes', extensions: \['\.yaml', '\.md'\]/);
    const plan = await shipped();
    await plan.dispose();
  });

  it('06-R2: each step text is at most 1,500 characters and names --task', async () => {
    for (const name of ['plan/fetch', 'plan/design', 'plan/write']) {
      const text = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
      assert.ok(text.length <= 1500, `${name}: ${text.length}`);
      assert.match(text, /--task \{task\}/, name);
    }
    const write = await readFile(path.join(REPO_ROOT, 'routes', 'plan', 'write.md'), 'utf8');
    assert.match(write, /steps\/plan-body\.md.*route next --task \{task\}/);
    assert.match(await readFile(path.join(REPO_ROOT, 'routes', 'plan', 'design.md'), 'utf8'), /\[ambicode gate decision:<slug>\]/);
  });

  it('06-H1: the start, design and plan-write deliveries stay within their byte caps', async () => {
    const plan = await shipped();
    try {
      const first = await plan.start();
      assert.equal(first.position, 'design');
      assert.ok(first.bytes <= 4096, `start ${first.bytes}`);
      const write = await plan.next();
      assert.equal(write.position, 'plan-write');
      assert.ok(write.bytes <= 3072, `plan-write ${write.bytes}`);
      const checked = await planCheck(plan, BAD);
      assert.ok(JSON.stringify(checked).length <= 8000);
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-P5/06-P6/06-P7 write and check', () => {
  it('06-P5/D1: one plan check saves once and checks once; a route next at plan-check runs the run list once', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan);
      const out = await planCheck(plan, GOOD);
      assert.equal(out.position, 'plan-accept');
      assert.equal((await notes(plan, 'plan-draft')).length, 1);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).length, 1);
      assert.equal((await steps(plan, 'plan-write', 'completed')).length, 1);
      assert.equal((await lastPrint(plan))['gate'], 'plan-accept');
    } finally {
      await plan.dispose();
    }
    const viaNext = await shipped();
    try {
      await toWrite(viaNext);
      await viaNext.body(GOOD);
      assert.equal((await viaNext.next()).position, 'plan-accept');
      assert.equal((await notes(viaNext, 'plan-draft')).length, 1);
      assert.equal((await viaNext.fx.kinds(PLAN_TASK, 'worker')).length, 1);
    } finally {
      await viaNext.dispose();
    }
  });

  it('S4 06-P6: a failing check is recorded and the bad anchors come back to plan-write as a section; the draft stays', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan);
      const failed = await planCheck(plan, BAD);
      assert.equal(failed.position, 'plan-write');
      assert.match(failed.text, /## Plan check failed/);
      assert.match(failed.text, /bad anchor: src\/orders\/limit\.ts:40 line-out-of-range/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).length, 1);
      assert.equal((await notes(plan, 'plan-draft')).length, 1, '06-P9: the failed draft stays');
      assert.equal((await planCheck(plan, GOOD)).position, 'plan-accept');
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-R4/06-R5/06-R6 the plan-accept gate', () => {
  it('06-R4/D11: the gate prints the draft, its hash, the marker and the Revise count; the draft precedes any acceptance', async () => {
    const plan = await shipped();
    try {
      const gate = await plan.toGate();
      assert.equal(gate.position, 'plan-accept');
      const print = await lastPrint(plan);
      assert.match(gate.text, new RegExp(`\\[ambicode gate plan-accept ${print.id}\\]`));
      assert.match(gate.text, /plan-draft_.*\.md [0-9a-f]{12}/);
      assert.match(gate.text, /Revise \(3 left\)/);
      await plan.hook('plan-accept', 'Accept', print.id);
      const ledger = await plan.fx.ledger(PLAN_TASK);
      const draftAt = ledger.findIndex((entry) => entry.kind === 'note' && entry['note'] === 'plan-draft');
      const acceptedAt = ledger.findIndex((entry) => entry.kind === 'acceptance' && entry['gate'] === 'plan-accept');
      assert.ok(draftAt >= 0 && draftAt < acceptedAt);
    } finally {
      await plan.dispose();
    }
  });

  it('06-R6/06-R7 #105: Accept through the hook promotes once, completes the route, and note promote asks nothing again', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      const done = await answerGates(plan.fx.runtime, hookAnswer(plan, `Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'Accept', ['Accept', 'Revise', 'Reject']) as never, hookDeps(plan), PLATFORM);
      assert.notEqual(done, null);
      const promoted = await notes(plan, 'plan');
      assert.equal(promoted.length, 1);
      assert.ok(typeof promoted[0]!['promotedFrom'] === 'string');
      assert.equal(await plan.fx.engine.live(PLAN_TASK), false);
      assert.equal((await plan.promote()).outcome, 'plan-already-promoted');
      assert.equal((await notes(plan, 'plan')).length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('S3/S13 06-R6: accept A after draft B → re-print for B with no new write or check; Accept B promotes once; a stray instance binds nothing', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const printA = await lastPrint(plan);
      await plan.saveDraft('# Plan\n\n1. Different.\n');
      const [writes, workers] = [(await steps(plan, 'plan-write', 'delivered')).length, (await plan.fx.kinds(PLAN_TASK, 'worker')).length];
      const reask = await plan.hook('plan-accept', 'Accept', printA.id);
      assert.equal(reask.position, 'plan-accept');
      const printB = await lastPrint(plan);
      assert.notEqual(printB.id, printA.id);
      assert.notEqual((printB['object'] as { contentHash: string }).contentHash, (printA['object'] as { contentHash: string }).contentHash);
      assert.equal((await steps(plan, 'plan-write', 'delivered')).length, writes);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).length, workers);
      const stray = await plan.hook('plan-accept', 'Accept', '99');
      assert.equal(stray.position, 'plan-accept');
      assert.equal((await notes(plan, 'plan')).length, 0);
      assert.equal((await plan.hook('plan-accept', 'Accept', (await lastPrint(plan)).id)).position, 'complete');
      assert.equal((await notes(plan, 'plan')).length, 1);
      assert.equal((await readdir(taskDir(plan))).filter((name) => name.startsWith('plan_')).length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('S5 06-R5: a model revise uses design\'s repeat; a human Revise resets the counters; a flag Revise is declined', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      await plan.next({ revise: 'design' });
      const modelRevise = (await plan.fx.kinds(PLAN_TASK, 'revise')).at(-1)!;
      assert.equal(modelRevise['via'], 'model');
      await plan.next();
      await plan.body('# Plan\n\n1. Do it.\n');
      await plan.next();
      await plan.hook('plan-accept', 'Revise', (await lastPrint(plan)).id);
      const human = (await plan.fx.kinds(PLAN_TASK, 'revise')).at(-1)!;
      assert.equal(human['via'], 'gate');
      await plan.next();
      assert.equal((await steps(plan, 'plan-step', 'completed')).length, 2);
      await plan.next({ revise: 'design' });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'limit')).length, 0, 'design has its repeat back after the human cycle');
      await plan.next();
      await plan.body('# Plan\n\n1. Again.\n');
      await plan.next();
      const revises = (await plan.fx.kinds(PLAN_TASK, 'revise')).length;
      await plan.next({ answers: [{ gate: 'plan-accept', option: 'Revise' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).length, revises, 'only the user sends the plan back');
      assert.deepEqual([(await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!['answer'], (await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!['reason']], ['Revise', 'acting-needs-human']);
    } finally {
      await plan.dispose();
    }
  });

  it('06-R5: the fourth Revise shows (0 left) and is declined as max-revises', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      for (let cycle = 0; cycle < 3; cycle += 1) {
        await plan.hook('plan-accept', 'Revise', (await lastPrint(plan)).id);
        await plan.next();
        await plan.body(`# Plan ${cycle}\n`);
        await plan.next();
      }
      const gate = await plan.next();
      assert.match(gate.text, /Revise \(0 left/);
      await plan.hook('plan-accept', 'Revise', (await lastPrint(plan)).id);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!['reason'], 'max-revises');
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-R8/06-R9/06-H4 acting authority', () => {
  it('S1 06-R1/06-R8: an untrusted headless --answer plan-accept=Accept is declined, no preanswer, Reject by default, nothing promoted', async () => {
    const plan = await shipped();
    try {
      await plan.start({ channel: 'cli', headless: true, answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'preanswer')).length, 0);
      const declined = (await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!;
      assert.deepEqual([declined['reason'], declined['via']], ['acting-needs-human', 'flag']);
      await plan.next();
      await plan.body(GOOD);
      await plan.next();
      const taken = (await plan.fx.kinds(PLAN_TASK, 'default-taken')).at(-1)!;
      assert.deepEqual([taken['answer'], taken['via']], ['Reject', 'headless']);
      assert.equal((await notes(plan, 'plan')).length, 0);
    } finally {
      await plan.dispose();
    }
  });

  it('S14 06-R9/06-H4: a failed check never reaches the gate, so a trusted Accept preanswer promotes nothing', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan, { answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'preanswer')).length, 1);
      assert.equal((await planCheck(plan, BAD)).position, 'plan-write');
      assert.equal((await notes(plan, 'plan')).length, 0);
    } finally {
      await plan.dispose();
    }
  });

  it('a user-set headless run whose check keeps failing hands the last draft to the gate with the failure and no Revise', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan, { headless: true, answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      let message = await planCheck(plan, BAD);
      for (let round = 0; round < 3 && message.position === 'plan-write'; round += 1) message = await planCheck(plan, BAD);
      const print = (await plan.fx.kinds(PLAN_TASK, 'gate')).findLast((entry) => entry['gate'] === 'plan-accept')!;
      assert.deepEqual(print['options'], ['Accept', 'Reject']);
      assert.match(String(print['question']), /Plan check FAILED: 1 bad anchors\..*Headless: this draft is accepted or rejected as it is, never revised\./s);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).filter((entry) => entry['via'] === 'gate').length, 0);
    } finally {
      await plan.dispose();
    }
  });

  it('a user-set headless run without an Accept preanswer ends with the draft', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan, { headless: true });
      await planCheck(plan, GOOD);
      const taken = (await plan.fx.kinds(PLAN_TASK, 'default-taken')).at(-1)!;
      assert.deepEqual([taken['answer'], taken['via']], ['Reject', 'headless']);
      assert.equal((await notes(plan, 'plan')).length, 0);
    } finally {
      await plan.dispose();
    }
  });

});

describe('06-H3 without hook support', () => {
  it('06-H3: with AskUserQuestion binding unsupported, a hook Accept binds nothing and a flag Accept stays declined', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      const unsupported = { askBinding: 'unsupported', answerContext: 'unsupported' } as const;
      assert.equal(await answerGates(plan.fx.runtime, hookAnswer(plan, `Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'Accept', ['Accept', 'Revise', 'Reject']) as never, hookDeps(plan), unsupported), null);
      await plan.next({ answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!['reason'], 'acting-needs-human');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'acceptance')).filter((entry) => entry['gate'] === 'plan-accept').length, 0);
      assert.equal((await notes(plan, 'plan')).length, 0);
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-R3 decision gates', () => {
  it('06-R3: a design AskUserQuestion with the decision marker records gate {class: decision} and acceptance {via: hook}', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      const question = 'Store the limit per customer or per order? [ambicode gate decision:limit-scope]';
      await answerGates(plan.fx.runtime, hookAnswer(plan, question, 'Per order', ['Per customer', 'Per order']) as never, hookDeps(plan), PLATFORM);
      const gate = (await plan.prints()).find((entry) => entry['gate'] === 'decision:limit-scope');
      assert.equal(gate?.['class'], 'decision');
      const acceptance = (await plan.fx.kinds(PLAN_TASK, 'acceptance')).find((entry) => entry['gate'] === 'decision:limit-scope');
      assert.deepEqual([acceptance?.['via'], acceptance?.['answer']], ['hook', 'Per order']);
      assert.equal(plan.fx.routes.gates().find((entry) => entry.id === 'decision:*')?.default, 'keep open');
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-P9/D1 interruption', () => {
  it('S10: route next after a completed check run is idempotent for the draft: a repeated check saves one more draft and no draft is deleted', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan);
      await plan.body(GOOD);
      await plan.saveDraft(GOOD);
      assert.equal((await plan.next()).position, 'plan-accept');
      assert.equal((await notes(plan, 'plan-draft')).length, 2);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).length, 1);
      assert.equal((await readdir(taskDir(plan))).filter((name) => name.startsWith('plan-draft_')).length, 2);
    } finally {
      await plan.dispose();
    }
  });

  it('S10 06-P9: no crash repair exists: promoting after a crash between rename and ledger entry fails plan-draft-missing', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      await plan.hook('plan-accept', 'Accept', (await lastPrint(plan)).id);
      const ledger = await plan.fx.ledger(PLAN_TASK);
      const promoted = ledger.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan')!;
      const kept = ledger.filter((entry) => entry.id !== promoted.id && !(entry.kind === 'step' && entry['step'] === 'promote'));
      await writeFile(path.join(taskDir(plan), 'ledger.jsonl'), kept.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
      await assert.rejects(plan.promote(), (error: { code?: string }) => error.code === 'plan-draft-missing');
      assert.equal((await notes(plan, 'plan')).length, 0);
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-N2 write-time ownership on the shipped route', () => {
  it('S11: another session is route-busy; after --fresh the old owner is refused every write, and time changes nothing', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan);
      await assert.rejects(plan.start({ session: SESSION_B }), (error: { code?: string }) => error.code === 'route-busy');
      await plan.start({ session: SESSION_B, fresh: true });
      plan.fx.advanceClock(60 * 60_000);
      const taken = (error: { code?: string }) => error.code === 'route-taken-over' || error.code === 'route-not-open';
      await assert.rejects(plan.next(), taken);
      await assert.rejects(plan.saveDraft('# Plan\n'), taken);
      await assert.rejects(plan.promote(SESSION_A), taken);
      assert.equal((await notes(plan, 'plan-draft')).length, 0);
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-R11 launch', () => {
  it('06-R11: a typed /ambicode:plan starts the shipped route on the hook channel and runs no prepare', async () => {
    const plan = await shipped();
    try {
      const deps = { pointer: plan.fx.pointer, load: async () => hookDeps(plan) };
      const output = (await runHook(plan.fx.runtime, JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: SESSION_A, cwd: plan.fx.repo.root, scratchpad_dir: plan.fx.scratchpad, prompt: `/ambicode:plan add an order limit --task ${PLAN_TASK}` }), deps)) as { hookSpecificOutput?: { additionalContext: string } };
      const text = output.hookSpecificOutput?.additionalContext ?? '';
      assert.match(text, new RegExp(`\\[ambicode\\] plan · task ${PLAN_TASK} · step design`));
      assert.doesNotMatch(text, /AMBICODE ran `prepare/);
      const route = (await plan.fx.kinds(PLAN_TASK, 'route'))[0]!;
      assert.equal(route['channel'], 'hook');
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-C7 project answers', () => {
  it('06-C7: the project answered in one task is not asked again by another task of the same session', async () => {
    const config = CONFIG.replace(/  - \{ id: app,.*\}$/, '  - { id: orders, root: "src/orders", paths: [src/orders/], ecosystem: { languages: [typescript], frameworks: [], packageManager: null } }\n  - { id: invoices, root: "src/invoices", paths: [src/invoices/], ecosystem: { languages: [typescript], frameworks: [], packageManager: null } }');
    const plan = await planFixture({ shipped: true, config });
    try {
      await plan.start({ text: 'Add orderLimit' });
      assert.equal((await plan.next({ project: 'orders' })).position, 'design');
      assert.equal((await plan.start({ text: 'Add another limit', task: 'second-task' })).position, 'design');
    } finally {
      await plan.dispose();
    }
  });

});
