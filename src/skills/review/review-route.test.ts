import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { parseArgs } from '#util/args';
import { runReview, REVIEW_OPTIONS, type ReviewDependencies } from '#cli/commands/review/review';
import { startTarget } from '#cli/commands/route/route';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { skillHandlers } from '#skills/handlers';
import { MAX_INSTRUCTION_CHARS, loadRouteRegistry } from '#harness/definition/routes';
import { buildReport } from '#modules/evidence/report/report';
import { CHECK_TASK } from '#testing/fixtures/check-fixture';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { reviewRouteFixture } from '#testing/fixtures/review-route-fixture';
import { metricsIgnoreWarning, reviewCommand } from './handlers.ts';
import { SESSION_A } from '#testing/fixtures/ids';
import { REPO_ROOT } from '#testing/paths';
import { ROUTE_START_OPTIONS } from '#types/cli';
import type { Handler } from '#types/harness';

type Fixture = Awaited<ReturnType<typeof reviewRouteFixture>>;

const MR = 'https://gitlab.example.com/g/p/-/merge_requests/7';
const TICKET = 'https://example.atlassian.net/browse/ORD-17';
const STUB_ESTIMATE: Record<string, Handler> = { 'review.estimate': async () => ({ state: 'ok', payload: 'stub estimate' }) };

async function withReview(body: (t: Fixture) => Promise<void>, options: Parameters<typeof reviewRouteFixture>[0] = {}): Promise<void> {
  const t = await reviewRouteFixture(options);
  try {
    await body(t);
  } finally {
    await t.fx.dispose();
  }
}

const prints = async (t: Fixture, gate: string) => (await t.kinds('gate')).filter((entry) => entry['gate'] === gate);
const steps = async (t: Fixture, status: string): Promise<string[]> => (await t.kinds('step')).filter((entry) => entry['status'] === status).map((entry) => String(entry['step']));
const code = (promise: Promise<unknown>): Promise<string | null> => promise.then(() => null, (error: { code?: string }) => error.code ?? 'other');
const routeArgs = async (t: Fixture, task: string) => (await t.fx.kinds(task, 'route'))[0]?.['args'] as { target?: unknown; hash: string };
const cli = (...argv: string[]) => parseArgs('route start', ['review', ...argv], ROUTE_START_OPTIONS);
const spied = (): { calls: { n: number }; handlers: Record<string, Handler> } => {
  const calls = { n: 0 };
  const original = skillHandlers()['review.evaluate']!;
  return { calls, handlers: { 'review.evaluate': async (input) => { calls.n += 1; return original(input); } } };
};

describe('review route: shape and start (08-R1, 08-R2, 08-R3)', () => {
  it('08-R1: routes/review/review.yaml has the contract steps, the estimate gate, loads with the registry and is packaged with its step files', async () => {
    const route = YAML.parse(await readFile(path.join(REPO_ROOT, 'routes', 'review', 'review.yaml'), 'utf8')) as { skill: string; version: number; budget: Record<string, number>; steps: { id: string; actor: string; when?: string; needs?: string[]; repeat?: number; gate?: Record<string, unknown> }[] };
    assert.deepEqual([route.skill, route.version, route.budget], ['review', 3, { modelSteps: 6, wallMinutes: 45 }]);
    assert.deepEqual(route.steps.map((step) => [step.id, step.actor]), [['template', 'code'], ['fetch', 'model'], ['ground', 'code'], ['estimate-step', 'code'], ['estimate', 'human'], ['review-run', 'code'], ['readback', 'model'], ['view', 'model']]);
    const gate = route.steps.find((step) => step.id === 'estimate')!.gate!;
    assert.deepEqual([gate['options'], gate['acting'], gate['default'], gate['release'], gate['maxRevises']], [['run', 'narrow', 'skip'], ['run'], 'skip', 'skip', 3]);
    const run = route.steps.find((step) => step.id === 'review-run')!;
    // No automatic re-entry: only a review-checks answer re-runs the review.
    assert.deepEqual([run.when, run.needs, run.repeat], ['gate.estimate.is(run)', ['review'], undefined]);
    assert.ok((await loadRouteRegistry(REPO_ROOT, nodeFileSystem)).route('review') !== null);
    assert.match(await readFile(path.join(REPO_ROOT, 'tools', 'package-candidate.mjs'), 'utf8'), /from: 'routes', extensions: \['\.yaml', '\.md'\]/);
    for (const name of ['review/fetch', 'review/readback', 'review/view']) assert.ok((await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8')).length > 0, name);
  });

  it('08-R2: one-target refusals happen before any route entry is written', async () => {
    assert.equal(await code(Promise.resolve().then(() => startTarget('review', cli('--branch', '--mr', MR)))), 'conflicting-target');
    assert.equal(await code(Promise.resolve().then(() => startTarget('review', cli('--base', 'main')))), 'baseline-not-applicable');
    assert.equal(await code(Promise.resolve().then(() => startTarget('review', cli('--mr', MR, '--base', 'main')))), 'baseline-not-applicable');
    assert.equal(startTarget('review', cli()), undefined);
  });

  it('08-R2: --branch --base main and --mr <url> reach RouteArgs.target and change the hash; no target keeps the old hash input', async () => {
    assert.deepEqual(startTarget('review', cli('--branch', '--base', 'main')), { branch: true, base: 'main', mr: null });
    assert.deepEqual(startTarget('review', cli('--mr', MR)), { branch: false, base: null, mr: MR });
    await withReview(async (t) => {
      await t.start({ task: 'r-work' });
      await t.start({ task: 'r-branch', target: { branch: true, base: 'main', mr: null } });
      await t.start({ task: 'r-branch-default', target: { branch: true, base: null, mr: null } });
      await t.start({ task: 'r-mr', target: { branch: false, base: null, mr: MR } });
      const [work, branch, plain, mr] = [await routeArgs(t, 'r-work'), await routeArgs(t, 'r-branch'), await routeArgs(t, 'r-branch-default'), await routeArgs(t, 'r-mr')];
      assert.equal('target' in work, false);
      assert.deepEqual([branch.target, plain.target, mr.target], [{ branch: true, base: 'main', mr: null }, { branch: true, base: null, mr: null }, { branch: false, base: null, mr: MR }]);
      assert.equal(new Set([work.hash, branch.hash, plain.hash, mr.hash]).size, 4);
    }, { handlers: STUB_ESTIMATE });
  });

  it('08-R2: a target flag on another skill refuses bad-argument with the flag as field', async () => {
    const t = await taskFixture();
    try {
      for (const [target, field] of [[{ branch: true, base: null, mr: null }, '--branch'], [{ branch: true, base: 'main', mr: null }, '--base'], [{ branch: false, base: null, mr: MR }, '--mr']] as const) {
        const error = await t.start({ target }).then(() => null, (thrown: { code: string; field?: string }) => thrown);
        assert.deepEqual([error?.code, error?.field], ['bad-argument', field]);
      }
      assert.equal((await t.kinds('route')).length, 0);
    } finally {
      await t.fx.dispose();
    }
  });

  it('08-R2: route start <other skill> with --base or --mr refuses bad-argument before the target is validated', () => {
    for (const [skill, argv, field] of [['task', ['--base', 'main'], '--base'], ['investigate', ['--base', 'main'], '--base'], ['plan', ['--mr', MR, '--branch'], '--mr'], ['task', ['--branch'], '--branch']] as const) {
      const args = parseArgs('route start', [skill, ...argv, 'fix it'], ROUTE_START_OPTIONS);
      const error = (() => { try { startTarget(skill, args); return null; } catch (thrown) { return thrown as { code: string; field?: string }; } })();
      assert.deepEqual([error?.code, error?.field], ['bad-argument', field]);
    }
  });

  it('08-R3: ceremony — one message and the gate without a requirement; fetch, one route next, then the gate with one', async () => {
    await withReview(async (t) => {
      const first = await t.start();
      assert.equal(first.position, 'estimate');
      assert.equal((await prints(t, 'estimate')).length, 1);
      assert.deepEqual(await steps(t, 'skipped'), ['template', 'fetch', 'ground']);
    });
    const normalize: Handler = async ({ ledger, view }) => {
      await ledger.append({ kind: 'envelope', route: view.routeId, sources: [], builtFrom: 'args', asked: [], missingAsked: [], hash: 'stub' });
      return { state: 'ok', payload: 'ORD-17: reject negative amounts' };
    };
    await withReview(async (t) => {
      const fetch = await t.start({ requirements: [TICKET] });
      assert.equal(fetch.position, 'fetch');
      assert.equal((await prints(t, 'estimate')).length, 0);
      const gate = await t.next();
      assert.equal(gate.position, 'estimate');
      assert.equal((await prints(t, 'estimate')).length, 1);
      assert.deepEqual((await t.kinds('step')).filter((entry) => ['template', 'ground', 'estimate-step'].includes(String(entry['step']))).map((entry) => `${entry['step']}:${entry['status']}`), ['template:completed', 'ground:completed', 'estimate-step:completed']);
    }, { handlers: { 'requirements.normalize': normalize } });
  });
});

describe('review route: the estimate gate (08-R4, 08-R5, S12, S14)', () => {
  it('08-R4: answer skip completes the route without review-run, readback or view and reports the skip under Not verified', async () => {
    await withReview(async (t) => {
      await t.start();
      assert.equal((await t.hook('estimate', 'skip')).position, 'complete');
      const skipped = await steps(t, 'skipped');
      for (const step of ['review-run', 'readback', 'view']) assert.ok(skipped.includes(step), step);
      assert.equal((await t.kinds('review')).length, 0);
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
    });
  });

  it('08-R4/S14: a headless start takes the default skip, starts no reviewer and the report carries default-taken', async () => {
    await withReview(async (t) => {
      assert.equal((await t.start({ headless: true })).position, 'complete');
      assert.deepEqual((await t.kinds('default-taken')).map((entry) => [entry['gate'], entry['answer'], entry['via']]), [['estimate', 'skip', 'headless']]);
      assert.equal((await t.kinds('review')).length, 0);
      assert.match(buildReport(await t.ledger()).text, /estimate: default taken, "skip" \(headless\)/);
    });
  });

  it('08-R4: a never-asked gate takes the default skip after three unanswered advances; no reviewer starts', async () => {
    await withReview(async (t) => {
      await t.start();
      for (let turn = 0; turn < 3; turn += 1) await t.next();
      assert.deepEqual((await t.kinds('default-taken')).map((entry) => [entry['gate'], entry['answer'], entry['via']]), [['estimate', 'skip', 'never-asked']]);
      assert.equal((await t.kinds('review')).length, 0);
      assert.ok((await steps(t, 'skipped')).includes('review-run'));
      assert.match(buildReport(await t.ledger()).text, /estimate: default taken, "skip" \(never-asked\)/);
    });
  });

  it('08-R4/S14: an untrusted --answer estimate=run at a cli start is declined, the default is skip and no review is delivered', async () => {
    await withReview(async (t) => {
      await t.start({ channel: 'cli', headless: true, answers: [{ gate: 'estimate', option: 'run' }] });
      assert.equal((await t.kinds('preanswer')).length, 0);
      assert.deepEqual((await t.kinds('declined')).map((entry) => [entry['gate'], entry['reason'], entry['via']]), [['estimate', 'acting-needs-human', 'flag']]);
      assert.equal((await t.kinds('review')).length, 0);
      assert.equal((await steps(t, 'delivered')).includes('review-run'), false);
    });
  });

  it('08-R4/S14: a model --answer estimate=run after a trusted start is declined and the gate stays open', async () => {
    await withReview(async (t) => {
      await t.start();
      const again = await t.next({ answers: [{ gate: 'estimate', option: 'run' }] });
      assert.equal(again.position, 'estimate');
      assert.deepEqual((await t.kinds('declined')).map((entry) => [entry['gate'], entry['reason']]), [['estimate', 'acting-needs-human']]);
      assert.equal((await t.hook('estimate', 'skip')).position, 'complete');
      assert.equal((await t.kinds('review')).length, 0);
    });
  });

  it('08-R5/S14: a trusted preanswer run is honoured at the printed instance; the advance delivers the review command and nothing is asked again', async () => {
    const spy = spied();
    await withReview(async (t) => {
      const run = await t.start({ answers: [{ gate: 'estimate', option: 'run' }] });
      assert.equal(run.position, 'review-run');
      assert.match(run.text, /Now: Run `node "[^"]+" review --task ord-7`/);
      const print = (await prints(t, 'estimate'))[0]!;
      const preanswer = (await t.kinds('preanswer'))[0]!;
      assert.deepEqual((await t.kinds('acceptance')).map((entry) => [entry['gate'], entry['answer'], entry['via'], entry['instance'], entry['preanswer']]), [['estimate', 'run', 'prompt', print.id, preanswer.id]]);
      assert.equal((await prints(t, 'estimate')).length, 1);
      assert.equal((await t.next()).position, 'review-run');
      assert.equal((await prints(t, 'estimate')).length, 1);
      assert.equal(spy.calls.n, 0, 'review.evaluate waits for a review entry');
    }, { handlers: spy.handlers });
  });

  it('08-R5: review.evaluate is not called until a review entry exists, then the route goes on to readback', async () => {
    const spy = spied();
    await withReview(async (t) => {
      await t.start();
      const run = await t.hook('estimate', 'run');
      assert.equal(run.position, 'review-run');
      assert.equal((await t.next()).position, 'review-run');
      assert.equal(spy.calls.n, 0);
      assert.equal((await t.synthetic([])).position, 'readback');
      assert.ok(spy.calls.n > 0);
      assert.equal((await prints(t, 'estimate')).length, 1, 'nothing is asked again');
    }, { handlers: spy.handlers });
  });

  it('B7: a review run needs no route next: the estimate answer and one review reach readback and view in one message, and Stop after the final message closes the route', async () => {
    await withReview(async (t) => {
      await t.start();
      await t.hook('estimate', 'run');
      const readback = await t.synthetic([]);
      assert.equal(readback.position, 'readback');
      assert.match(readback.text, /Review read-back/);
      assert.match(readback.text, /Review page/);
      assert.doesNotMatch(readback.text, /route next/);
      const steps = (await t.kinds('step')).map((entry) => `${entry['step']}:${entry['status']}`);
      assert.ok(steps.includes('readback:completed') && steps.includes('view:delivered'), steps.join(' '));
      assert.notEqual(await t.fx.engine.deliver(CHECK_TASK, SESSION_A, t.fx.scratchpad), null, 'a resume or another prompt does not close it');
      assert.equal((await t.kinds('exit')).length, 0);
      await t.fx.engine.stopHook({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad });
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
    });
  });

  it('08-R5: the delivered command names the task and the narrowing last used; narrow reprints the gate with the hint', async () => {
    await withReview(async (t) => {
      await t.start();
      const bare = await t.hook('estimate', 'narrow');
      assert.equal(bare.position, 'estimate');
      assert.match(bare.text, /give the --only\/--exclude tokens as your answer/);
      const narrowed = await t.hook('estimate', "--exclude 'docs/**' --only 'src/**'");
      assert.equal(narrowed.position, 'estimate');
      assert.match(narrowed.text, /narrowed: --exclude 'docs\/\*\*' --only 'src\/\*\*'/);
      assert.equal((await prints(t, 'estimate')).length, 3);
      const run = await t.hook('estimate', 'run');
      assert.equal(run.position, 'review-run');
      assert.match(run.text, /review --task ord-7 --only 'src\/\*\*' --exclude 'docs\/\*\*'`/);
    });
  });

  it('08-R5: the delivered command names the route target: --branch with its base, or --mr with its url', async () => {
    await withReview(async (t) => {
      await t.start({ target: { branch: true, base: 'main', mr: null } });
      assert.match((await t.hook('estimate', 'run')).text, /review --task ord-7 --branch --base 'main'`/);
    });
    await withReview(async (t) => {
      await t.start({ target: { branch: false, base: null, mr: MR } });
      assert.match((await t.hook('estimate', 'run')).text, new RegExp(`review --task ord-7 --mr '${MR.replaceAll('/', '\\/')}'`));
    }, { handlers: STUB_ESTIMATE });
  });

  it('08-R5: reviewCommand carries no --approve and no target for uncommitted work', () => {
    const args = { text: '', requirements: [], project: null, plan: null, fromDraft: null, answers: [], headless: false, hasRequirement: false, hash: 'h' };
    assert.equal(reviewCommand('ord-7', args, []), 'review --task ord-7');
    assert.equal(reviewCommand('ord-7', { ...args, target: { branch: true, base: null, mr: null } }, []), 'review --task ord-7 --branch');
  });

  it('S12: a late bound answer after a never-asked default supersedes it and uses the answered instance', async () => {
    await withReview(async (t) => {
      await t.start();
      const print = (await prints(t, 'estimate'))[0]!;
      for (let turn = 0; turn < 3; turn += 1) await t.next();
      assert.equal((await t.kinds('default-taken')).at(-1)?.['via'], 'never-asked');
      const late = await t.next({ cause: 'gate-hook', answers: [{ gate: 'estimate', option: 'run', instance: print.id }] });
      assert.equal((await t.kinds('acceptance')).at(-1)?.['instance'], print.id);
      assert.equal(late.position, 'review-run');
      assert.match(late.text, /review --task ord-7/);
    });
  });
});

describe('review route: step texts, ceilings and the ignore warning (08-R6, 08-B1, 08-R7)', () => {
  const read = async (name: string): Promise<string> => (await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8')).replaceAll('{cli}', `node "${REPO_ROOT}/scripts/ambicode.mjs"`).replaceAll('{task}', CHECK_TASK);

  it('08-R6/08-B1: each review step text is at most 1,500 characters after inclusion', async () => {
    assert.equal(MAX_INSTRUCTION_CHARS, 1500);
    for (const name of ['review/fetch', 'review/readback', 'review/view']) assert.ok((await read(name)).length <= 1500, name);
  });

  it('08-R6: readback points an --mr review to references/merge-request.md, which ships beside the review skill', async () => {
    assert.match(await read('review/readback'), /\(`--mr`\), read `references\/merge-request\.md` beside the review skill's SKILL\.md/);
    assert.ok((await readFile(path.join(REPO_ROOT, 'skills', 'review', 'references', 'merge-request.md'), 'utf8')).length > 0);
  });

  it('08-R6: readback reads the four parts in order, copies part 4 verbatim and names references/outcomes.md', async () => {
    const text = await read('review/readback');
    assert.match(text, /1\. what was reviewed, 2\. findings, 3\. verification, 4\. omissions, uncertainty and unavailable coverage/);
    assert.match(text, /Part 4 copied verbatim/);
    assert.match(text, /references\/outcomes\.md/);
    assert.doesNotMatch(text, /route next/);
  });

  it('08-R6: view runs view --review in the background for an --mr target or at least one finding, and publication stays human', async () => {
    const text = await read('review/view');
    assert.match(text, /merge request \(`--mr`\) or the review has at least one finding/);
    assert.match(text, /view --review <reviewId>/);
    assert.match(text, /background/);
    assert.match(text, /Publishing is the user's/);
    assert.doesNotMatch(text, /route next/);
  });

  it('08-B1: the route start output is at most 3,072 bytes and the printed estimate at most 2,048', async () => {
    await withReview(async (t) => {
      const start = await t.start();
      assert.ok(Buffer.byteLength(start.text) <= 3072, `${Buffer.byteLength(start.text)}`);
      const estimate = start.text.split('\nRun the independent reviewer on this change?\n')[1]!.split('\nOptions:')[0]!;
      assert.match(estimate, /^Review estimate: /);
      assert.ok(Buffer.byteLength(estimate) <= 2048, `${Buffer.byteLength(estimate)}`);
    });
  });

  it('08-R7: the ignore warning names init --apply when metrics.jsonl is not git-ignored, and is absent when it is', async () => {
    await withReview(async (t) => {
      const warning = await metricsIgnoreWarning(t.fx.runtime, 'review');
      assert.match(warning ?? '', /^warning: \.ambicode\/metrics\.jsonl is not ignored by git; run `ambicode init --apply`/);
      assert.equal(await metricsIgnoreWarning(t.fx.runtime, 'task'), null);
      await t.fx.repo.write('.gitignore', '.ambicode/metrics.jsonl\n');
      assert.equal(await metricsIgnoreWarning(t.fx.runtime, 'review'), null);
      await t.fx.repo.write('.gitignore', '.ambicode/\n');
      assert.equal(await metricsIgnoreWarning(t.fx.runtime, 'review'), null);
    });
  });
});

describe('review --task under the review route (08-R8)', () => {
  const reviewer = (): { calls: { n: number }; deps: ReviewDependencies } => {
    const calls = { n: 0 };
    return { calls, deps: { reviewer: { async invoke() { calls.n += 1; return { kind: 'ok', output: { findings: [], coverageNotes: [] }, rawLength: 2, argv: ['claude'] } as never; } } as never, warm: async () => {} } };
  };
  const review = (t: Fixture, deps: ReviewDependencies, ...extra: string[]) => runReview(t.runtime, parseArgs('review', ['--task', CHECK_TASK, ...extra], REVIEW_OPTIONS), deps);

  it('08-R8: without an honoured run the command refuses review-not-accepted and writes no review; no baseline-missing is raised', async () => {
    await withReview(async (t) => {
      await t.start();
      const spy = reviewer();
      assert.equal(await code(review(t, spy.deps)), 'review-not-accepted');
      await t.next({ answers: [{ gate: 'estimate', option: 'run' }] });
      assert.equal(await code(review(t, spy.deps)), 'review-not-accepted', 'a model-typed run is no consent');
      assert.equal(spy.calls.n, 0);
      assert.equal((await t.kinds('review')).length, 0);
    });
  });

  it('08-R8: after an honoured run the review takes the route target with no baseline scoping and its tail brings readback', async () => {
    await withReview(async (t) => {
      await t.start();
      await t.hook('estimate', 'run');
      const out = await review(t, reviewer().deps);
      assert.equal(out.result.target.kind, 'working');
      assert.doesNotMatch(out.result.omissions.join('\n'), /baseline|pre-existing/);
      assert.ok(out.result.changedFiles.some((file) => file.newPath === 'src/orders.ts'));
      assert.match(out.next ?? '', /step readback/);
      assert.equal((await t.kinds('review')).length, 1);
    });
  });

  it('08-R8: one acceptance is one reviewer run; a second run without a new acceptance is refused', async () => {
    await withReview(async (t) => {
      await t.start();
      await t.hook('estimate', 'run');
      const spy = reviewer();
      await review(t, spy.deps);
      assert.equal(await code(review(t, spy.deps)), 'review-not-accepted');
      assert.equal(spy.calls.n, 1);
      assert.equal((await t.kinds('review')).length, 1);
    });
  });

  it('08-R8: a target flag that differs from the route target refuses conflicting-target, before any review is written', async () => {
    await withReview(async (t) => {
      await t.start();
      await t.hook('estimate', 'run');
      assert.equal(await code(review(t, reviewer().deps, '--branch', '--base', 'main')), 'conflicting-target');
      assert.equal(await code(review(t, reviewer().deps, '--mr', MR)), 'conflicting-target');
      assert.equal((await t.kinds('review')).length, 0);
    });
    await withReview(async (t) => {
      await t.start({ target: { branch: true, base: 'main', mr: null } });
      await t.hook('estimate', 'run');
      assert.equal(await code(review(t, reviewer().deps, '--mr', MR)), 'conflicting-target');
    });
  });

  it('08-R8: the route target decides what is reviewed: a branch route reviews the branch, not the uncommitted work', async () => {
    await withReview(async (t) => {
      await t.fx.repo.run(['git', 'checkout', '-q', '-b', 'feature']);
      await t.fx.repo.write('src/feature.ts', 'export const feature = 1;\n');
      await t.fx.repo.commitAll('feature');
      await t.start({ target: { branch: true, base: 'main', mr: null } });
      await t.hook('estimate', 'run');
      const out = await review(t, reviewer().deps);
      assert.equal(out.result.target.kind, 'branch');
      assert.deepEqual(out.result.changedFiles.map((file) => file.newPath), ['src/feature.ts']);
    }, { dirty: false });
  });
});
