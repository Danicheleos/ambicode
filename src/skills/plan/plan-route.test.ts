import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { parseArgs } from '#util/args';
import { renderPlanCheck, runPlanCheckCommand, PLAN_CHECK_OPTIONS } from '#cli/commands/workers/plan-check';
import { answerGates } from '#hook/events/gate-answer';
import { runHook } from '#hook/events/run-hook';
import { buildReport } from '#modules/evidence/report/report';
import { appendLedger } from '#platform/ledger/ledger';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { PLAN_TASK, planFixture, type PlanFixture } from '#testing/fixtures/plan-fixture';
import { CONFIG } from '#testing/fixtures/route-fixture';
import { commandContext } from '#harness/engine/context';
import { runPlanCheck } from '#modules/workers/plan-check';
import { REPO_ROOT } from '#testing/paths';
import { SESSION_A, SESSION_B } from '#testing/fixtures/ids';

/** SHA-256 of the step-06 Contract YAML with amend-06-review-r1 P2 (`fetch` gets `payload: [template]`, `plan-write` gets `payload: [policy:before-report]`). */
const CONTRACT_SHA256 = '9dbc06996ab1a851eb6bfbe3250f4b0c075885ae08a1c42b388c56e917e86e6b';
const GOOD = '# Plan\n\n- *Changes*: `src/orders/limit.ts:1` `orderLimit`\n';
const BAD = '# Plan\n\n- *Changes*: `src/orders/limit.ts:40` `orderLimit`\n';
const PLATFORM = { askBinding: 'supported', answerContext: 'supported' } as const;

const shipped = (): Promise<PlanFixture> => planFixture({ shipped: true });
const taskDir = (plan: PlanFixture): string => path.join(plan.fx.repo.root, '.ambicode', 'task', PLAN_TASK);
const notes = async (plan: PlanFixture, kind: string) => (await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === kind);
const steps = async (plan: PlanFixture, step: string, status: string) => (await plan.fx.kinds(PLAN_TASK, 'step')).filter((entry) => entry['step'] === step && entry['status'] === status);
const lastPrint = async (plan: PlanFixture) => (await plan.prints()).at(-1)!;

/** `plan check --from steps/plan-body.md` as the owner's CLI call: the session binds from the task's live route. */
async function planCheck(plan: PlanFixture, body: string) {
  await plan.body(body);
  return runPlanCheckCommand(plan.fx.runtime, parseArgs('plan check', ['--task', PLAN_TASK, '--from', 'steps/plan-body.md'], PLAN_CHECK_OPTIONS));
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
  it('06-R2: with a requirement, fetch is delivered first with the template in its payload', async () => {
    const plan = await shipped();
    try {
      const first = await plan.start({ requirements: ['https://example.atlassian.net/browse/ORD-17'] });
      assert.equal(first.position, 'fetch');
      assert.match(first.text, /## template\n/);
      assert.doesNotMatch(first.text, /payload-\*-template/);
    } finally {
      await plan.dispose();
    }
  });

  it('06-R1: routes/plan/plan.yaml is the Contract YAML, parses cleanly, builds, is packaged and marks Accept acting', async () => {
    const text = await readFile(path.join(REPO_ROOT, 'routes', 'plan', 'plan.yaml'), 'utf8');
    assert.equal(createHash('sha256').update(text).digest('hex'), CONTRACT_SHA256);
    assert.deepEqual(YAML.parseDocument(text).errors, []);
    const route = YAML.parse(text) as { steps: { id: string; gate?: { acting?: string[] } }[] };
    assert.deepEqual(route.steps.map((step) => step.id), ['template', 'fetch', 'ground', 'design', 'plan-step', 'plan-write', 'plan-check', 'plan-accept', 'promote']);
    assert.deepEqual(route.steps.find((step) => step.id === 'plan-accept')?.gate?.acting, ['Accept']);
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
    assert.match(write, /plan check --task \{task\}` on standard input/);
    assert.doesNotMatch(write, /--from|Write the plan/);
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
      assert.equal(out.failed, false);
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

  it('S4 06-P6: a failing check is recorded, nothing is rewritten, and the route goes to plan-accept without Accept', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan);
      const failed = await planCheck(plan, BAD);
      assert.equal(failed.failed, true);
      assert.match(failed.next ?? '', /Accept this plan\?/);
      assert.match(failed.next ?? '', /Plan check FAILED: 1 bad anchors/);
      assert.doesNotMatch(failed.next ?? '', /  - Accept/);
      assert.equal((await steps(plan, 'plan-write', 'delivered')).length, 1);
      assert.deepEqual(await plan.fx.kinds(PLAN_TASK, 'revise'), []);
      assert.equal((await lastPrint(plan))['gate'], 'plan-accept');
      assert.equal((await notes(plan, 'plan-draft')).length, 1, '06-P9: the failed draft stays');
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
      assert.equal((await plan.fx.engine.status(PLAN_TASK, SESSION_A))[0]?.position, 'complete');
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

  it('S5 06-R5: a model revise uses design\'s repeat; a human Revise resets the counters; an untrusted flag Revise is via model', async () => {
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
      await plan.next({ answers: [{ gate: 'plan-accept', option: 'Revise' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).at(-1)!['via'], 'model');
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

  it('S14 06-R9/06-H4: a trusted Accept preanswer never accepts a draft whose check failed: Accept is not offered, so it is declined', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan, { answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'preanswer')).length, 1);
      await planCheck(plan, BAD);
      assert.equal((await notes(plan, 'plan')).length, 0);
      const declined = (await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!;
      assert.deepEqual([declined['reason'], declined['via']], ['option-not-offered', 'prompt']);
      assert.equal((await lastPrint(plan))['gate'], 'plan-accept');
    } finally {
      await plan.dispose();
    }
  });

  it('S12 06-R6: a late bound answer after default-taken never-asked supersedes it and uses the answered instance\'s object', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      await plan.next();
      await plan.next();
      await plan.next();
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'default-taken')).at(-1)!['via'], 'never-asked');
      await plan.hook('plan-accept', 'Accept', print.id);
      const acceptance = (await plan.fx.kinds(PLAN_TASK, 'acceptance')).at(-1)!;
      assert.equal(acceptance['instance'], print.id);
      assert.deepEqual(acceptance['object'], print['object']);
      assert.equal((await notes(plan, 'plan')).length, 1);
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
  it('S10: a crash after the worker entry is repaired by route next, which saves and checks once more; no draft is deleted', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan);
      await plan.body(GOOD);
      await runPlanCheck({ runtime: plan.fx.runtime, session: SESSION_A, context: commandContext({ runtime: plan.fx.runtime, routes: plan.fx.routes }) }, { task: PLAN_TASK, body: null, from: 'steps/plan-body.md' });
      assert.equal((await plan.next()).position, 'plan-accept');
      assert.equal((await notes(plan, 'plan-draft')).length, 2);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'worker')).length, 2);
      const drafts = (await readdir(taskDir(plan))).filter((name) => name.startsWith('plan-draft_'));
      assert.equal(drafts.length, 2);
    } finally {
      await plan.dispose();
    }
  });

  it('S10 06-P9: a crash after the promotion rename is repaired without a new consent; a draft with no entry is an orphan', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      await plan.hook('plan-accept', 'Accept', (await lastPrint(plan)).id);
      const ledger = await plan.fx.ledger(PLAN_TASK);
      const promoted = ledger.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan')!;
      const kept = ledger.filter((entry) => entry.id !== promoted.id && !(entry.kind === 'step' && entry['step'] === 'promote'));
      await writeFile(path.join(taskDir(plan), 'ledger.jsonl'), kept.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
      const acceptances = (await plan.fx.kinds(PLAN_TASK, 'acceptance')).length;
      assert.equal((await plan.promote()).outcome, 'repaired');
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'acceptance')).length, acceptances);
      assert.equal((await notes(plan, 'plan')).length, 1);
      await writeFile(path.join(taskDir(plan), 'plan-draft_2026-10-05T10-00-9.md'), '# stray\n');
      await appendLedger(nodeFileSystem, taskDir(plan), new Date(), 'aaaaaaaa', { kind: 'route', skill: 'plan', args: { text: 'again', requirements: [] }, mode: 'interactive', channel: 'hook', trusted: true, session: SESSION_A, epoch: 1 });
      const [status] = await plan.fx.engine.status(PLAN_TASK, SESSION_A);
      assert.ok(status!.orphans.includes('plan-draft_2026-10-05T10-00-9.md'));
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-N2 write-time ownership on the shipped route', () => {
  it('S11: another session is route-busy; after --adopt the old owner is route-taken-over for every write, and time changes nothing', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan);
      await assert.rejects(plan.start({ session: SESSION_B }), (error: { code?: string }) => error.code === 'route-busy');
      await plan.start({ session: SESSION_B, adopt: true });
      plan.fx.advanceClock(60 * 60_000);
      const taken = (error: { code?: string }) => error.code === 'route-taken-over';
      await assert.rejects(plan.next(), taken);
      await assert.rejects(plan.saveDraft('# Plan\n'), taken);
      await plan.body(GOOD);
      await assert.rejects(runPlanCheck({ runtime: plan.fx.runtime, session: SESSION_A, context: commandContext({ runtime: plan.fx.runtime, routes: plan.fx.routes }) }, { task: PLAN_TASK, body: null, from: 'steps/plan-body.md' }), taken);
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

describe('06-H1 caps with many diagnostics', () => {
  const missing = (count: number): string =>
    `# Plan\n\n${Array.from({ length: count }, (_, i) => `- \`src/features/orders/limits/validation/rules/nested/deeply/rule-${i}.ts:3\``).join('\n')}\n`;

  it('06-H1/06-P7: 60 missing files keep plan check under 8,000 characters and the gate print under 3,072 bytes', async () => {
    const plan = await shipped();
    try {
      await toWrite(plan);
      const out = await planCheck(plan, missing(60));
      assert.equal(out.anchors.badTotal, 60);
      assert.ok(JSON.stringify(out, null, 2).length <= 8000, `${JSON.stringify(out, null, 2).length} characters`);
      assert.equal(out.listsCut, true);
      const reprint = out.next ?? '';
      assert.ok(Buffer.byteLength(reprint) <= 3072, `${Buffer.byteLength(reprint)} bytes`);
      assert.match(reprint, /Plan check FAILED: 60 bad anchors/);
      const artifact = JSON.parse(await readFile(path.join(plan.fx.repo.root, out.artifact), 'utf8')) as { anchors: { bad: unknown[] } };
      assert.equal(artifact.anchors.bad.length, 50, 'the artifact keeps the first 50 (D7)');
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-H1/06-P8 mixed diagnostics on a long task', () => {
  const long = 'invoice-discount-validation-and-rounding';
  const anchors = (count: number): string =>
    Array.from({ length: count }, (_, i) => `- src/modules/order-processing/validation/configuration/missing-file-with-business-logic-${i}.ts:3`).join('\n');
  const check = async (plan: PlanFixture, task: string) =>
    runPlanCheckCommand(plan.fx.runtime, parseArgs('plan check', ['--task', task, '--from', 'steps/plan-body.md'], PLAN_CHECK_OPTIONS));

  it('06-H1/06-P7: 60 bad anchors and 60 unmapped ACs keep the gate print under 3,072 bytes', async () => {
    const plan = await planFixture({ shipped: true, config: CONFIG.replace('mcpServer: null', 'mcpServer: atlassian') });
    try {
      assert.equal((await plan.start({ task: long, requirements: ['ORD-17'] })).position, 'fetch');
      const description = `Acceptance criteria:\n${Array.from({ length: 60 }, (_, i) => `- Invoice check ${i + 1} must reject invalid totals.`).join('\n')}`;
      await runHook(plan.fx.runtime, JSON.stringify({
        hook_event_name: 'PostToolUse', session_id: SESSION_A, cwd: plan.fx.repo.root, scratchpad_dir: plan.fx.scratchpad,
        tool_name: 'mcp__atlassian__getJiraIssue', tool_input: { issueIdOrKey: 'ORD-17' },
        tool_response: { key: 'ORD-17', fields: { summary: 'Invoice validation', description } },
      }), { pointer: plan.fx.pointer, load: async () => ({ engine: plan.fx.engine, routes: plan.fx.routes, pointer: plan.fx.pointer }) });
      await plan.next({ task: long });
      assert.equal((await plan.next({ task: long })).position, 'plan-write');
      await plan.body(`# Plan\n\n${anchors(60)}\n`, long);
      const out = await check(plan, long);
      assert.equal(out.acs.unmappedTotal, 60);
      assert.equal(out.anchors.badTotal, 60);
      const reprint = out.next ?? '';
      assert.ok(Buffer.byteLength(reprint) <= 3072, `${Buffer.byteLength(reprint)} bytes`);
      assert.match(reprint, /Plan check FAILED: 60 bad anchors, 60 unmapped acceptance units/);
    } finally {
      await plan.dispose();
    }
  });

  it('06-P8: shortening the inline duplicate list keeps the count in the JSON and the text', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      const names = Array.from({ length: 50 }, (_, i) => `discountRule${String(i).padStart(2, '0')}`);
      await plan.fx.repo.write('src/orders/discountRules.ts', `${names.map((name) => `export const ${name} = 1;`).join('\n')}\n`);
      await plan.fx.repo.commitAll('discount rules');
      await plan.body(`# Plan\n\n${names.map((name) => `Add \`${name}\``).join('\n')}\n\n${anchors(50)}\n`);
      const out = await check(plan, PLAN_TASK);
      assert.equal(out.listsCut, true);
      assert.ok(out.duplicates.length < 50);
      assert.equal(out.duplicatesTotal, 50);
      const text = renderPlanCheck(out);
      assert.match(text, /; 50 new names already declared/);
      assert.ok(text.includes(`Inline lists were shortened; see ${out.artifact}.`));
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-C7/06-P2 duplicates on a monorepo', () => {
  it('06-C7: a project chosen at the project-ambiguous gate is the one find searches', async () => {
    const config = CONFIG.replace('  - { id: app, root: ".", ecosystem: typescript }', '  - { id: orders, root: "src/orders", ecosystem: typescript }\n  - { id: invoices, root: "src/invoices", ecosystem: typescript }');
    const plan = await planFixture({ shipped: true, config });
    try {
      await plan.fx.repo.write('src/invoices/empty.ts', 'export const emptyInvoice = 0;\n');
      await plan.fx.repo.commitAll('invoices');
      await plan.start({ text: 'Add orderLimit' });
      assert.equal((await plan.next({ project: 'orders' })).position, 'design');
      await plan.next();
      await plan.body('# Plan\n\nAdd `orderLimit` in src/orders/limit.ts:1\n');
      const checked = await runPlanCheck({ runtime: plan.fx.runtime, session: SESSION_A, context: commandContext({ runtime: plan.fx.runtime, routes: plan.fx.routes }) }, { task: PLAN_TASK, body: null, from: 'steps/plan-body.md' });
      assert.deepEqual(checked.result.duplicates, [{ name: 'orderLimit', declaredAt: 'src/orders/limit.ts:1' }]);
      assert.equal(checked.result.duplicatesSkipped, undefined);
    } finally {
      await plan.dispose();
    }
  });

  it('06-C7: the project answered in one task is not asked again by another task of the same session', async () => {
    const config = CONFIG.replace('  - { id: app, root: ".", ecosystem: typescript }', '  - { id: orders, root: "src/orders", ecosystem: typescript }\n  - { id: invoices, root: "src/invoices", ecosystem: typescript }');
    const plan = await planFixture({ shipped: true, config });
    try {
      await plan.start({ text: 'Add orderLimit' });
      assert.equal((await plan.next({ project: 'orders' })).position, 'design');
      assert.equal((await plan.start({ text: 'Add another limit', task: 'second-task' })).position, 'design');
    } finally {
      await plan.dispose();
    }
  });

  it('06-C7: with no project known, the result says the names were not looked up instead of listing none', async () => {
    const config = CONFIG.replace('  - { id: app, root: ".", ecosystem: typescript }', '  - { id: orders, root: "src/orders", ecosystem: typescript }\n  - { id: invoices, root: "src/invoices", ecosystem: typescript }');
    const plan = await planFixture({ shipped: true, config });
    try {
      await plan.body('# Plan\n\nAdd `orderLimit`\n');
      const checked = await runPlanCheck({ runtime: plan.fx.runtime, session: null, context: commandContext({ runtime: plan.fx.runtime, routes: plan.fx.routes }) }, { task: PLAN_TASK, body: null, from: 'steps/plan-body.md' });
      assert.deepEqual(checked.result.duplicates, []);
      assert.match(checked.result.duplicatesSkipped ?? '', /^ambiguous-project/);
    } finally {
      await plan.dispose();
    }
  });
});
