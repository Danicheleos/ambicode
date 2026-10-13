import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { parseArgs } from '#util/args';
import { startTarget } from '#cli/commands/route/route';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { loadRouteRegistry } from '#harness/definition/routes';
import { buildReport } from '#modules/evidence/report/report';
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
const STUB_ESTIMATE: Record<string, Handler> = { 'review.estimate': async () => ({ state: 'ok', payload: 'stub estimate' }) };

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
const RUN = { answers: [{ gate: 'estimate', option: 'run' }] };
const cli = (...argv: string[]) => parseArgs('route start', ['review', ...argv], ROUTE_START_OPTIONS);

describe('review route: shape and start (08-R1, 08-R2, 08-R3)', () => {
  it('08-R1: routes/review/review.yaml has the contract steps, the estimate gate, loads with the registry and is packaged with its step files', async () => {
    const route = YAML.parse(await readFile(path.join(REPO_ROOT, 'routes', 'review', 'review.yaml'), 'utf8')) as { skill: string; version: number; steps: { id: string; actor: string; when?: string; needs?: string[]; repeat?: number; gate?: Record<string, unknown> }[] };
    assert.deepEqual([route.skill, route.version], ['review', 3]);
    assert.deepEqual(route.steps.map((step) => [step.id, step.actor]), [['fetch', 'model'], ['ground', 'code'], ['mr-fetch', 'model'], ['estimate-step', 'code'], ['estimate', 'human'], ['brief', 'code'], ['review-agent', 'model'], ['readback', 'model'], ['publish-list', 'code'], ['publish', 'human'], ['publish-run', 'model']]);
    const gate = route.steps.find((step) => step.id === 'estimate')!.gate!;
    assert.deepEqual([gate['options'], gate['acting'], gate['default']], [['run', 'narrow', 'skip'], ['run'], 'skip']);
    const brief = route.steps.find((step) => step.id === 'brief') as unknown as { when: string; run: string[]; repeat?: number };
    // Pin and checks run in code; a check answer revises this step, so it may run twice.
    assert.deepEqual([brief.when, brief.run, brief.repeat], ['gate.estimate.is(run)', ['review.pin', 'policy.stage(before-work, review)', 'script(brief)'], 2]);
    assert.ok((await loadRouteRegistry(REPO_ROOT, nodeFileSystem)).route('review') !== null);
    assert.match(await readFile(path.join(REPO_ROOT, 'tools', 'package-candidate.mjs'), 'utf8'), /from: 'routes', extensions: \['\.yaml', '\.md'\]/);
    const agent = route.steps.find((step) => step.id === 'review-agent') as unknown as { when: string; produces: string[]; instruction: string };
    assert.deepEqual([agent.when, agent.produces, agent.instruction], ['gate.estimate.is(run)', ['review{recorded}'], 'file:routes/review/agent.md']);
    for (const name of ['review/fetch', 'review/readback', 'review/agent']) assert.ok((await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8')).length > 0, name);
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
      assert.deepEqual(await steps(t, 'skipped'), ['fetch', 'ground', 'mr-fetch']);
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
      assert.deepEqual((await t.kinds('step')).filter((entry) => ['ground', 'estimate-step'].includes(String(entry['step']))).map((entry) => `${entry['step']}:${entry['status']}`), ['ground:completed', 'estimate-step:completed']);
    }, { handlers: { 'requirements.normalize': normalize } });
  });
});

describe('review route: the estimate gate (08-R4, 08-R5, S12, S14)', () => {
  it('08-R4: answer skip completes the route without brief, review-agent or readback and reports the skip under Not verified', async () => {
    await withReview(async (t) => {
      await t.start();
      assert.equal((await t.hook('estimate', 'skip')).position, 'complete');
      const skipped = await steps(t, 'skipped');
      for (const step of ['brief', 'review-agent', 'readback']) assert.ok(skipped.includes(step), step);
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

  it('08-R4: an unanswered gate holds the route: no default is taken however often it advances, and no reviewer starts', async () => {
    await withReview(async (t) => {
      await t.start();
      for (let turn = 0; turn < 3; turn += 1) assert.equal((await t.next()).position, 'estimate');
      assert.equal((await t.kinds('default-taken')).length, 0);
      assert.equal((await t.kinds('review')).length, 0);
      assert.equal((await t.kinds('exit')).length, 0);
    });
  });

  it('08-R4/S14: an untrusted --answer estimate=run at a cli start is declined, the default is skip and no review is delivered', async () => {
    await withReview(async (t) => {
      await t.start({ channel: 'cli', headless: true, answers: [{ gate: 'estimate', option: 'run' }] });
      assert.equal((await t.kinds('preanswer')).length, 0);
      assert.deepEqual((await t.kinds('declined')).map((entry) => [entry['gate'], entry['reason'], entry['via']]), [['estimate', 'acting-needs-human', 'flag']]);
      assert.equal((await t.kinds('review')).length, 0);
      assert.equal((await steps(t, 'delivered')).includes('brief'), false);
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

  it('08-R5/S14: a trusted preanswer run is honoured at the printed instance; the review is pinned in code, the reviewer step is next and nothing is asked again', async () => {
    await withReview(async (t) => {
      const run = await t.start(RUN);
      assert.equal(run.position, 'review-agent');
      assert.doesNotMatch(run.text, /review --task/);
      assert.deepEqual((await t.kinds('review')).map((entry) => [entry['stage'], entry['route'] !== undefined]), [['pending', true]]);
      assert.equal((await steps(t, 'delivered')).includes('review-run'), false);
      const print = (await prints(t, 'estimate'))[0]!;
      const preanswer = (await t.kinds('preanswer'))[0]!;
      assert.deepEqual((await t.kinds('acceptance')).map((entry) => [entry['gate'], entry['answer'], entry['via'], entry['instance'], entry['preanswer']]), [['estimate', 'run', 'prompt', print.id, preanswer.id]]);
      assert.equal((await prints(t, 'estimate')).length, 1);
      assert.equal((await t.next()).position, 'review-agent');
      assert.equal((await prints(t, 'estimate')).length, 1);
      assert.equal((await t.kinds('review')).length, 1, 'a second advance pins nothing again');
    });
  });

  describe('the route runs the configured file-scoped checks itself', () => {
    const reviewDir = (t: Fixture) => path.join(t.dir);
    const resultOf = async (t: Fixture) => JSON.parse(await readFile(path.join(reviewDir(t), 'result.json'), 'utf8')) as { checks: { key: string; exit: number }[]; omissions: string[]; status: string };

    it('a check with a file form runs on the changed files and is recorded as a check entry; the all-only and format checks do not run; brief and result carry it', async () => {
      await withReview(async (t) => {
        assert.equal((await t.start(RUN)).position, 'review-agent');
        assert.deepEqual((await t.kinds('check')).map((entry) => [entry['key'], entry['files'], entry['exit'], entry['phase'], entry['route'] !== undefined]), [['app/unit', ['src/orders.ts'], 0, 'green', true]]);
        assert.deepEqual((await resultOf(t)).checks.map((check) => [check.key, check.exit]), [['app/unit', 0]]);
        assert.match(await readFile(path.join(t.dir, 'brief.md'), 'utf8'), /- app\/unit green: exit 0; on: src\/orders\.ts/);
      }, { config: UNIT('true {file}') });
    });

    it('a failing check is recorded as a failure: the brief and the report mark it FAILED, the result names it and the review is partial', async () => {
      await withReview(async (t) => {
        assert.equal((await t.start(RUN)).position, 'review-agent');
        assert.deepEqual((await t.kinds('check')).map((entry) => entry['exit']), [1]);
        assert.match(await readFile(path.join(t.dir, 'brief.md'), 'utf8'), /- app\/unit green: exit 1.*FAILED/);
        assert.match(await readFile(path.join(t.dir, 'report.txt'), 'utf8'), /app\/unit green: exit 1.*FAILED/);
        const result = await resultOf(t);
        assert.equal(result.status, 'partial');
        assert.match(result.omissions.join('\n'), /app\/unit failed with exit 1/);
      }, { config: UNIT('false {file}') });
    });

    it('no check with a command: nothing runs, no check entry, and the brief says no check was recorded', async () => {
      const none = CHECK_CONFIG.replace(/checks:[\s\S]*$/, 'checks:\n      lint: { all: null, file: null }\n      unit: { all: null, file: null }\n');
      await withReview(async (t) => {
        assert.equal((await t.start(RUN)).position, 'review-agent');
        assert.deepEqual(await t.kinds('check'), []);
        assert.match(await readFile(path.join(t.dir, 'brief.md'), 'utf8'), /No check recorded for this task/);
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
        await t.start(RUN);
        assert.deepEqual((await t.kinds('check')).map((entry) => entry['key']), ['app/unit']);
      }, { config: `${UNIT('true {file}')}${second}` });
    });

    const E2E = (command: string): string => checksOf(`      unit: { all: null, file: "true {file}" }\n      e2e: { all: null, file: "${command}" }\n`);

    it('a check that needs approval asks the user before the review is pinned; approving runs it once, and the checks that already ran are not run again', async () => {
      await withReview(async (t) => {
        const asked = await t.start(RUN);
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
        assert.equal((await t.start(RUN)).position, 'brief');
        assert.equal((await t.hook('check-only-unauthorized', 'decline')).position, 'review-agent');
        assert.deepEqual((await t.kinds('check')).map((entry) => entry['key']), ['app/unit']);
        assert.match((await resultOf(t)).omissions.join('\n'), /app\/e2e was not run: declined/);
      }, { config: E2E('true {file}') });
    });

    it('a check the policy forbids is not run and is named in the result; the others still run', async () => {
      await withReview(async (t) => {
        assert.equal((await t.start(RUN)).position, 'review-agent');
        assert.deepEqual((await t.kinds('check')).map((entry) => entry['key']), ['app/unit']);
        assert.deepEqual((await t.kinds('limit')).map((entry) => entry['which']), ['check-forbidden']);
        assert.match((await resultOf(t)).omissions.join('\n'), /app\/lint was not run: check-only-unauthorized/);
      }, { config: checksOf('      unit: { all: null, file: "true {file}" }\n      lint: { all: null, file: "true {file}" }\n') });
    });
  });

  it('08-R5: a recorded review after the run goes on to readback and nothing is asked again', async () => {
    await withReview(async (t) => {
      await t.start();
      const run = await t.hook('estimate', 'run');
      assert.equal(run.position, 'review-agent');
      assert.equal((await t.next()).position, 'review-agent');
      assert.equal((await t.synthetic([], { stage: 'recorded' })).position, 'readback');
      assert.equal((await prints(t, 'estimate')).length, 1, 'nothing is asked again');
    });
  });

  it('B7: a review run needs no route next: the estimate answer and one review reach the reviewer step, and `review record` reaches readback, each in one message, and Stop after the final message closes the route', async () => {
    await withReview(async (t) => {
      await t.start();
      const agent = await t.hook('estimate', 'run');
      assert.equal(agent.position, 'review-agent');
      assert.match(agent.text, /ambicode:reviewer/);
      assert.doesNotMatch(agent.text, /diff:/);
      assert.match(agent.text, /brief: .*brief\.md/);
      assert.match(agent.text, /review record --task ord-7/);
      assert.doesNotMatch(agent.text, /route next/);
      const readback = await t.synthetic([], { stage: 'recorded' });
      assert.match(readback.text, /Review read-back/);
      assert.doesNotMatch(readback.text, /Review page/);
      assert.doesNotMatch(readback.text, /route next/);
      const steps = (await t.kinds('step')).map((entry) => `${entry['step']}:${entry['status']}`);
      assert.ok(steps.includes('review-agent:delivered') && steps.includes('readback:delivered'), steps.join(' '));
      assert.notEqual(await t.fx.engine.deliver(CHECK_TASK, SESSION_A, t.fx.scratchpad), null, 'a resume or another prompt does not close it');
      assert.equal((await t.kinds('exit')).length, 0);
      await t.fx.engine.stopHook({ hook_event_name: 'Stop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad });
      assert.equal((await t.kinds('exit')).at(-1)?.['reason'], 'done');
    });
  });

  describe('SubagentStop captures the reviewer answer', () => {
    const answer = '```json\n{"findings":[],"coverageNotes":[]}\n```';
    const stopSub = (t: Fixture, extra: Record<string, unknown> = {}) =>
      runHook(t.fx.runtime, JSON.stringify({ hook_event_name: 'SubagentStop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, agent_id: 'sub-1', agent_type: 'ambicode:reviewer', last_assistant_message: answer, ...extra }), { pointer: t.fx.pointer, load: async () => ({ engine: t.fx.engine, routes: t.fx.routes, pointer: t.fx.pointer }) });
    const file = (t: Fixture): string => path.join(t.dir, 'reviewer-answer.txt');
    const pendingReview = async (t: Fixture) => {
      await t.start();
      await t.hook('estimate', 'run');
    };

    it('the reviewer subagent\'s final message is written beside the pending review, byte for byte, and the hook answers {}', async () => {
      await withReview(async (t) => {
        await pendingReview(t);
        assert.deepEqual(await stopSub(t), {});
        assert.equal(await readFile(file(t), 'utf8'), answer);
      });
    });

    it('another subagent, a reviewer with no message, and a reviewer with no pending review capture nothing', async () => {
      await withReview(async (t) => {
        await t.start();
        assert.deepEqual(await stopSub(t), {}, 'no pending review yet');
        await t.hook('estimate', 'run');
        await stopSub(t, { agent_type: 'Explore' });
        await stopSub(t, { agent_type: 'reviewer-extra' });
        await stopSub(t, { last_assistant_message: '  ' });
        await assert.rejects(readFile(file(t), 'utf8'), { code: 'ENOENT' });
      });
    });

    it('once the review is recorded a later SubagentStop writes nothing', async () => {
      await withReview(async (t) => {
        await pendingReview(t);
        await t.append({ kind: 'review', reviewId: String((await t.kinds('review'))[0]!['reviewId']), result: path.join('.ambicode', 'reviews', CHECK_TASK, 'result.json'), status: 'partial', stage: 'recorded', reviewerRan: true, findings: 0 });
        await stopSub(t);
        await assert.rejects(readFile(file(t), 'utf8'), { code: 'ENOENT' });
      });
    });
  });

  describe('PostToolUse on Agent records the reviewer answer', () => {
    const answer = '```json\n{"findings":[],"coverageNotes":["read only the diff"]}\n```';
    const agentDone = (t: Fixture, extra: Record<string, unknown> = {}, engine = t.fx.engine) =>
      runHook(t.fx.runtime, JSON.stringify({ hook_event_name: 'PostToolUse', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, tool_name: 'Agent', tool_input: { subagent_type: 'ambicode:reviewer', prompt: 'Review it' }, tool_response: { status: 'completed', content: [{ type: 'text', text: answer }] }, ...extra }), { pointer: t.fx.pointer, load: async () => ({ engine, routes: t.fx.routes, pointer: t.fx.pointer }) }) as Promise<{ hookSpecificOutput?: { hookEventName: string; additionalContext: string } }>;
    const pendingReview = async (t: Fixture) => {
      await t.start();
      await t.hook('estimate', 'run');
    };
    const lastReview = async (t: Fixture) => (await t.kinds('review')).at(-1)!;

    it('a completed reviewer call records the answer, advances to readback and returns the report and the next step as context', async () => {
      await withReview(async (t) => {
        await pendingReview(t);
        const output = await agentDone(t);
        assert.equal(output.hookSpecificOutput?.hookEventName, 'PostToolUse');
        const text = output.hookSpecificOutput!.additionalContext;
        assert.match(text, /1\. WHAT WAS REVIEWED/);
        assert.match(text, /read only the diff/);
        assert.match(text, /\[ambicode\] review · task ord-7 · step readback/);
        assert.equal((await lastReview(t))['stage'], 'recorded');
        assert.equal((await steps(t, 'delivered')).at(-1), 'readback');
      });
    });

    it('the answer SubagentStop captured wins over the text in the tool response', async () => {
      await withReview(async (t) => {
        await pendingReview(t);
        await runHook(t.fx.runtime, JSON.stringify({ hook_event_name: 'SubagentStop', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, agent_id: 'sub-1', agent_type: 'ambicode:reviewer', last_assistant_message: answer }), { pointer: t.fx.pointer, load: async () => ({ engine: t.fx.engine, routes: t.fx.routes, pointer: t.fx.pointer }) });
        const output = await agentDone(t, { tool_response: { status: 'completed', content: [{ type: 'text', text: 'not json at all' }] } });
        assert.match(output.hookSpecificOutput!.additionalContext, /read only the diff/);
        assert.equal((await lastReview(t))['status'] === 'error', false);
      });
    });

    it('another subagent, a background launch and a call with no pending review leave the ledger alone and answer {}', async () => {
      await withReview(async (t) => {
        await t.start();
        assert.deepEqual(await agentDone(t), {}, 'no pending review yet');
        await t.hook('estimate', 'run');
        const before = await t.ledger();
        assert.deepEqual(await agentDone(t, { tool_input: { subagent_type: 'Explore' } }), {});
        assert.deepEqual(await agentDone(t, { tool_input: { subagent_type: 'reviewer-extra' } }), {});
        assert.deepEqual(await agentDone(t, { tool_response: { status: 'async_launched' } }), {});
        assert.deepEqual(await agentDone(t, { agent_id: 'sub-1' }), {});
        assert.deepEqual(await t.ledger(), before);
      });
    });

    it('an answer that is not findings is recorded as a failed review and the context shows why', async () => {
      await withReview(async (t) => {
        await pendingReview(t);
        const output = await agentDone(t, { tool_response: { status: 'completed', content: [{ type: 'text', text: 'looks fine to me' }] } });
        const text = output.hookSpecificOutput!.additionalContext;
        assert.match(text, /No finding list was produced/);
        assert.match(text, /not JSON/);
        const entry = await lastReview(t);
        assert.deepEqual([entry['stage'], entry['status']], ['recorded', 'error']);
      });
    });

    it('an answer that cannot be read names `review record` as the fallback and records nothing', async () => {
      await withReview(async (t) => {
        await pendingReview(t);
        const output = await agentDone(t, { tool_response: { status: 'completed', content: [] } });
        assert.match(output.hookSpecificOutput!.additionalContext, /not recorded automatically.*review record --task ord-7/s);
        assert.equal((await lastReview(t))['stage'], 'pending');
      });
    });

    it('a report.txt write that fails never leaves "not recorded" text beside a recorded entry', async () => {
      await withReview(async (t) => {
        await pendingReview(t);
        const fs = { ...t.fx.runtime.fs, writeText: async (file: string, text: string) => (file.endsWith('report.txt') ? Promise.reject(new Error('disk full')) : t.fx.runtime.fs.writeText(file, text)) };
        const output = await runHook({ ...t.fx.runtime, fs }, JSON.stringify({ hook_event_name: 'PostToolUse', session_id: SESSION_A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, tool_name: 'Agent', tool_input: { subagent_type: 'ambicode:reviewer', prompt: 'Review it' }, tool_response: { status: 'completed', content: [{ type: 'text', text: answer }] } }), { pointer: t.fx.pointer, load: async () => ({ engine: t.fx.engine, routes: t.fx.routes, pointer: t.fx.pointer }) }) as { hookSpecificOutput?: { additionalContext: string } };
        const recorded = (await lastReview(t))['stage'] === 'recorded';
        assert.equal(/not recorded automatically/.test(output.hookSpecificOutput?.additionalContext ?? ''), !recorded);
      });
    });

    it('a report too long for the hook is replaced by a pointer to report.txt and the next step stays whole', async () => {
      await withReview(async (t) => {
        await pendingReview(t);
        const notes = Array.from({ length: 300 }, (_, index) => `note ${index}: ${'x'.repeat(60)}`);
        const output = await agentDone(t, { tool_response: { status: 'completed', content: [{ type: 'text', text: JSON.stringify({ findings: [], coverageNotes: notes }) }] } });
        const text = output.hookSpecificOutput!.additionalContext;
        assert.ok(text.length <= HOOK_LIMIT, `${text.length}`);
        assert.match(text, /Review report: 0 findings; read it whole: .*report\.txt/);
        assert.match(text, /\[ambicode\] review · task ord-7 · step readback/);
      });
    });

    it('a route that fails to advance after the record says the answer is recorded and names route next', async () => {
      await withReview(async (t) => {
        await pendingReview(t);
        const output = await agentDone(t, {}, { ...t.fx.engine, advance: async () => { throw new Error('boom'); } });
        assert.match(output.hookSpecificOutput!.additionalContext, /is recorded.*route next --task ord-7/s);
        assert.equal((await lastReview(t))['stage'], 'recorded');
      });
    });
  });

  it('08-R5: the pin applies the narrowing last used; narrow reprints the gate with the hint', async () => {
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
      assert.equal(run.position, 'review-agent');
      const result = JSON.parse(await readFile(path.join(t.dir, 'result.json'), 'utf8')) as { omissions: string[] };
      assert.match(result.omissions.join('\n'), /narrowed on request: only paths matching "src\/\*\*"/);
      assert.match(result.omissions.join('\n'), /narrowed on request: paths matching "docs\/\*\*"/);
    });
  });

  it('08-R5: the pin takes the route target: a --branch review pins the branch, not the working tree', async () => {
    await withReview(async (t) => {
      await t.start({ target: { branch: true, base: 'HEAD~1', mr: null } });
      assert.equal((await t.hook('estimate', 'run')).position, 'review-agent');
      const result = JSON.parse(await readFile(path.join(t.dir, 'result.json'), 'utf8')) as { target: { kind: string } };
      assert.equal(result.target.kind, 'branch');
    }, { dirty: false });
  });

});

describe('review route: step texts, ceilings and the ignore warning (08-R6, 08-B1, 08-R7)', () => {
  const read = async (name: string): Promise<string> => (await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8')).replaceAll('{cli}', `node "${REPO_ROOT}/scripts/ambicode.mjs"`).replaceAll('{task}', CHECK_TASK);

  it('08-R6/08-B1: each review step text is at most 1,500 characters after inclusion', async () => {
    for (const name of ['review/fetch', 'review/mr-fetch', 'review/readback', 'review/agent', 'review/publish']) assert.ok((await read(name)).length <= 1500, name);
  });

  it('08-R6: readback points an --mr review to references/merge-request.md, which ships beside the review skill', async () => {
    assert.match(await read('review/readback'), /\(`--mr`\), read `references\/merge-request\.md` beside the review skill's SKILL\.md/);
    assert.ok((await readFile(path.join(REPO_ROOT, 'skills', 'review', 'references', 'merge-request.md'), 'utf8')).length > 0);
  });

  it('08-R6: readback asks for a one-line summary, one line per finding and part 3 in a line or two, copies part 4 verbatim in one fence and names references/outcomes.md', async () => {
    const text = await read('review/readback');
    assert.match(text, /One line: what was reviewed/);
    assert.match(text, /Findings, one line each: `path:line`, risk, one sentence/);
    assert.match(text, /Part 3 \(verification\) in one or two lines/);
    assert.match(text, /in one fenced code block/);
    assert.match(text, /Part 4 copied verbatim/);
    assert.match(text, /references\/outcomes\.md/);
    assert.doesNotMatch(text, /route next/);
  });

  it('08-R6: the agent step names the subagent, hands it the brief path and records its JSON unedited with review record', async () => {
    const text = await read('review/agent');
    assert.match(text, /`ambicode:reviewer` subagent/);
    // 2 of 112 traced reviewer launches ran in the background; the headless Stop closed the route and the answer was lost.
    assert.match(text, /`run_in_background: false`/);
    assert.match(text, /Review the change described in <brief path>: it holds the whole diff with the lines a finding may name\. The code is in the checkout\. Answer with the JSON block only\./);
    assert.match(text, /The hook records the subagent's answer when it returns and prints the report and the next step/);
    assert.match(text, /Only if no ambicode text arrives with the subagent's result, run `[^`]*review record --task ord-7` with no input/);
    assert.match(text, /paste the subagent's JSON block, unchanged, on stdin/);
    assert.match(text, /Do not edit, filter/);
    assert.doesNotMatch(text, /route next|view --review/);
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

});

describe('review.pin assembly', () => {
  it('assembles the bundle once: one unmerged-paths probe on the run answer', async () => {
    await withReview(async (t) => {
      const real = t.fx.runtime.runner;
      let probes = 0;
      t.fx.runtime.runner = { run: (request) => (request.argv.includes('--unmerged') && (probes += 1), real.run(request)) };
      await t.start();
      const atEstimate = probes;
      await t.hook('estimate', 'run');
      assert.equal(probes - atEstimate, 1);
    });
  });
});
