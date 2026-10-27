import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { parseArgs } from '#util/args';
import { startTarget } from '#cli/commands/route/route';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { loadRouteRegistry } from '#harness/definition/routes';
import { gapsOf } from '#modules/evidence/report/report';
import { CHECK_CONFIG, CHECK_TASK } from '#testing/fixtures/check-fixture';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { reviewRouteFixture } from '#testing/fixtures/review-route-fixture';
import { SESSION_A } from '#testing/fixtures/ids';
import { runHook } from '#hook/events/run-hook';
import { HOOK_LIMIT } from '#harness/engine/execute';
import { REPO_ROOT } from '#testing/paths';
import { ROUTE_START_OPTIONS } from '#types/cli';
import type { Handler } from '#types/harness';

type Fixture = Awaited<ReturnType<typeof reviewRouteFixture>>;

const MR = 'https://gitlab.example.com/g/p/-/merge_requests/7';
const TICKET = 'https://example.atlassian.net/browse/ORD-17';
/** Asks, so the route stops at the gate and starts several targets without pinning any. */
const STUB_ESTIMATE: Record<string, Handler> = { 'review.estimate': async () => ({ state: 'ok', payload: 'stub estimate', record: { asks: true } }) };

const checksOf = (checks: string): string => CHECK_CONFIG.replace(/checks:[\s\S]*$/, `checks:\n${checks}`);
const UNIT = (command: string): string => checksOf(`      unit: { all: null, file: "${command}" }\n      typecheck: { all: "tsc --noEmit", file: null }\n      format: { all: null, file: "fmt {file}" }\n`);

// The fixture's own config has a propose and a forbid check, which would ask or refuse before the route reaches the reviewer.
async function withReview(body: (t: Fixture) => Promise<void>, options: Parameters<typeof reviewRouteFixture>[0] = {}): Promise<void> {
  const t = await reviewRouteFixture({ config: UNIT('true {file}'), ...options });
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

describe('review route: shape and start (08-R1, 08-R2, 08-R3)', { concurrency: 4 }, () => {
  it('08-R1: routes/review/review.yaml has the contract steps, the estimate gate, loads with the registry and is packaged with its step files', async () => {
    const route = YAML.parse(await readFile(path.join(REPO_ROOT, 'routes', 'review', 'review.yaml'), 'utf8')) as { skill: string; version: number; steps: { id: string; actor: string; when?: string; needs?: string[]; repeat?: number; gate?: Record<string, unknown> }[] };
    assert.deepEqual([route.skill, route.version], ['review', 3]);
    assert.deepEqual(route.steps.map((step) => [step.id, step.actor]), [['mr-fetch', 'code'], ['fetch', 'model'], ['ground', 'code'], ['estimate-step', 'code'], ['estimate', 'human'], ['brief', 'code'], ['review-agent', 'model'], ['review-record', 'code'], ['page', 'code'], ['readback', 'model']]);
    const gate = route.steps.find((step) => step.id === 'estimate')!.gate!;
    assert.deepEqual([gate['options'], gate['acting'], gate['default']], [['narrow', 'skip'], undefined, 'skip']);
    assert.equal(route.steps.find((step) => step.id === 'estimate')!.when, 'estimate.asks');
    const brief = route.steps.find((step) => step.id === 'brief') as unknown as { when: string; run: string[] };
    assert.deepEqual([brief.when, brief.run], ['estimate.run', ['review.pin', 'policy.stage(before-work, review)', 'script(brief)']]);
    assert.ok((await loadRouteRegistry(REPO_ROOT, nodeFileSystem)).route('review') !== null);
    assert.match(await readFile(path.join(REPO_ROOT, 'tools', 'package-candidate.mjs'), 'utf8'), /from: 'routes', extensions: \['\.yaml', '\.md'\]/);
    const agent = route.steps.find((step) => step.id === 'review-agent') as unknown as { when: string; produces?: string[]; instruction: string };
    assert.deepEqual([agent.when, agent.produces, agent.instruction], ['estimate.run', undefined, 'file:routes/review/agent.md']);
    const record = route.steps.find((step) => step.id === 'review-record') as unknown as { when: string; run: string; produces: string[] };
    assert.deepEqual([record.when, record.run, record.produces], ['estimate.run', 'review.record', ['review{recorded}']]);
    for (const name of ['review/fetch', 'review/readback', 'review/agent', 'review/agent-work']) assert.ok((await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8')).length > 0, name);
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

  it('08-R3: ceremony — one message to the reviewer without a requirement; fetch, one route next, then the reviewer with one', async () => {
    await withReview(async (t) => {
      const first = await t.start();
      assert.equal(first.position, 'review-agent', 'nothing was refused, so no question is asked');
      assert.equal((await prints(t, 'estimate')).length, 0);
      assert.deepEqual((await steps(t, 'skipped')).slice(0, 4), ['mr-fetch', 'fetch', 'ground', 'estimate']);
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
      assert.equal(gate.position, 'review-agent');
      assert.equal((await prints(t, 'estimate')).length, 0);
      assert.deepEqual((await t.kinds('step')).filter((entry) => ['ground', 'estimate-step'].includes(String(entry['step']))).map((entry) => `${entry['step']}:${entry['status']}`), ['ground:completed', 'estimate-step:completed']);
    }, { handlers: { 'requirements.normalize': normalize } });
  });
});

describe('review route: the estimate gate (08-R4, 08-R5, S12, S14)', { concurrency: 4 }, () => {
  it('08-R4: a refused estimate asks; answer skip completes the route without brief, review-agent or readback and reports the skip under Not verified', async () => {
    await withReview(async (t) => {
      assert.equal((await t.start()).position, 'estimate');
      assert.equal((await t.hook('estimate', 'skip')).position, 'complete');
      const skipped = await steps(t, 'skipped');
      for (const step of ['brief', 'review-agent', 'readback']) assert.ok(skipped.includes(step), step);
      assert.equal((await t.kinds('review')).length, 0);
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
    }, { refuse: true });
  });

  it('08-R4: an estimate that refuses nothing asks nothing: the pin and the reviewer follow, with or without a headless start', async () => {
    for (const headless of [false, true]) {
      await withReview(async (t) => {
        const started = await t.start({ headless });
        assert.equal(started.position, 'review-agent');
        assert.equal((await prints(t, 'estimate')).length, 0);
        assert.equal((await t.kinds('default-taken')).length, 0);
        assert.deepEqual((await t.kinds('review')).map((entry) => entry['stage']), ['pending']);
        assert.ok((await steps(t, 'skipped')).includes('estimate'));
      });
    }
  });

  it('08-R4: an unanswered gate holds the route: no default is taken however often it advances, and no reviewer starts', async () => {
    await withReview(async (t) => {
      await t.start();
      for (let turn = 0; turn < 3; turn += 1) assert.equal((await t.next()).position, 'estimate');
      assert.equal((await t.kinds('default-taken')).length, 0);
      assert.equal((await t.kinds('review')).length, 0);
      assert.equal((await t.kinds('exit')).length, 0);
    }, { refuse: true });
  });

  it('08-R5: with nothing refused the review is pinned in code and the reviewer step is next', async () => {
    await withReview(async (t) => {
      const run = await t.start();
      assert.equal(run.position, 'review-agent');
      assert.doesNotMatch(run.text, /review --task/);
      assert.deepEqual((await t.kinds('review')).map((entry) => [entry['stage'], entry['route'] !== undefined]), [['pending', true]]);
      assert.equal((await steps(t, 'delivered')).includes('review-run'), false);
      assert.equal((await prints(t, 'estimate')).length, 0);
      assert.equal((await t.next()).position, 'readback', 'route next ends the reviewer step and records its (missing) answer');
      assert.deepEqual((await t.kinds('review')).map((entry) => entry['stage']), ['pending', 'recorded'], 'a second advance pins nothing again');
    });
  });

  describe('the route runs the configured file-scoped checks itself', { concurrency: 4 }, () => {
    const reviewDir = (t: Fixture) => t.bundle;
    const resultOf = async (t: Fixture) => JSON.parse(await readFile(path.join(reviewDir(t), 'result.json'), 'utf8')) as { checks: { key: string; exit: number }[]; omissions: { text: string }[]; status: string };

    it('a check with a file form runs on the changed files and is recorded as a check entry; the all-only and format checks do not run; brief and result carry it', async () => {
      await withReview(async (t) => {
        assert.equal((await t.start()).position, 'review-agent');
        assert.deepEqual((await t.kinds('check')).map((entry) => [entry['key'], entry['files'], entry['exit'], entry['phase'], entry['route'] !== undefined]), [['app/unit', ['src/orders.ts'], 0, 'green', true]]);
        assert.deepEqual((await resultOf(t)).checks.map((check) => [check.key, check.exit]), [['app/unit', 0]]);
        assert.match(await readFile(path.join(t.bundle, 'brief.md'), 'utf8'), /- app\/unit: passed; on: src\/orders\.ts/);
      }, { config: UNIT('true {file}') });
    });

    it('a failing check is recorded as a failure: the brief and the report mark it FAILED, the result names it and the review is partial', async () => {
      await withReview(async (t) => {
        assert.equal((await t.start()).position, 'review-agent');
        assert.deepEqual((await t.kinds('check')).map((entry) => entry['exit']), [1]);
        assert.match(await readFile(path.join(t.bundle, 'brief.md'), 'utf8'), /- app\/unit: FAILED \(exit 1\)/);
        assert.match(await readFile(path.join(t.bundle, 'report.txt'), 'utf8'), /app\/unit green: exit 1.*FAILED/);
        const result = await resultOf(t);
        assert.equal(result.status, 'partial');
        assert.match(result.omissions.map((omission) => omission.text).join('\n'), /app\/unit failed with exit 1/);
      }, { config: UNIT('false {file}') });
    });

    it('no check with a command: nothing runs, no check entry, and the brief says no check was recorded', async () => {
      const none = CHECK_CONFIG.replace(/checks:[\s\S]*$/, 'checks:\n      lint: { all: null, file: null }\n      unit: { all: null, file: null }\n');
      await withReview(async (t) => {
        assert.equal((await t.start()).position, 'review-agent');
        assert.deepEqual(await t.kinds('check'), []);
        assert.match(await readFile(path.join(t.bundle, 'brief.md'), 'utf8'), /No check recorded for this task/);
      }, { config: none });
    });

    it('in a repository with two projects only the project the change touches runs checks', async () => {
      const second = `  - id: web
    root: "web"
    paths: [web/]
    ecosystem: { languages: [typescript], frameworks: [], packageManager: null }
    commands: { dev: "npm run dev" }
    checks:
      unit: { all: null, file: "true {file}" }
`;
      await withReview(async (t) => {
        // policy.stage still asks which project (it did before the pin moved into code); the checks ran before it, on the touched project only.
        await t.start();
        assert.deepEqual((await t.kinds('check')).map((entry) => entry['key']), ['app/unit']);
      }, { config: `${UNIT('true {file}')}${second}` });
    });

    const E2E = (command: string): string => checksOf(`      unit: { all: null, file: "true {file}" }\n      e2e: { all: null, file: "${command}" }\n`);

    it('a check that needs approval asks the user before the review is pinned; approving runs it once, and the checks that already ran are not run again', async () => {
      await withReview(async (t) => {
        const asked = await t.start();
        assert.equal(asked.position, 'brief');
        assert.deepEqual((await prints(t, 'check-only-unauthorized')).length, 1);
        assert.equal((await t.kinds('review')).length, 0);
        const agent = await t.hook('check-only-unauthorized', 'approve');
        assert.equal(agent.position, 'review-agent');
        assert.deepEqual((await t.kinds('check')).map((entry) => entry['key']).sort(), ['app/e2e', 'app/unit']);
        assert.equal((await t.kinds('review')).length, 1);
      }, { config: E2E('true {file}') });
    });

    it('declining that question records no check, says so in the result, and the review goes on', async () => {
      await withReview(async (t) => {
        assert.equal((await t.start()).position, 'brief');
        assert.equal((await t.hook('check-only-unauthorized', 'decline')).position, 'review-agent');
        assert.deepEqual((await t.kinds('check')).map((entry) => entry['key']), ['app/unit']);
        assert.match((await resultOf(t)).omissions.map((omission) => omission.text).join('\n'), /app\/e2e was not run: declined/);
      }, { config: E2E('true {file}') });
    });

    it('a check the policy forbids is not run and is named in the result; the others still run', async () => {
      await withReview(async (t) => {
        assert.equal((await t.start()).position, 'review-agent');
        assert.deepEqual((await t.kinds('check')).map((entry) => entry['key']), ['app/unit']);
        assert.deepEqual((await t.kinds('limit')).map((entry) => entry['which']), ['check-forbidden']);
        assert.match((await resultOf(t)).omissions.map((omission) => omission.text).join('\n'), /app\/lint was not run: check-only-unauthorized/);
      }, { config: checksOf('      unit: { all: null, file: "true {file}" }\n      lint: { all: null, file: "true {file}" }\n') });
    });
  });

  it('08-R5: a recorded review after the run goes on to readback and nothing is asked again', async () => {
    await withReview(async (t) => {
      assert.equal((await t.start()).position, 'review-agent');
      assert.equal((await t.synthetic([], { stage: 'recorded' })).position, 'readback');
      assert.equal((await prints(t, 'estimate')).length, 0, 'nothing is asked');
    });
  });

  it('B7: the estimate answer reaches the reviewer step in one message that launches the subagent on its work file, which holds the brief path and the answer file; a recorded review reaches readback and Stop after the final message closes the route', async () => {
    await withReview(async (t) => {
      await t.start();
      const agent = await t.hook('estimate', 'run');
      assert.equal(agent.position, 'review-agent');
      assert.match(agent.text, /ambicode:reviewer/);
      assert.doesNotMatch(agent.text, /diff:|brief: /);
      assert.match(agent.text, /Review the change described in .+work-review-agent\.md/);
      assert.match(agent.text, /Then: launch the subagent on .+work-review-agent\.md; when it returns, run .+route next --task ord-7/);
      const work = await readFile(path.join(t.dir, 'steps', 'work-review-agent.md'), 'utf8');
      assert.match(work, /## script:brief\nbrief: .*brief\.md/);
      assert.match(work, /answer: .*answer\.json/);
      assert.doesNotMatch(work, /review record|Run commands from|review my change/);
      const readback = await t.synthetic([], { stage: 'recorded' });
      assert.match(readback.text, /Review read-back/);
      assert.doesNotMatch(readback.text, /Review page: http/, 'no finding on a local target: no page, so no link is delivered');
      assert.doesNotMatch(readback.text, /route next/);
      const steps = (await t.kinds('step')).map((entry) => `${entry['step']}:${entry['status']}`);
      assert.ok(steps.includes('review-agent:delivered') && steps.includes('readback:delivered'), steps.join(' '));
      assert.notEqual(await t.fx.engine.deliver(CHECK_TASK, t.fx.scratchpad), null, 'a resume or another prompt does not close it');
      assert.equal((await t.kinds('exit')).length, 0);
      await t.fx.engine.stopHook({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad }, { repositoryRoot: t.fx.repo.root, where: '.' });
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
    });
  });

  it('08-R5: the pin applies the narrowing last used; narrow reprints the gate with the hint', async () => {
    await withReview(async (t) => {
      await t.start();
      const bare = await t.hook('estimate', 'narrow');
      assert.equal(bare.position, 'estimate');
      assert.match(bare.text, /give the --only\/--exclude tokens as your answer/);
      const narrowed = await t.hook('estimate', "--exclude 'docs/**' --only 'src/**'");
      assert.equal(narrowed.position, 'review-agent');
      assert.equal((await prints(t, 'estimate')).length, 2, 'the narrowed estimate is under the limit: nothing is asked again');
      const result = JSON.parse(await readFile(path.join(t.bundle, 'result.json'), 'utf8')) as { omissions: { text: string }[] };
      assert.match(result.omissions.map((omission) => omission.text).join('\n'), /narrowed on request: only paths matching "src\/\*\*"/);
      assert.doesNotMatch(result.omissions.map((omission) => omission.text).join('\n'), /narrowed on request: paths/);
    }, { refuse: true });
  });

  // Reproduces: a flag answer takes the model revise path, which the target's default repeat 1 refuses. Not fixed (task-lifecycle P3).
  it('08-R5: narrow given by --answer flag reprints the estimate gate instead of hitting the repeat limit', { todo: true }, async () => {
    await withReview(async (t) => {
      await t.start();
      const narrowed = await t.next({ answers: [{ gate: 'estimate', option: 'narrow' }] });
      assert.deepEqual((await t.kinds('limit')).map((entry) => [entry['which'], entry['step']]), []);
      assert.equal(narrowed.position, 'estimate');
    });
  });

  it('08-R5: the pin takes the route target: a --branch review pins the branch, not the working tree', async () => {
    await withReview(async (t) => {
      await t.start({ target: { branch: true, base: 'HEAD~1', mr: null } });
      const result = JSON.parse(await readFile(path.join(t.bundle, 'result.json'), 'utf8')) as { target: { kind: string } };
      assert.equal(result.target.kind, 'branch');
    }, { dirty: false });
  });

  it('a review stages only the packs that match the files it reviews, also when the tree holds no baseline of its own', async () => {
    const pack = (applies: string): string => ['schemaVersion: 1', 'id: scoped', 'authority: team', `appliesTo: ["${applies}"]`, 'activities: [review]', 'source: { location: "test" }', 'rules:', '  - id: freeze', '    category: security', '    instruction: Freeze this file.', '    check: { kind: reviewer, explanation: x }', ''].join('\n');
    for (const [applies, included] of [['ci/**', false], ['src/**', true]] as const) {
      await withReview(async (t) => {
        await t.start({ target: { branch: true, base: 'HEAD~1', mr: null } });
        assert.equal((await readFile(path.join(t.bundle, 'brief.md'), 'utf8')).includes('scoped/freeze'), included, applies);
      }, { dirty: false, pack: pack(applies) });
    }
  });

});

describe('review route: step texts, ceilings and the ignore warning (08-R6, 08-B1, 08-R7)', { concurrency: 4 }, () => {
  const read = async (name: string): Promise<string> => (await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8')).replaceAll('{cli}', `node "${REPO_ROOT}/scripts/ambicode.mjs"`).replaceAll('{task}', CHECK_TASK);

  it('08-R6/08-B1: each review step text is at most 1,500 characters after inclusion', async () => {
    for (const name of ['review/fetch', 'review/readback', 'review/agent', 'review/agent-work']) assert.ok((await read(name)).length <= 1500, name);
  });

  it('08-R6: readback asks for a one-line summary, one line per finding and part 3 in a line or two, copies part 4 verbatim in one fence and names references/outcomes.md', async () => {
    const text = await read('review/readback');
    assert.match(text, /One line: what was reviewed/);
    assert.match(text, /Findings, one line each: `path:line`, risk, one sentence/);
    assert.match(text, /every `path:line` the finding names exactly as printed/);
    assert.match(text, /Part 3 \(verification\) in one or two lines/);
    assert.match(text, /in one fenced code block/);
    assert.match(text, /Part 4 copied verbatim/);
    assert.match(text, /references\/outcomes\.md/);
    assert.doesNotMatch(text, /route next/);
  });

  it('08-R6: the agent step names the subagent and hands it the work file; the work file names the answer file to Write and the reviewer is never held to the foreground', async () => {
    const text = await read('review/agent');
    assert.match(text, /`ambicode:reviewer` subagent on \{work\}/);
    assert.match(text, /Review the change described in \{work\}\. The code is in the checkout\./);
    assert.match(text, /When it returns, run the Then command/);
    assert.match(text, /Do not edit, filter/);
    assert.doesNotMatch(text, /run_in_background|hook|review record/);
    const work = await read('review/agent-work');
    assert.match(work, /Write tool, to the file named `answer:` under `## script:brief`/);
    assert.doesNotMatch(work, /review record|<<'EOF'/);
    assert.match(work, /If it lists several parts, Read every part, in order, before writing/);
    assert.match(work, /never a position in the brief/);
    assert.match(work, /reply with one line: `Answer written\.`/);
  });

  it('08-B1: the route start output is at most 3,072 bytes and the printed estimate at most 2,048', async () => {
    await withReview(async (t) => {
      const start = await t.start();
      assert.ok(Buffer.byteLength(start.text) <= 3072, `${Buffer.byteLength(start.text)}`);
      const estimate = start.text.split('select text:\n')[1]!.split('\n\nThen ask: The review cannot run on this change as it stands. Narrow it, or skip the review?')[0]!;
      assert.match(estimate, /Review estimate: /);
      assert.ok(Buffer.byteLength(estimate) <= 2048, `${Buffer.byteLength(estimate)}`);
    }, { refuse: true });
  });

});

describe('review.pin assembly', { concurrency: 4 }, () => {
  it('assembles the bundle once: the pin adds one unmerged-paths probe to the estimate\'s', async () => {
    await withReview(async (t) => {
      const real = t.fx.runtime.runner;
      let probes = 0;
      t.fx.runtime.runner = { run: (request) => (request.argv.includes('--unmerged') && (probes += 1), real.run(request)) };
      await t.start();
      assert.equal(probes, 2);
    });
  });
});
