import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse, stringify } from 'yaml';
// @ts-expect-error untyped fixture modules
import { fixtureByName } from '../../../fixtures/definitions.mjs';
// @ts-expect-error untyped fixture modules
import { materialize } from '../../../fixtures/materialize.mjs';
import { parseArgs } from '#util/args';
import { runReview, REVIEW_OPTIONS, type ReviewDependencies } from '#cli/commands/review/review';
import { routeTools, runRouteStart } from '#cli/commands/route/route';
import { createRuntime } from '#composition/root';
import { ReviewResult } from '#types/modules/review';
import { runHook } from '#hook/events/run-hook';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { fsActiveRoutePointer } from '#harness/session/active-route';
import { readLedger } from '#platform/ledger/ledger';
import { COMMAND_PACK, SplitRunner } from '#testing/fixtures/check-fixture';
import { notCoveredBlock } from '#modules/review/bundle/coverage-block';
import { ROUTE_START_OPTIONS } from '#types/cli';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { HookDeps } from '#types/hook';

const TASK = 'src-regression';
const LINT_PROPOSED = COMMAND_PACK.replace('{ command: lint, action: forbid, reason: "never here" }', '{ command: lint, action: propose, reason: "lint" }');

/** The replay recordings hold no snapshot of this change (P19), so a fake reviewer is injected through ReviewDependencies. `ts-source-regression` with an eslint check wired by hand under a propose policy; the runner's output is scripted. */
async function regression() {
  const scratch = await mkdtemp(path.join(tmpdir(), 'ambicode-review-int-'));
  const root = path.join(scratch, 'repo');
  await materialize(fixtureByName('ts-source-regression'), root, { ambicodeInit: true });
  const configPath = path.join(root, '.ambicode', 'config.yaml');
  const config = parse(await readFile(configPath, 'utf8'));
  const app = config.projects[0];
  app.commands.lint = { argv: ['eslint', '{files}'] };
  app.checks.lint = { command: 'lint', adapter: 'eslint' };
  app.policyFiles = ['.ambicode/policies/cmds.yaml'];
  await writeFile(configPath, stringify(config));
  await mkdir(path.join(root, '.ambicode', 'policies'), { recursive: true });
  await writeFile(path.join(root, '.ambicode', 'policies', 'cmds.yaml'), LINT_PROPOSED);
  execFileSync('git', ['add', '.ambicode'], { cwd: root });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'wire eslint'], { cwd: root });

  const base = await createRuntime({ cwd: root });
  const runner = new SplitRunner(base.runner);
  runner.out = { exitCode: 0, stdout: '' };
  const runtime: Runtime = { ...base, runner };
  const tools = await routeTools(runtime, null);
  const pointer = fsActiveRoutePointer(runtime.fs);
  const hookDeps: HookDeps = { pointer, load: async () => ({ engine: tools.engine, routes: tools.routes, pointer }) };
  const dir = path.join(root, '.ambicode', 'task', TASK);
  const ledger = (): Promise<LedgerEntry[]> => readLedger(nodeFileSystem, dir);
  const owner = async (): Promise<string> => String((await ledger()).find((entry) => entry.kind === 'route')!['session']);
  const calls = { reviewer: 0 };
  const fake: ReviewDependencies = {
    warm: async () => {},
    reviewer: { async invoke() { calls.reviewer += 1; return { kind: 'ok', output: { findings: [], coverageNotes: ['fake reviewer: no model call'] }, rawLength: 2, argv: ['claude'] } as never; } } as never,
  };
  return {
    root, runtime, runner, calls, ledger,
    start: (...argv: string[]) => runRouteStart(runtime, parseArgs('route start', ['review', '--task', TASK, ...argv, 'review my change'], ROUTE_START_OPTIONS)),
    review: (deps: ReviewDependencies, ...extra: string[]) => runReview(runtime, parseArgs('review', ['--task', TASK, ...extra], REVIEW_OPTIONS), deps),
    fake,
    real: { warm: async () => {} } as ReviewDependencies,
    /** The user's answer to the latest print of `gate`, as the AskUserQuestion hook records it. */
    answer: async (gate: string, option: string) => {
      const print = (await ledger()).findLast((entry) => entry.kind === 'gate' && entry['gate'] === gate);
      return tools.engine.advance({ task: TASK, session: await owner(), cause: 'gate-hook', answers: [{ gate, option, ...(print === undefined ? {} : { instance: print.id }) }] });
    },
    stop: async (text: string) => {
      const transcript = path.join(scratch, 'transcript.jsonl');
      await writeFile(transcript, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`);
      return runHook(runtime, JSON.stringify({ hook_event_name: 'Stop', session_id: await owner(), cwd: root, transcript_path: transcript }), hookDeps) as Promise<{ decision?: string; reason?: string } | null>;
    },
    dispose: () => rm(scratch, { recursive: true, force: true }),
  };
}

const compact = (ledger: readonly LedgerEntry[]): string =>
  ledger.map((entry) => {
    const what = entry['step'] ?? entry['gate'] ?? entry['reason'] ?? entry['which'] ?? '';
    const tag = entry['status'] ?? (entry.kind === 'acceptance' || entry.kind === 'declined' ? entry['answer'] : undefined) ?? (entry.kind === 'review' ? `waiting=${(entry['waiting'] as string[]).join(',') || '-'}` : undefined);
    return `${entry.kind}${what === '' ? '' : `:${String(what)}`}${tag === undefined ? '' : `=${String(tag)}`}`;
  }).join(' · ');

describe('review route on ts-source-regression (08-I3)', () => {
  it('08-I3: start → estimate → run → review waits on a propose check → review-checks → with → revise review-run → one reviewer run → readback; Stop checks part 4 verbatim', async () => {
    const t = await regression();
    try {
      const started = await t.start();
      assert.equal(started.position, 'estimate');
      assert.match(started.text, /Review estimate: working tree · 1 file\(s\)/);
      assert.match(started.text, /waiting: app\/lint/);
      assert.match(started.text, /\n {2}- run /);
      assert.ok(Buffer.byteLength(started.text) <= 3072, `${Buffer.byteLength(started.text)}`);

      const run = await t.answer('estimate', 'run');
      assert.equal(run.position, 'review-run');
      assert.match(run.text, /review --task src-regression`/);

      const waiting = await t.review(t.real);
      assert.deepEqual((await t.ledger()).filter((entry) => entry.kind === 'review').map((entry) => entry['waiting']), [['app/lint']]);
      assert.match(waiting.next ?? '', /Checks waiting: app\/lint\. The reviewer has not run yet\./);
      assert.equal(t.calls.reviewer, 0, 'no reviewer ran while the check waited');
      assert.equal(t.runner.calls.length, 0, 'the proposed check did not run');

      const rerun = await t.answer('review-checks', 'with');
      assert.equal(rerun.position, 'review-run');
      assert.match(rerun.text, /review --task src-regression`/);
      assert.deepEqual((await t.ledger()).filter((entry) => entry.kind === 'revise').map((entry) => [entry['from'], entry['reason']]), [['review-run', 'review-checks: with']]);

      const done = await t.review(t.fake);
      assert.match(done.next ?? '', /step readback/);
      assert.equal(t.runner.calls.length, 1, 'the approved check ran once');
      const entries = (await t.ledger()).filter((entry) => entry.kind === 'review');
      assert.deepEqual(entries.map((entry) => entry['waiting']), [['app/lint'], []]);
      assert.deepEqual([done.result.reviewer?.status, t.calls.reviewer], ['ok', 1]);

      const result = ReviewResult.parse(JSON.parse(await readFile(path.join(t.root, String(entries.at(-1)!['result'])), 'utf8')));
      const block = notCoveredBlock(result);
      assert.match(block, /^4\. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE/);
      assert.deepEqual(await t.stop(`# Review\n\nFindings: ${done.result.findings.length}.\n\n${block}\n`), {});
      const blocked = await t.stop('# Review\n\nThe change breaks add; see the findings above.');
      assert.equal(blocked?.decision, 'block');
      assert.match(blocked?.reason ?? '', /the "not covered" block is not reproduced verbatim/);
      assert.deepEqual(await t.stop('Still no block.'), {}, 'the second failure allows');
      console.log(`[08-I3 ledger] ${compact(await t.ledger())}`);
    } finally {
      await t.dispose();
    }
  });
});

