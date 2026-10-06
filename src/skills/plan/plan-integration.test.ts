import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from '#cli/args';
import { runPlanCheckCommand, PLAN_CHECK_OPTIONS } from '#cli/commands/workers/plan-check';
import { answerGates } from '#hook/events/gate-answer';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { readLedger } from '#modules/evidence/ledger/ledger';
import { assembleEngine, CONFIG } from '#testing/fixtures/route-fixture';
import { defaultHandlers } from '#harness/engine/handlers';
import { REPO_ROOT } from '#testing/paths';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TASK = 'invoice-discount';
const PLATFORM = { askBinding: 'supported', answerContext: 'supported' } as const;

async function materialized(): Promise<string> {
  const destination = path.join(await mkdtemp(path.join(tmpdir(), 'ambicode-plan-')), 'repo');
  const outcome = await new NodeProcessRunner().run({
    argv: ['node', path.join(REPO_ROOT, 'fixtures', 'materialize.mjs'), 'ts-feature-boundary', destination],
    cwd: REPO_ROOT,
    timeoutMs: 60_000,
    maxOutputBytes: 262_144,
    env: { kind: 'inherited' },
  });
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  await mkdir(path.join(destination, '.ambicode'), { recursive: true });
  await writeFile(path.join(destination, '.ambicode', 'config.yaml'), `${CONFIG}\n`);
  return destination;
}

const answered = (root: string, scratchpad: string, question: string, label: string, options: string[]) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'AskUserQuestion',
  session_id: A,
  cwd: root,
  scratchpad_dir: scratchpad,
  tool_input: { questions: [{ question, options: options.map((value) => ({ label: value })) }] },
  tool_response: { answers: { [question]: label } },
});

const body = (anchor: string): string =>
  [
    '# Plan: invoice discount',
    '',
    '## Iteration 1',
    '- *Goal*: totals subtract a discount.',
    `- *Changes*: \`${anchor}\` \`total\` gains a discount term.`,
    '- *Tests*: tests/invoices.test.ts fails first on a discounted invoice.',
    '- *Accept*: a discounted invoice totals lower.',
    '- *Checks*: invoices.',
    '- *Leaves out*: reports.',
    '',
  ].join('\n');

describe('06-H1/06-H2 plan route integration on ts-feature-boundary', () => {
  it('06-H2/06-P10: under the real ledger lock, start → design → decision → write → failing check → fixed check → Accept promotes, with 3 + N ceremony calls and one work command per write', async () => {
    const root = await materialized();
    try {
      const step: Record<string, string> = {};
      for (const name of ['plan-fetch', 'plan-design', 'plan-write']) step[`routes/steps/${name}.md`] = await readFile(path.join(REPO_ROOT, 'routes', 'steps', `${name}.md`), 'utf8');
      const assembled = await assembleEngine({ root, routes: { plan: await readFile(path.join(REPO_ROOT, 'routes', 'plan.yaml'), 'utf8') }, step });
      const engine = assembled.build(defaultHandlers());
      const scratchpad = await assembled.runtime.fs.temporaryDirectory('ambicode-scratch-');
      const deps = { engine, routes: assembled.routes, pointer: assembled.pointer };
      let ceremony = 0;
      let work = 0;
      const hook = async (question: string, label: string, options: string[]) => {
        ceremony += 1;
        return answerGates(assembled.runtime, answered(root, scratchpad, question, label, options) as never, deps, PLATFORM);
      };
      const check = async (text: string) => {
        work += 1;
        await writeFile(path.join(root, '.ambicode', 'task', TASK, 'steps', 'plan-body.md'), text);
        return runPlanCheckCommand(assembled.runtime, parseArgs('plan check', ['--task', TASK, '--from', 'steps/plan-body.md'], PLAN_CHECK_OPTIONS));
      };

      ceremony += 1;
      const design = await engine.start({ skill: 'plan', text: 'add a discount to invoice `total` and `amountCents`', requirements: [], task: TASK, cwd: root, session: A, channel: 'hook', scratchpadDir: scratchpad });
      assert.equal(design.position, 'design');
      assert.ok(design.bytes <= 4096, `start delivery ${design.bytes}`);
      assert.match(design.text, /src\/invoices\/service\.ts/);

      await hook('Apply the discount before or after tax? [ambicode gate decision:discount-order]', 'Before tax', ['Before tax', 'After tax']);
      ceremony += 1;
      const write = await engine.advance({ task: TASK, session: A, cause: 'route-next', scratchpadDir: scratchpad });
      assert.equal(write.position, 'plan-write');
      assert.ok(write.bytes <= 3072, `plan-write delivery ${write.bytes}`);

      const failing = await check(body('src/invoices/service.ts:30'));
      assert.equal(failing.failed, true);
      assert.match(failing.next ?? '', /## Bad anchors\nsrc\/invoices\/service\.ts:30 line-out-of-range/);
      const passing = await check(body('src/invoices/service.ts:3-6'));
      assert.equal(passing.failed, false);
      assert.match(passing.next ?? '', /Revise \(3 left\)/);
      for (const output of [failing, passing]) assert.ok(JSON.stringify(output).length <= 8000);

      const ledger = async () => readLedger(nodeFileSystem, path.join(root, '.ambicode', 'task', TASK));
      const print = (await ledger()).findLast((entry) => entry.kind === 'gate' && entry['gate'] === 'plan-accept')!;
      await hook(`Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'Accept', ['Accept', 'Revise', 'Reject']);

      const entries = await ledger();
      console.log(entries.map((entry) => `${entry.kind}${entry.kind === 'step' ? ` ${entry['step']}:${entry['status']}` : ''}${typeof entry['gate'] === 'string' ? ` ${entry['gate']}` : ''}${typeof entry['via'] === 'string' ? ` via:${entry['via']}` : ''}`).join('\n'));
      const plan = entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan');
      assert.ok(plan !== undefined && typeof plan['promotedFrom'] === 'string');
      assert.equal((await readdir(path.join(root, '.ambicode', 'task', TASK))).filter((name) => /^plan_.*\.md$/.test(name)).length, 1);
      const decision = entries.find((entry) => entry.kind === 'acceptance' && entry['gate'] === 'decision:discount-order');
      assert.equal(decision?.['via'], 'hook');

      const decisions = 1;
      const writes = 2;
      assert.equal(ceremony, 3 + decisions);
      assert.equal(work, writes);
      assert.equal(entries.filter((entry) => entry.kind === 'worker').length, writes);
      await rm(scratchpad, { recursive: true, force: true });
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });
});
