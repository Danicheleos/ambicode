import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { answerGates } from '#hook/events/gate-answer';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { readLedger } from '#platform/ledger/ledger';
import { assembleEngine, CONFIG } from '#testing/fixtures/route-fixture';
import { skillHandlers } from '#skills/handlers';
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
  // A pack that carries plan: the plan route stages policies like task and review.
  await writeFile(path.join(destination, '.ambicode', 'config.yaml'), `${CONFIG.replace('packageManager: null }', 'packageManager: null }, packs: [builtin/common-design]')}\n`);
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

const RULES = ['cohesion', 'explicit-surface', 'fix-the-cause', 'need', 'ownership-and-direction', 'reuse-before-reimplementing', 'scope'];

const body = (anchor: string, cited = false): string =>
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
    ...(cited ? ['## Policies', ...RULES.map((id, at) => `common-design/${id}: ${at === 0 ? 'applied at src/invoices/service.ts:3' : 'not applicable: a one-term change'}`), ''] : []),
  ].join('\n');

describe('06-H1/06-H2 plan route integration on ts-feature-boundary', () => {
  it('06-H2/06-P10: under the real ledger lock, start → draft → decision → failing check sends it back with the anchors → fixed check → Accept promotes, with 1 + N + 1 ceremony calls and one work command per write', async () => {
    const root = await materialized();
    try {
      const step: Record<string, string> = {};
      for (const name of ['investigate/fetch', 'plan/draft']) step[`routes/${name}.md`] = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
      const assembled = await assembleEngine({ root, routes: { plan: await readFile(path.join(REPO_ROOT, 'routes', 'plan', 'plan.yaml'), 'utf8') }, step });
      const engine = assembled.build(skillHandlers());
      const scratchpad = await assembled.runtime.fs.temporaryDirectory('ambicode-scratch-');
      const deps = { engine, routes: assembled.routes };
      let ceremony = 0;
      let work = 0;
      const hook = async (question: string, label: string, options: string[]) => {
        ceremony += 1;
        return answerGates(assembled.runtime, answered(root, scratchpad, question, label, options) as never, deps, { repositoryRoot: root, where: '.' }, PLATFORM);
      };
      const check = async (text: string) => {
        work += 1;
        await writeFile(path.join(root, '.ambicode', 'tasks', TASK, 'plan.md'), text);
        return engine.advance({ task: TASK, cause: 'route-next', scratchpadDir: scratchpad });
      };

      ceremony += 1;
      const draft = await engine.start({ skill: 'plan', text: 'add a discount to invoice `total` and `amountCents`', requirements: [], task: TASK, cwd: root, session: A, channel: 'hook', scratchpadDir: scratchpad });
      assert.equal(draft.position, 'draft');
      assert.ok(draft.bytes <= 4096, `start delivery ${draft.bytes}`);
      assert.match(draft.text, /## map/);
      // The rules are a file the draft reads, not text in the hook: the message carries a pointer to it.
      const rulesFile = path.join(root, '.ambicode', 'tasks', TASK, 'steps', '1-policy-before-work.md');
      assert.match(draft.text, /## policy:before-work\nRead .*1-policy-before-work\.md \(\d+ bytes\) with your first reads\./);
      assert.doesNotMatch(draft.text, /^common-design\/need: /m);
      assert.match(await assembled.runtime.fs.readText(rulesFile), /^common-design\/need: /m);
      const ledgerText = await assembled.runtime.fs.readText(path.join(root, '.ambicode', 'tasks', TASK, 'ledger.jsonl'));
      assert.equal(ledgerText.split('\n').filter((row) => row.includes('"kind":"policy"') && row.includes('"stage":"before-work"')).length, 1);

      await hook('Apply the discount before or after tax? [ambicode gate decision:discount-order]', 'Before tax', ['Before tax', 'After tax']);

      const failing = await check(body('src/invoices/service.ts:30'));
      assert.equal(failing.position, 'draft');
      assert.match(failing.text, /## bad anchors\nsrc\/invoices\/service\.ts:30 line-out-of-range/);
      assert.match(failing.text, /## policy citations\n.*\ncommon-design\/cohesion\ncommon-design\/explicit-surface\n/);
      const passing = await check(body('src/invoices/service.ts:3-6', true));
      assert.equal(passing.position, 'plan-accept');
      assert.doesNotMatch(passing.text, /Plan check FAILED/);
      for (const output of [failing, passing]) assert.ok(output.bytes <= 4096, `${output.bytes}`);

      const ledger = async () => readLedger(nodeFileSystem, path.join(root, '.ambicode', 'tasks', TASK));
      const print = (await ledger()).findLast((entry) => entry.kind === 'gate' && entry['gate'] === 'plan-accept')!;
      await hook(`Accept this plan? [ambicode gate plan-accept ${print.id}]`, 'Accept', ['Accept', 'Revise', 'Reject']);

      const entries = await ledger();
      console.log(entries.map((entry) => `${entry.kind}${entry.kind === 'step' ? ` ${entry['step']}:${entry['status']}` : ''}${typeof entry['gate'] === 'string' ? ` ${entry['gate']}` : ''}${typeof entry['via'] === 'string' ? ` via:${entry['via']}` : ''}`).join('\n'));
      const plan = entries.findLast((entry) => entry.kind === 'note' && entry['note'] === 'plan');
      assert.ok(plan !== undefined && plan['anchorsBad'] === 0);
      assert.equal((await readdir(path.join(root, '.ambicode', 'tasks', TASK))).filter((name) => name === 'plan.md').length, 1);
      const decision = entries.find((entry) => entry.kind === 'acceptance' && entry['gate'] === 'decision:discount-order');
      assert.equal(decision?.['via'], 'hook');

      const decisions = 1;
      const writes = 2;
      assert.equal(ceremony, 1 + decisions + 1);
      assert.equal(work, writes);
      assert.equal(entries.filter((entry) => entry.kind === 'worker').length, writes + 1, 'one check per write, one more when Accept re-checks the file');
      await rm(scratchpad, { recursive: true, force: true });
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  });
});
