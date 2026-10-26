import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { answerGates } from '#hook/events/gate-answer';
import { runHook } from '#hook/events/run-hook';
import { gapsOf } from '#modules/evidence/report/report';
import { PLAN_TASK, planFixture, type PlanFixture } from '#testing/fixtures/plan-fixture';
import { CONFIG } from '#testing/fixtures/route-fixture';
import { REPO_ROOT } from '#testing/paths';
import { SESSION_A, SESSION_B } from '#testing/fixtures/ids';

/** SHA-256 of routes/plan/plan.yaml. */
const CONTRACT_SHA256 = '5ce708a5bcaf6f929142b38df5af45f66127b52dc979910443bfa8308942ed8c';
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

/** Start: the merged design step is the point where the model designs and writes its body. */
async function toDesign(plan: PlanFixture, input: Parameters<PlanFixture['start']>[0] = {}) {
  return plan.start(input);
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
const hookDeps = (plan: PlanFixture) => ({ engine: plan.fx.engine, routes: plan.fx.routes });

describe('06-R1/06-R2 the shipped plan route', { concurrency: 4 }, () => {
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
    assert.deepEqual(route.steps.map((step) => step.id), ['fetch', 'ground', 'design', 'plan-check', 'plan-accept', 'promote']);
    assert.deepEqual(route.steps.find((step) => step.id === 'plan-accept')?.gate?.acting, ['Accept', 'Revise']);
    assert.match(await readFile(path.join(REPO_ROOT, 'tools', 'package-candidate.mjs'), 'utf8'), /from: 'routes', extensions: \['\.yaml', '\.md'\]/);
    const plan = await shipped();
    await plan.dispose();
  });

  it('06-R2: each step text is at most 1,500 characters and leaves the Then command to the step header', async () => {
    for (const name of ['investigate/fetch', 'plan/design']) {
      const text = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
      assert.ok(text.length <= 1500, `${name}: ${text.length}`);
      assert.doesNotMatch(text, /route next/, name);
    }
    const write = await readFile(path.join(REPO_ROOT, 'routes', 'plan', 'design.md'), 'utf8');
    assert.match(write, /\{steps\}\/plan-body\.md/);
    assert.match(write, /never a bare name/);
    assert.match(write, /a file read and ruled out goes unnamed here too, even as unaffected|Name only files the plan changes or reuses/i);
    assert.match(write, /fix only those lines with Edit/);
    assert.match(write, /## Iteration N: <title>/);
    assert.match(write, /\[ambicode gate decision:<slug>\]/);
    assert.doesNotMatch(write, /refs --declarations|\| requirement \| section \| code \|/);
  });

  it('06-H1: the start and the merged design deliveries stay within their byte caps', async () => {
    const plan = await shipped();
    try {
      const first = await plan.start();
      assert.equal(first.position, 'design');
      assert.ok(first.bytes <= 4096, `start ${first.bytes}`);
      assert.match(first.text, /Read the notes of the modules that bear on the task, shared ones included/);
      const checked = await planCheck(plan, BAD);
      assert.ok(JSON.stringify(checked).length <= 8000);
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-P5/06-P6/06-P7 write and check', { concurrency: 4 }, () => {
  it('06-P5/D1: one plan check saves once and checks once; a route next at plan-check runs the run list once', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan);
      const out = await planCheck(plan, GOOD);
      assert.equal(out.position, 'plan-accept');
      assert.equal((await notes(plan, 'plan-draft')).length, 1);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).length, 1);
      assert.equal((await steps(plan, 'design', 'completed')).length, 1);
      assert.equal((await lastPrint(plan))['gate'], 'plan-accept');
    } finally {
      await plan.dispose();
    }
    const viaNext = await shipped();
    try {
      await toDesign(viaNext);
      await viaNext.body(GOOD);
      assert.equal((await viaNext.next()).position, 'plan-accept');
      assert.equal((await notes(viaNext, 'plan-draft')).length, 1);
      assert.equal((await viaNext.fx.kinds(PLAN_TASK, 'worker')).length, 1);
    } finally {
      await viaNext.dispose();
    }
  });

  it('06-P6: the line after the last one is an append point and passes; two past the end fails', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan);
      const append = await planCheck(plan, '# Plan\n\n- *Changes*: `src/orders/limit.ts:3-4` `orderLimit`\n');
      assert.doesNotMatch(append.text, /Plan check FAILED/);
      const worker = (await plan.fx.kinds(PLAN_TASK, 'worker')).at(-1)!;
      assert.equal((worker['summary'] as { failed: boolean }).failed, false);
    } finally {
      await plan.dispose();
    }
    const past = await shipped();
    try {
      await toDesign(past);
      const failed = await planCheck(past, '# Plan\n\n- *Changes*: `src/orders/limit.ts:5` `orderLimit`\n');
      assert.match(failed.text, /src\/orders\/limit\.ts:5 line-out-of-range \(file has 3 lines\)/);
    } finally {
      await past.dispose();
    }
  });

  it('S4 06-P6: a failed check sends the route back to design once with the bad anchors; a second failure goes on to plan-accept as not verified', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan);
      const sent = await planCheck(plan, BAD);
      assert.equal(sent.position, 'design');
      assert.match(sent.text, /## bad anchors\nsrc\/orders\/limit\.ts:40 line-out-of-range \(file has 3 lines\)/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).length, 1);
      const failed = await planCheck(plan, BAD);
      assert.equal(failed.position, 'plan-accept');
      assert.match(failed.text, /Plan check FAILED: 1 bad anchors\.\nsrc\/orders\/limit\.ts:40 line-out-of-range/);
      assert.match(failed.text, /Accept \(/);
      assert.match(failed.text, /Revise \(/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).length, 1, 'no second revise');
      assert.equal((await notes(plan, 'plan-draft')).length, 2, '06-P9: each failed draft stays');
      const gap = gapsOf(await plan.fx.ledger(PLAN_TASK)).join('\n');
      assert.match(gap, /plan-check: 1 bad anchors: src\/orders\/limit\.ts:40 line-out-of-range/);
    } finally {
      await plan.dispose();
    }
  });

  it('the design step names the plan body by its absolute path: the task lives under the repository root, which the session directory need not be', async () => {
    const plan = await shipped();
    try {
      const first = await toDesign(plan);
      assert.ok(first.text.includes(`\`${path.join(await realpath(taskDir(plan)), 'steps', 'plan-body.md')}\``), first.text);
      assert.doesNotMatch(first.text, /to `\.ambicode\//);
    } finally {
      await plan.dispose();
    }
  });

  it('route next with no plan body saved fails the check as a missing body and tells the model where to write it, instead of crashing the script', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan);
      const sent = await plan.next();
      assert.equal(sent.position, 'design');
      const where = path.join(await realpath(taskDir(plan)), 'steps', 'plan-body.md');
      assert.ok(sent.text.includes(`## plan body\n`) && sent.text.includes(where), sent.text);
      const failed = (await steps(plan, 'plan-check', 'failed'))[0]!;
      assert.equal(failed['code'], 'plan-body-missing');
      assert.equal((await notes(plan, 'plan-draft')).length, 0, 'nothing is saved as a draft');
    } finally {
      await plan.dispose();
    }
  });

  it('a fix after the first failed check reaches plan-accept with no gap', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan);
      assert.equal((await planCheck(plan, BAD)).position, 'design');
      const fixed = await planCheck(plan, GOOD);
      assert.equal(fixed.position, 'plan-accept');
      assert.doesNotMatch(fixed.text, /Plan check FAILED/);
      assert.doesNotMatch(gapsOf(await plan.fx.ledger(PLAN_TASK)).join('\n'), /plan-check/);
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-R4/06-R5/06-R6 the plan-accept gate', { concurrency: 4 }, () => {
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

  it('06-R6/06-R7 #105: Accept through the hook promotes once, completes the route, and note promote has no live route left', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      const done = await answerGates(plan.fx.runtime, hookAnswer(plan, `Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'Accept', ['Accept', 'Revise', 'Reject']) as never, hookDeps(plan), { repositoryRoot: plan.fx.repo.root, where: '.' }, PLATFORM);
      assert.notEqual(done, null);
      const promoted = await notes(plan, 'plan');
      assert.equal(promoted.length, 1);
      assert.ok(typeof promoted[0]!['promotedFrom'] === 'string');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'exit')).length, 1);
      await assert.rejects(plan.promote(), { code: 'plan-not-accepted' });
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
      const [writes, workers] = [(await steps(plan, 'design', 'delivered')).length, (await plan.fx.kinds(PLAN_TASK, 'worker')).length];
      const reask = await plan.hook('plan-accept', 'Accept', printA.id);
      assert.equal(reask.position, 'plan-accept');
      const printB = await lastPrint(plan);
      assert.notEqual(printB.id, printA.id);
      assert.notEqual((printB['object'] as { contentHash: string }).contentHash, (printA['object'] as { contentHash: string }).contentHash);
      assert.equal((await steps(plan, 'design', 'delivered')).length, writes);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).length, workers);
      const stray = await plan.hook('plan-accept', 'Accept', '99');
      assert.equal(stray.position, 'plan-accept');
      assert.equal((await notes(plan, 'plan')).length, 0);
      const done = await plan.hook('plan-accept', 'Accept', (await lastPrint(plan)).id);
      assert.equal(done.position, 'complete');
      const promoted = (await notes(plan, 'plan'))[0]!;
      assert.match(done.text, /Recorded: plan-accept: Accept; plan saved at \S+/);
      assert.ok(done.text.includes(String(promoted['path'])));
      assert.doesNotMatch(done.text, /plan-draft saved/);
      assert.equal((await notes(plan, 'plan')).length, 1);
      assert.equal((await readdir(taskDir(plan))).filter((name) => name === 'plan.md').length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('S5 06-R5: the model cannot send the plan back; a human Revise reruns design with its repeat intact; a flag Revise is declined', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      await plan.body('# Plan\n\n1. Do it.\n');
      await plan.next();
      await plan.hook('plan-accept', 'Revise', (await lastPrint(plan)).id);
      const human = (await plan.fx.kinds(PLAN_TASK, 'revise')).at(-1)!;
      assert.equal(human['via'], 'gate');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).length, 1);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'limit')).length, 0);
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

describe('06-R8/06-R9/06-H4 acting authority', { concurrency: 4 }, () => {
  it('S1 06-R1/06-R8: an untrusted headless --answer plan-accept=Accept is declined, no preanswer, Reject by default, nothing promoted', async () => {
    const plan = await shipped();
    try {
      await plan.start({ channel: 'cli', headless: true, answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'preanswer')).length, 0);
      const declined = (await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!;
      assert.deepEqual([declined['reason'], declined['via']], ['acting-needs-human', 'flag']);
      await plan.body(GOOD);
      await plan.next();
      const taken = (await plan.fx.kinds(PLAN_TASK, 'default-taken')).at(-1)!;
      assert.deepEqual([taken['answer'], taken['via']], ['Reject', 'headless']);
      assert.equal((await notes(plan, 'plan')).length, 0);
    } finally {
      await plan.dispose();
    }
  });

  it('S14 06-R9/06-H4: a check that still fails after the fix round reaches the gate and a trusted Accept preanswer promotes that draft, with the failure under Not verified', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan, { answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'preanswer')).length, 1);
      await planCheck(plan, BAD);
      await planCheck(plan, BAD);
      assert.equal((await notes(plan, 'plan')).length, 1);
      assert.match(gapsOf(await plan.fx.ledger(PLAN_TASK)).join('\n'), /plan-check: 1 bad anchors/);
    } finally {
      await plan.dispose();
    }
  });

  it('a user-set headless run whose check fails hands the draft that still fails to the gate with the failure and no Revise', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan, { headless: true, answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      await planCheck(plan, BAD);
      await planCheck(plan, BAD);
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
      await toDesign(plan, { headless: true });
      await planCheck(plan, GOOD);
      const taken = (await plan.fx.kinds(PLAN_TASK, 'default-taken')).at(-1)!;
      assert.deepEqual([taken['answer'], taken['via']], ['Reject', 'headless']);
      assert.equal((await notes(plan, 'plan')).length, 0);
    } finally {
      await plan.dispose();
    }
  });

});

describe('06-H3 without hook support', { concurrency: 4 }, () => {
  it('06-H3: with AskUserQuestion binding unsupported, a hook Accept binds nothing and a flag Accept stays declined', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      const unsupported = { askBinding: 'unsupported', answerContext: 'unsupported' } as const;
      assert.equal(await answerGates(plan.fx.runtime, hookAnswer(plan, `Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'Accept', ['Accept', 'Revise', 'Reject']) as never, hookDeps(plan), { repositoryRoot: plan.fx.repo.root, where: '.' }, unsupported), null);
      await plan.next({ answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!['reason'], 'acting-needs-human');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'acceptance')).filter((entry) => entry['gate'] === 'plan-accept').length, 0);
      assert.equal((await notes(plan, 'plan')).length, 0);
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-R3 decision gates', { concurrency: 4 }, () => {
  it('06-R3: a design AskUserQuestion with the decision marker records gate {class: decision} and acceptance {via: hook}', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      const question = 'Store the limit per customer or per order? [ambicode gate decision:limit-scope]';
      await answerGates(plan.fx.runtime, hookAnswer(plan, question, 'Per order', ['Per customer', 'Per order']) as never, hookDeps(plan), { repositoryRoot: plan.fx.repo.root, where: '.' }, PLATFORM);
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

describe('06-P9/D1 interruption', { concurrency: 4 }, () => {
  it('S10: route next after a completed check run is idempotent for the draft: a repeated check saves one more draft and no draft is deleted', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan);
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
      const kept = ledger.filter((entry) => entry.id !== promoted.id && entry.kind !== 'exit' && !(entry.kind === 'step' && entry['step'] === 'promote'));
      await writeFile(path.join(taskDir(plan), 'ledger.jsonl'), kept.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
      await assert.rejects(plan.promote(), (error: { code?: string }) => error.code === 'plan-draft-missing');
      assert.equal((await notes(plan, 'plan')).length, 0);
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-N2 one live plan route per task', { concurrency: 4 }, () => {
  it('another session starting the task interrupts the route, and the draft is saved for the new one', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan);
      await plan.start({ session: SESSION_B });
      assert.deepEqual((await plan.fx.kinds(PLAN_TASK, 'exit')).map((entry) => entry['reason']), ['interrupted']);
      await plan.saveDraft('# Plan\n');
      const [first, second] = await plan.fx.kinds(PLAN_TASK, 'route');
      const draft = (await notes(plan, 'plan-draft')).at(-1)!;
      assert.deepEqual([draft['route'] === second!.id, draft['route'] === first!.id], [true, false]);
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-R11 launch', { concurrency: 4 }, () => {
  it('06-R11: a typed /ambicode:plan starts the shipped route on the hook channel and runs no prepare', async () => {
    const plan = await shipped();
    try {
      const deps = { load: async () => hookDeps(plan) };
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

describe('06-C7 project answers', { concurrency: 4 }, () => {
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
