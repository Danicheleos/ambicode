import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { captureRequirement } from '#modules/requirements/capture/capture';
import { normalizeEnvelope } from '#modules/requirements/envelope/envelope';
import { jira, mcp, search } from '#testing/fixtures/requirements-session';
import { runReview, REVIEW_OPTIONS } from '#cli/commands/review/review';
import { parseArgs } from '#cli/args';
import { createRuntime } from '#composition/root';
import { instantiateGate } from '#harness/gates/gates';
import { TempRepo } from '#testing/fixtures/temp-repo';
import { initConfig } from '#testing/fixtures/init-config';
import { openRouteView } from '#harness/engine/context';
import { defaultHandlers } from '#harness/engine/handlers';
import { withLedgerLock } from '#modules/evidence/ledger/ledger-lock';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { CONFIG, routeFixture, type RouteFixture } from '#testing/fixtures/route-fixture';
import { REPO_ROOT } from '#testing/paths';
import type { RouteArgs } from '#types/harness';
import type { CaptureDeps, EnvelopeInput } from '#types/modules/requirements';
import { SESSION_A } from '#testing/fixtures/ids';

const GET = 'mcp__atlassian__getJiraIssue';
const AMBIGUOUS = 'requirements-server-ambiguous';
const TWICE = 'requirements-not-captured-twice';
const TWO_URLS = ['https://x.atlassian.net/browse/ORD-17', 'https://x.atlassian.net/browse/ORD-18'];
const ASKED = ['ORD-17', 'ORD-18'];
const TASK = 'ORD-17';
const SHIPPED = await readFile(path.join(REPO_ROOT, 'routes', 'review.yaml'), 'utf8');
const STEPS: Record<string, string> = {};
for (const name of ['review-fetch', 'review-readback', 'review-view']) STEPS[`routes/steps/${name}.md`] = await readFile(path.join(REPO_ROOT, 'routes', 'steps', `${name}.md`), 'utf8');

async function shipped(options: { requirements?: string[]; headless?: boolean; server?: string | null } = {}) {
  const server = options.server === undefined ? 'atlassian' : options.server;
  const fx = await routeFixture({
    routes: { review: SHIPPED },
    handlers: defaultHandlers(),
    step: STEPS,
    config: server === null ? CONFIG : CONFIG.replace('mcpServer: null', `mcpServer: ${server}`),
  });
  await fx.repo.write('src/a.ts', 'export const a = 1;\n');
  await fx.repo.commitAll('a');
  await fx.repo.write('src/a.ts', 'export const a = 2;\n');
  await fx.engine.start({
    skill: 'review', text: 'review it', requirements: options.requirements ?? TWO_URLS, task: TASK, cwd: fx.repo.root, session: SESSION_A, channel: 'hook',
    scratchpadDir: fx.scratchpad, ...(options.headless === true ? { headless: true } : {}),
  });
  const dir = await resolveTaskDir(fx.runtime, TASK);
  const args = ((await fx.kinds(TASK, 'route'))[0]!['args']) as RouteArgs;
  const under = <T>(body: (deps: Omit<CaptureDeps, 'mcpServer' | 'asked'> & { fx: RouteFixture }) => Promise<T>): Promise<T> =>
    withLedgerLock(fx.runtime.fs, dir.root, () => new Date(), SESSION_A, async (ledger) => {
      const view = (await openRouteView(fx.runtime, fx.routes, TASK, SESSION_A))!;
      return body({ runtime: fx.runtime, dir, ledger, view, fx });
    });
  const capture = (tool: string, response: unknown, extra: { server?: string | null; asked?: string[]; input?: Record<string, unknown> } = {}) =>
    under((deps) => captureRequirement(
      { hook_event_name: 'PostToolUse', session_id: SESSION_A, tool_name: tool, tool_response: response, ...(extra.input === undefined ? {} : { tool_input: extra.input }) } as never,
      { ...deps, mcpServer: extra.server === undefined ? server : extra.server, asked: extra.asked ?? [TASK] },
    ));
  const normalize = (overrides: Partial<EnvelopeInput> = {}) => under((deps) => normalizeEnvelope({ ...deps, args, mcpServer: server, ...overrides }));
  const next = (input: Partial<Parameters<typeof fx.engine.advance>[0]> = {}) => fx.engine.advance({ task: TASK, session: SESSION_A, cause: 'route-next', scratchpadDir: fx.scratchpad, ...input });
  const exits = async (): Promise<string[]> => (await fx.kinds(TASK, 'exit')).map((entry) => String(entry['reason']));
  return { fx, task: TASK, capture, normalize, next, exits };
}

describe('review route, missing sources (08-Q)', () => {
  it('08-Q2: one of two captured is refused requirements-missing, no exit, no estimate, no reviewer', async () => {
    const s = await shipped();
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { asked: ASKED });
      await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-missing' && /ORD-18/.test(error.message) && !/ORD-17,/.test(error.message));
      assert.deepEqual(await s.exits(), []);
      assert.equal((await s.fx.kinds(s.task, 'envelope')).length, 0);
      assert.equal((await s.fx.kinds(s.task, 'review')).length, 0);
      const completed = (await s.fx.kinds(s.task, 'step')).filter((entry) => entry['status'] === 'completed').map((entry) => entry['step']);
      assert.ok(!completed.includes('ground') && !completed.includes('estimate-step'));
    } finally {
      await s.fx.dispose();
    }
  });

  it('08-Q2: capturing the second source and route next reaches the estimate, with missingAsked empty; route stop is the exit', async () => {
    const s = await shipped();
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { asked: ASKED });
      await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-missing');
      await s.capture(GET, mcp(jira('ORD-18')), { asked: ASKED });
      const next = await s.next();
      assert.equal(next.position, 'estimate');
      const envelope = (await s.fx.kinds(s.task, 'envelope')).at(-1)!;
      assert.deepEqual([envelope['builtFrom'], envelope['missingAsked']], ['captures', []]);
      assert.deepEqual(await s.exits(), []);
      await s.fx.engine.stop(s.task, 'aaaaaaaa-1111-4111-8111-111111111111', 'blocked', 'user stopped', s.fx.scratchpad);
      assert.deepEqual(await s.exits(), ['blocked']);
    } finally {
      await s.fx.dispose();
    }
  });

  it('08-Q2: missingAsked names the requested source that was not captured', async () => {
    const s = await shipped();
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { asked: ASKED });
      await assert.rejects(s.next(), (error: Error & { code?: string; details: string[] }) => error.code === 'requirements-missing' && [error.message, ...error.details].join('\n').includes('ORD-18'));
      const refused = await s.normalize().catch((error: Error & { code?: string }) => error);
      assert.equal((refused as Error & { code?: string }).code, 'requirements-missing');
    } finally {
      await s.fx.dispose();
    }
  });

  it('08-Q2: a list-only hit or an unrecognised payload leaves the second source missing', async () => {
    for (const second of ['list', 'unrecognized']) {
      const s = await shipped();
      try {
        await s.capture(GET, mcp(jira('ORD-17')), { asked: ASKED });
        if (second === 'list') await s.capture('mcp__atlassian__searchJiraIssuesUsingJql', search(['ORD-18']), { asked: ASKED, input: { jql: 'project = ORD' } });
        else assert.equal(await s.capture(GET, mcp('{"unrelated":true}'), { asked: ASKED }), null);
        await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-missing' && /ORD-18/.test(error.message), second);
        assert.deepEqual(await s.exits(), [], second);
      } finally {
        await s.fx.dispose();
      }
    }
  });
});

describe('review route, stop policy (08-Q1)', () => {
  it('08-Q1: headless server-ambiguous exits blocked with no estimate and no reviewer', async () => {
    const s = await shipped({ headless: true, server: null });
    try {
      await s.capture('mcp__jira_a__getJiraIssue', mcp(jira('ORD-17')), { server: null });
      await s.capture('mcp__confluence_b__getJiraIssue', mcp(jira('ORD-17', { description: 'Other body' })), { server: null });
      await s.next();
      assert.deepEqual(await s.exits(), ['blocked']);
      assert.deepEqual((await s.fx.kinds(s.task, 'default-taken')).map((entry) => [entry['gate'], entry['answer']]), [[AMBIGUOUS, 'stop']]);
      assert.equal((await s.fx.kinds(s.task, 'review')).length, 0);
      assert.equal((await s.fx.kinds(s.task, 'step')).some((entry) => entry['step'] === 'estimate-step' && entry['status'] === 'completed'), false);
    } finally {
      await s.fx.dispose();
    }
  });

  it('08-Q1: interactive server-ambiguous offers the connected servers with stop as the default', async () => {
    const s = await shipped({ server: null });
    try {
      await s.capture('mcp__jira_a__getJiraIssue', mcp(jira('ORD-17')), { server: null });
      await s.capture('mcp__confluence_b__getJiraIssue', mcp(jira('ORD-17', { description: 'Other body' })), { server: null });
      const gate = await s.next();
      assert.match(gate.text, /- confluence_b\n {2}- jira_a\n {2}- continue without\n {2}- stop \(default if nobody answers\)/);
    } finally {
      await s.fx.dispose();
    }
  });

  it('08-Q1: not-captured-twice takes stop in a headless review: blocked, no estimate', async () => {
    const s = await shipped({ headless: true, requirements: [TWO_URLS[0]!] });
    try {
      await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-not-captured');
      await s.next();
      assert.deepEqual(await s.exits(), ['blocked']);
      assert.deepEqual((await s.fx.kinds(s.task, 'default-taken')).filter((entry) => entry['gate'] === TWICE).map((entry) => entry['answer']), ['stop']);
      assert.equal((await s.fx.kinds(s.task, 'envelope')).length, 0);
    } finally {
      await s.fx.dispose();
    }
  });

  it('08-Q1: not-captured-twice interactive prints stop as the default and a bound stop exits blocked', async () => {
    const s = await shipped({ requirements: [TWO_URLS[0]!] });
    try {
      await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-not-captured');
      const gate = await s.next();
      assert.match(gate.text, new RegExp(TWICE));
      assert.match(gate.text, /- stop \(default if nobody answers\)/);
      await s.next({ answers: [{ gate: TWICE, option: 'stop' }] });
      assert.deepEqual(await s.exits(), ['blocked']);
    } finally {
      await s.fx.dispose();
    }
  });
});

describe('review route, stop policy by registry (08-Q1)', () => {
  it('08-Q1: the three requirement gates take stop as default and release on a review, and keep their own defaults elsewhere', async () => {
    const fx = await routeFixture({ routes: { review: SHIPPED }, step: STEPS });
    try {
      for (const id of ['requirements-server-disconnected', AMBIGUOUS, TWICE]) {
        const gate = fx.routes.gate(id)!;
        const onReview = instantiateGate(gate, { skill: 'review', values: { servers: ['jira_a'] } });
        assert.deepEqual([onReview.default, onReview.release, onReview.options.includes('stop')], ['stop', 'stop', true], id);
        const elsewhere = instantiateGate(gate, { skill: 'investigate', values: { servers: ['jira_a'] } });
        assert.notEqual(elsewhere.default, 'stop', id);
      }
    } finally {
      await fx.dispose();
    }
  });
});

describe('standalone review --requirement (08-Q3)', () => {
  it('08-Q3: an unretrieved requirement is refused with no reviewer and no review directory, never a quality review', async () => {
    const repo = await TempRepo.create();
    try {
      await repo.write('package.json', '{"name":"app"}\n');
      await repo.write('src/a.ts', 'export const a = 1;\n');
      await repo.commitAll('base');
      await initConfig(await createRuntime({ cwd: repo.root }));
      await repo.write('src/a.ts', 'export const a = 2;\n');
      const runtime = await createRuntime({ cwd: repo.root });
      let invoked = 0;
      const reviewer = { async invoke() { invoked += 1; return { kind: 'ok', output: { findings: [], coverageNotes: [] }, rawLength: 2, argv: ['claude'] } as never; } };
      await assert.rejects(
        runReview(runtime, parseArgs('review', ['--requirement', TWO_URLS[0]!], REVIEW_OPTIONS), { reviewer: reviewer as never }),
        (error: Error & { code?: string }) => /^requirements-/.test(error.code ?? ''),
      );
      assert.equal(invoked, 0);
      assert.equal(await runtime.fs.exists(path.join(repo.root, '.ambicode', 'reviews')), false);
    } finally {
      await repo.dispose();
    }
  });
});

describe('the route envelope is the review evidence (08-PLAN-2)', () => {
  it('08-PLAN-2: with both sources captured and run answered, review --task is requirement-based on the captured sources, with no --evidence flag', async () => {
    const s = await shipped();
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { asked: ASKED });
      await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-missing');
      await s.capture(GET, mcp(jira('ORD-18')), { asked: ASKED });
      assert.equal((await s.next()).position, 'estimate');
      const print = (await s.fx.kinds(s.task, 'gate')).findLast((entry) => entry['gate'] === 'estimate')!;
      const run = await s.next({ cause: 'gate-hook', answers: [{ gate: 'estimate', option: 'run', instance: print.id }] });
      assert.doesNotMatch(run.text, /--evidence/);
      let prompt = '';
      const reviewer = { async invoke(request: { prompt: string }) { prompt = request.prompt; return { kind: 'ok', output: { findings: [], coverageNotes: [] }, rawLength: 2, argv: ['claude'] } as never; } };
      const output = await runReview(s.fx.runtime, parseArgs('review', ['--task', s.task], REVIEW_OPTIONS), { reviewer: reviewer as never, warm: async () => {} });
      assert.equal(output.result.requirementMode, 'requirement-based');
      assert.deepEqual(output.result.requirements.map((source) => source.id), ['ORD-17', 'ORD-18']);
      assert.match(prompt, /ORD-18/);
    } finally {
      await s.fx.dispose();
    }
  });

  it('08-PLAN-2: a route without captured requirements still runs a quality review', async () => {
    const s = await shipped({ requirements: [] });
    try {
      const print = (await s.fx.kinds(s.task, 'gate')).findLast((entry) => entry['gate'] === 'estimate')!;
      await s.next({ cause: 'gate-hook', answers: [{ gate: 'estimate', option: 'run', instance: print.id }] });
      const reviewer = { async invoke() { return { kind: 'ok', output: { findings: [], coverageNotes: [] }, rawLength: 2, argv: ['claude'] } as never; } };
      const output = await runReview(s.fx.runtime, parseArgs('review', ['--task', s.task], REVIEW_OPTIONS), { reviewer: reviewer as never, warm: async () => {} });
      assert.equal(output.result.requirementMode, 'quality-review');
    } finally {
      await s.fx.dispose();
    }
  });
});
