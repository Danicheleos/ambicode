import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { answerGates } from '#hook/events/gate-answer';
import { runHook } from '#hook/events/run-hook';
import { gapsOf } from '#modules/evidence/report/report';
import { PLAN_TASK, planFixture, type PlanFixture } from '#testing/fixtures/plan-fixture';
import { CONFIG } from '#testing/fixtures/route-fixture';
import { REPO_ROOT } from '#testing/paths';
import { SESSION_A, SESSION_B } from '#testing/fixtures/ids';

const GOOD = '# Plan\n\n- *Changes*: `src/orders/limit.ts:1` `orderLimit`\n';
const PLATFORM = { askBinding: 'supported', answerContext: 'supported' } as const;

const shipped = (): Promise<PlanFixture> => planFixture({ shipped: true });
const taskDir = (plan: PlanFixture): string => path.join(plan.fx.repo.root, '.ambicode', 'tasks', PLAN_TASK);
const notes = async (plan: PlanFixture, kind: string) => (await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === kind);
const steps = async (plan: PlanFixture, step: string, status: string) => (await plan.fx.kinds(PLAN_TASK, 'step')).filter((entry) => entry['step'] === step && entry['status'] === status);
const lastPrint = async (plan: PlanFixture) => (await plan.prints()).at(-1)!;
const checkRuns = async (plan: PlanFixture) => (await plan.fx.kinds(PLAN_TASK, 'step')).filter((entry) => entry['step'] === 'plan-check' && entry['status'] === 'completed');

/** The model's call: write the body, then `route next` runs the plan-check step. */
async function planCheck(plan: PlanFixture, body: string) {
  await plan.body(body);
  return plan.next();
}

/** Start: the merged draft step is the point where the model designs and writes its body. */
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

  it('06-R1: routes/plan/plan.yaml parses cleanly, builds, is packaged and marks Accept and Revise acting', async () => {
    const text = await readFile(path.join(REPO_ROOT, 'routes', 'plan', 'plan.yaml'), 'utf8');
    assert.deepEqual(YAML.parseDocument(text).errors, []);
    const route = YAML.parse(text) as { steps: { id: string; gate?: { acting?: string[] } }[] };
    assert.deepEqual(route.steps.map((step) => step.id), ['fetch', 'ground', 'draft', 'plan-check', 'critic', 'critic-record', 'plan-accept', 'promote']);
    assert.deepEqual(route.steps.find((step) => step.id === 'plan-accept')?.gate?.acting, ['Accept', 'Revise']);
    assert.match(await readFile(path.join(REPO_ROOT, 'tools', 'package-candidate.mjs'), 'utf8'), /from: 'routes', extensions: \['\.yaml', '\.md'\]/);
    const plan = await shipped();
    await plan.dispose();
  });

  it('06-R2: the step texts leave the Then command to the step header', async () => {
    for (const name of ['investigate/fetch', 'plan/draft']) {
      const text = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
      assert.doesNotMatch(text, /route next/, name);
    }
    const write = await readFile(path.join(REPO_ROOT, 'routes', 'plan', 'draft.md'), 'utf8');
    assert.match(write, /`\{plan\}` \(with frontmatter `status: draft`\)/);
    assert.match(write, /Final chat message: what the route's closing asks: its Plan block as is, its Not verified items word for word/);
    assert.match(write, /never a bare name/);
    assert.match(write, /Name only files the plan changes or reuses/);
    assert.match(write, /names only rules that shaped a decision/);
    assert.match(write, /call X at path:N/);
    assert.doesNotMatch(write, /each id once|not applicable|plan-check flags|sent back|fix only those lines/, 'plan-check records only: no mandatory citation list, no fix round');
    assert.match(write, /## Iteration N: <title>/);
    assert.match(write, /\[ambicode gate decision:<slug>\]/);
    assert.doesNotMatch(write, /refs --declarations|\| requirement \| section \| code \|/);
  });

  it('06-H2: the draft delivery lists the tracked documentation files, tests and code excluded, and no context notes', async () => {
    const plan = await shipped();
    try {
      await plan.fx.repo.write('.ambicode/context/overview.md', '# Overview of the service\n');
      await plan.fx.repo.write('docs/architecture.md', '# Architecture\n');
      await plan.fx.repo.write('src/orders/limit.test.md', 'x\n');
      await plan.fx.repo.commitAll('docs');
      const first = await plan.start();
      assert.match(first.text, /Documentation files \(path, bytes\): docs\/architecture\.md 15\b/);
      assert.doesNotMatch(first.text, /limit\.test\.md/);
      assert.doesNotMatch(first.text, /\.ambicode\/context|Overview of the service/);
    } finally {
      await plan.dispose();
    }
  });

  it('an empty search map is not dropped: the draft step says the map found no files and the model searches itself, and the ledger records it as a limitation', async () => {
    const plan = await shipped();
    try {
      const first = await plan.start({ text: 'zzqqxx wwvvuu' });
      assert.match(first.text, /The map found no files for this request; search the repository yourself with your own tools\./);
      const map = (await plan.fx.kinds(PLAN_TASK, 'map')).at(-1)!;
      assert.equal(map['candidates'], 0);
      assert.ok((map['limitations'] as string[]).includes('The map found no files for this request; search the repository yourself with your own tools.'));
    } finally {
      await plan.dispose();
    }
  });

  it('06-H1: the start delivers the draft step without the module notes', async () => {
    const plan = await shipped();
    try {
      const first = await plan.start();
      assert.equal(first.position, 'draft');
      assert.doesNotMatch(first.text, /Read the notes of the modules/);
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-P5/06-P6/06-P7 write and check', { concurrency: 4 }, () => {
  it('06-P5/D1: one plan check checks once; a route next at plan-check runs the run list once', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan);
      const out = await planCheck(plan, GOOD);
      assert.equal(out.position, 'plan-accept');
      assert.equal((await checkRuns(plan)).length, 1);
      assert.equal((await steps(plan, 'draft', 'completed')).length, 1);
      assert.equal((await lastPrint(plan))['gate'], 'plan-accept');
    } finally {
      await plan.dispose();
    }
    const viaNext = await shipped();
    try {
      await toDesign(viaNext);
      await viaNext.body(GOOD);
      assert.equal((await viaNext.next()).position, 'plan-accept');
      assert.equal((await checkRuns(viaNext)).length, 1);
    } finally {
      await viaNext.dispose();
    }
  });

  it('a second typed request in one task is not a new requirement: it is not saved', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan, { text: 'The list shows all rows at once.' });
      await plan.fx.engine.stop(PLAN_TASK, 'blocked', 'test');
      await plan.start({ text: 'Cap the order total at 500.' });
      assert.deepEqual((await plan.fx.kinds(PLAN_TASK, 'requirement')).map((row) => row['key']), ['request']);
      const saved = JSON.parse(await readFile(path.join(taskDir(plan), 'requirements', (await readdir(path.join(taskDir(plan), 'requirements')))[0]!), 'utf8')) as { content: string };
      assert.equal(saved.content, 'The list shows all rows at once.');
    } finally {
      await plan.dispose();
    }
  });

  it('the draft step names the plan body by its absolute path: the task lives under the repository root, which the session directory need not be', async () => {
    const plan = await shipped();
    try {
      const first = await toDesign(plan);
      assert.ok(first.text.includes(`\`${path.join(await realpath(taskDir(plan)), 'plan.md')}\``), first.text);
      assert.doesNotMatch(first.text, /to `\.ambicode\//);
    } finally {
      await plan.dispose();
    }
  });

  it('route next with no plan body saved records the check as a missing body naming where it belongs, instead of crashing the script', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan);
      const sent = await plan.next();
      assert.equal(sent.position, 'plan-accept');
      const where = path.join(await realpath(taskDir(plan)), 'plan.md');
      const failed = (await steps(plan, 'plan-check', 'failed'))[0]!;
      assert.equal(failed['code'], 'plan-body-missing');
      assert.ok(String(failed['message']).includes(where), String(failed['message']));
      assert.match(sent.text, /Plan check FAILED: .* does not exist/);
      assert.match(gapsOf(await plan.fx.ledger(PLAN_TASK)).join('\n'), /plan-check: .* does not exist/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).length, 0);
    } finally {
      await plan.dispose();
    }
  });

  it('a human Revise after a missing body reruns draft, and the fixed draft reaches the gate with no failure line', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan);
      assert.equal((await plan.next()).position, 'plan-accept');
      await plan.hook('plan-accept', 'Revise', (await lastPrint(plan)).id);
      const fixed = await planCheck(plan, GOOD);
      assert.equal(fixed.position, 'plan-accept');
      assert.doesNotMatch(fixed.text, /Plan check FAILED/);
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-R4/06-R5/06-R6 the plan-accept gate', { concurrency: 4 }, () => {
  it('06-R4/D11: the chat details lead with the absolute plan.md path and the iteration titles, the question stays plain, and the print has the marker and the Revise count', async () => {
    const plan = await shipped();
    try {
      const gate = await plan.toGate();
      assert.equal(gate.position, 'plan-accept');
      const print = await lastPrint(plan);
      assert.match(gate.text, new RegExp(`\\[ambicode gate plan-accept ${print.id}\\]`));
      const planPath = path.join(await realpath(taskDir(plan)), 'plan.md');
      const details = String(print['details']);
      assert.equal(details.split('\n')[0], planPath);
      assert.equal(print['question'], 'Accept this plan?');
      assert.ok(!String(print['question']).includes(planPath));
      assert.ok(gate.text.indexOf(planPath) < gate.text.indexOf('Then ask: Accept this plan?'));
      assert.doesNotMatch(details, /Files changed|open decisions/);
      assert.doesNotMatch(gate.text, /Object:/);
      assert.match(gate.text, /- Revise \(acts: only your own answer here counts; goes back to draft\)/);
      await plan.hook('plan-accept', 'Accept', print.id);
    } finally {
      await plan.dispose();
    }
  });

  it('06-R4: the details list the Iteration headings as numbered titles', async () => {
    const plan = await shipped();
    try {
      await plan.start();
      await plan.body('# Plan\n\n## Iteration 1: Add the limit\nx\n\n## Iteration 2: Wire it\ny\n');
      const first = await plan.next();
      if (first.position !== 'plan-accept') await plan.next();
      const details = String((await lastPrint(plan))['details']);
      assert.match(details, /\n1\. Add the limit\n2\. Wire it/);
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
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'exit')).length, 1);
      await assert.rejects(plan.accept(), { code: 'plan-not-accepted' });
      assert.equal((await notes(plan, 'plan')).length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('the closing of an accepted plan lists the plan path and one line per iteration with its Goal sentence, and asks to copy that block', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      await plan.body('# Plan\n\n## Requirements\n- "x" (Iteration 1)\n\n## Iteration 1: Add the limit\n- *Goal*: Orders over the limit are refused. Nothing else changes.\n- *Changes*: `src/orders/limit.ts:1`\n\n## Iteration 2: Wire it\n- *Goal*: The CLI calls the limit.\n');
      const done = await plan.hook('plan-accept', 'Accept', print.id);
      assert.equal(done.position, 'complete');
      assert.match(done.text, new RegExp(`\\nPlan \\(accepted\\): \\.ambicode/tasks/${PLAN_TASK}/plan\\.md\\n1\\. Add the limit: Orders over the limit are refused\\.\\n2\\. Wire it: The CLI calls the limit\\.\\n`));
      assert.match(done.text, /write your final message: the Plan block above as is/);
      assert.doesNotMatch(done.text, /`Done\.`/);
    } finally {
      await plan.dispose();
    }
  });

  it('the closing shows the whole first Goal sentence, however long', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      const long = `Orders over the limit are refused ${'with a clear message naming the limit and the order total '.repeat(4)}and nothing else changes.`;
      assert.ok(long.length > 160);
      await plan.body(`# Plan\n\n## Iteration 1: Add the limit\n- *Goal*: ${long} Second sentence.\n`);
      const done = await plan.hook('plan-accept', 'Accept', print.id);
      assert.ok(done.text.includes(`\n1. Add the limit: ${long}\n`));
      assert.doesNotMatch(done.text, /…/);
    } finally {
      await plan.dispose();
    }
  });

  it('a Rejected plan shows its real status in the Plan line, and a Goal of a later section is not taken by the last iteration', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      await plan.body('---\nstatus: draft\n---\n# Plan\n\n## Iteration 1: Add the limit\n- *Goal*: Orders over the limit are refused.\n\n## Iteration 2: Wire it\n- *Changes*: `src/orders/limit.ts:1`\n\n## Assumptions\n- *Goal*: Not an iteration goal.\n');
      const done = await plan.hook('plan-accept', 'Reject', print.id);
      assert.equal(done.position, 'complete');
      assert.match(done.text, new RegExp(`\\nPlan \\(draft\\): \\.ambicode/tasks/${PLAN_TASK}/plan\\.md\\n1\\. Add the limit: Orders over the limit are refused\\.\\n2\\. Wire it\\n\\n`));
    } finally {
      await plan.dispose();
    }
  });

  it('REPRO S3/S13 06-R6: a user edit of plan.md after the gate printed is accepted as it is, not re-asked; a stray instance binds nothing', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      const stray = await plan.hook('plan-accept', 'Accept', '99');
      assert.equal(stray.position, 'plan-accept');
      assert.equal((await notes(plan, 'plan')).length, 0);
      const file = path.join(taskDir(plan), 'plan.md');
      await writeFile(file, '---\nstatus: draft\n---\n# Plan\n\n1. Edited by the user.\n');
      const [writes, workers] = [(await steps(plan, 'draft', 'delivered')).length, (await checkRuns(plan)).length];
      const done = await plan.hook('plan-accept', 'Accept', print.id);
      assert.equal(done.position, 'complete');
      const text = await readFile(file, 'utf8');
      assert.match(text, /^---\nstatus: accepted\n---\n# Plan\n\n1\. Edited by the user\./);
      const accepted = (await notes(plan, 'plan'))[0]!;
      assert.equal(accepted['contentHash'], `sha256:${createHash('sha256').update(text).digest('hex').slice(0, 32)}`);
      assert.match(done.text, /Recorded: plan-accept: Accept; plan saved at \S+plan\.md/);
      assert.equal((await notes(plan, 'plan')).length, 1);
      assert.equal((await steps(plan, 'draft', 'delivered')).length, writes);
      assert.equal((await checkRuns(plan)).length, workers, 'Accept runs no check on the file');
      assert.deepEqual((await readdir(taskDir(plan))).filter((name) => name.startsWith('plan')), ['plan.md']);
    } finally {
      await plan.dispose();
    }
  });

  it('S5 06-R5: the model cannot send the plan back; a human Revise reruns draft with its repeat intact; a flag Revise is declined', async () => {
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

  it('06-R5: the user can Revise a fifth time: no declined entry, no limit', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      for (let cycle = 0; cycle < 5; cycle += 1) {
        await plan.hook('plan-accept', 'Revise', (await lastPrint(plan)).id);
        await plan.next();
        await plan.body(`# Plan ${cycle}\n`);
        await plan.next();
      }
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).length, 5);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'declined')).length, 0);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'limit')).length, 0);
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

  it('a user-set headless run whose plan body was never written hands the gate the missing-body failure and no Revise', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan, { headless: true, answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      await plan.next();
      const print = (await plan.fx.kinds(PLAN_TASK, 'gate')).findLast((entry) => entry['gate'] === 'plan-accept')!;
      assert.deepEqual(print['options'], ['Accept', 'Reject']);
      assert.match(String(print['details']), /Plan check FAILED: .* does not exist/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'revise')).filter((entry) => entry['via'] === 'gate').length, 0);
    } finally {
      await plan.dispose();
    }
  });

  it('a plan saved with CRLF line endings shows its status in the Plan line', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      await plan.body('---\r\nstatus: draft\r\n---\r\n# Plan\r\n\r\n## Iteration 1: Add the limit\r\n- *Goal*: Orders over the limit are refused.\r\n');
      const done = await plan.hook('plan-accept', 'Reject', print.id);
      assert.match(done.text, /\nPlan \(draft\): /);
    } finally {
      await plan.dispose();
    }
  });

  it('an iteration heading inside a fenced code block is example text and not listed in the closing', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      await plan.body('# Plan\n\n## Iteration 1: Add the limit\n- *Goal*: Orders over the limit are refused.\n\n```md\n## Iteration 9: Example only\n```\n');
      const done = await plan.hook('plan-accept', 'Reject', print.id);
      assert.match(done.text, /\n1\. Add the limit: Orders over the limit are refused\.\n\n/);
      assert.doesNotMatch(done.text, /Example only/);
    } finally {
      await plan.dispose();
    }
  });

  it('a fenced level-2 heading inside an iteration does not end it: the Goal after the fence is still listed', async () => {
    const plan = await shipped();
    try {
      await plan.toGate();
      const print = await lastPrint(plan);
      await plan.body('# Plan\n\n## Iteration 1: Add the limit\nExample:\n\n```md\n## fake\n```\n- *Goal*: Orders over the limit are refused.\n');
      const done = await plan.hook('plan-accept', 'Reject', print.id);
      assert.match(done.text, /\n1\. Add the limit: Orders over the limit are refused\.\n\n/);
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

  it('a headless run that took the default says so in the closing Recorded line', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan, { headless: true });
      const done = await planCheck(plan, GOOD);
      assert.equal(done.position, 'complete');
      assert.match(done.text, /Recorded: plan-accept: Reject/);
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
  it('06-R3: a draft AskUserQuestion with the decision marker records gate {class: decision} and acceptance {via: hook}', async () => {
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
  it('S10: route next after a completed check run is idempotent: one check, one gate', async () => {
    const plan = await shipped();
    try {
      await toDesign(plan);
      await plan.body(GOOD);
      assert.equal((await plan.next()).position, 'plan-accept');
      assert.equal((await plan.next()).position, 'plan-accept');
      assert.equal((await checkRuns(plan)).length, 1);
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
      assert.match(text, new RegExp(`\\[ambicode\\] plan · task ${PLAN_TASK} · step draft`));
      assert.doesNotMatch(text, /AMBICODE ran `prepare/);
      const route = (await plan.fx.kinds(PLAN_TASK, 'route'))[0]!;
      assert.equal(route['channel'], 'hook');
    } finally {
      await plan.dispose();
    }
  });
});

describe('06-C7 several configured projects', { concurrency: 4 }, () => {
  it('06-C7: a plan starts without asking which project; the map covers and the policies run over every project', async () => {
    const config = CONFIG.replace(/  - \{ id: app,.*\}$/, '  - { id: orders, root: "src/orders", paths: [src/orders/], ecosystem: { languages: [typescript], frameworks: [], packageManager: null } }\n  - { id: invoices, root: "src/invoices", paths: [src/invoices/], ecosystem: { languages: [typescript], frameworks: [], packageManager: null } }');
    const plan = await planFixture({ shipped: true, config });
    try {
      assert.equal((await plan.start({ text: 'Add orderLimit' })).position, 'draft');
      assert.deepEqual((await plan.fx.kinds(PLAN_TASK, 'gate')).map((entry) => entry['gate']), []);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'map')).length, 1);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'policy')).length, 2);
    } finally {
      await plan.dispose();
    }
  });
});
