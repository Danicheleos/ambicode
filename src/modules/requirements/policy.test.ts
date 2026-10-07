import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { jira, mcp, search, session } from '#testing/fixtures/requirements-session';
import type { Handler } from '#types/harness';

const GET = 'mcp__atlassian__getJiraIssue';
const AMBIGUOUS = 'requirements-server-ambiguous';
const TWICE = 'requirements-not-captured-twice';
const DISCONNECTED = 'requirements-server-disconnected';
const TWO_URLS = ['https://x.atlassian.net/browse/ORD-17', 'https://x.atlassian.net/browse/ORD-18'];

/** A step that fails until the disconnected gate is answered: the registry gate has no trigger of its own (non-goal). */
const DISCONNECTED_ROUTE = `skill: review
version: 3
budget: { modelSteps: 6 }
exits: [done, blocked, human, inconclusive, superseded, budget]
revisable: []
steps:
  - id: connect
    actor: code
    run: [test.connect]
    onError: ask ${DISCONNECTED}
  - id: estimate
    actor: human
    gate: { question: "Go?", options: ["go"], default: "go", release: "go" }
`;
const connect: Handler = async ({ ledger, view }) => {
  const read = await ledger.read();
  const answered = read.state === 'ok' && read.entries.some((entry) => entry.kind === 'default-taken' && entry['gate'] === DISCONNECTED && view.chainIds.includes(String(entry['route'])));
  return answered ? { state: 'ok', payload: null } : { state: 'failed', code: 'server-disconnected', message: 'The server is not connected.', recoverable: true };
};

async function twoServers(skill: string, options: { headless?: boolean } = {}) {
  const s = await session({ skill, server: null, ...options });
  await s.capture('mcp__jira_a__getJiraIssue', mcp(jira('ORD-17')), { server: null });
  await s.capture('mcp__confluence_b__getJiraIssue', mcp(jira('ORD-17', { description: 'Other server body' })), { server: null });
  return s;
}

describe('04-P review policy', () => {
  it('04-P1: server-ambiguous in a headless review exits blocked with no further step; in an investigate it continues with an args envelope', async () => {
    const review = await twoServers('review', { headless: true });
    try {
      await review.next();
      assert.deepEqual(await review.exits(), ['blocked']);
      assert.deepEqual((await review.fx.kinds(review.task, 'default-taken')).map((entry) => [entry['gate'], entry['answer']]), [[AMBIGUOUS, 'stop']]);
      assert.equal((await review.fx.kinds(review.task, 'envelope')).length, 0);
      assert.equal((await review.fx.kinds(review.task, 'step')).some((entry) => entry['step'] === 'estimate' && entry['status'] !== 'skipped'), false);
    } finally {
      await review.fx.dispose();
    }
    const investigate = await twoServers('investigate', { headless: true });
    try {
      await investigate.next();
      assert.deepEqual(await investigate.exits(), ['done'], 'no blocked exit: the route went on to the end');
      assert.equal((await investigate.fx.kinds(investigate.task, 'envelope')).at(-1)!['builtFrom'], 'args');
      assert.deepEqual((await investigate.fx.kinds(investigate.task, 'default-taken')).filter((entry) => entry['gate'] === AMBIGUOUS).map((entry) => entry['answer']), ['continue without']);
    } finally {
      await investigate.fx.dispose();
    }
  });

  it('04-P1: not-captured-twice in a headless review exits blocked; in an investigate it continues with an args envelope', async () => {
    const run = async (skill: string) => {
      const s = await session({ skill, headless: true });
      try {
        await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-not-captured');
        await s.next();
        return { exits: await s.exits(), envelope: (await s.fx.kinds(s.task, 'envelope')).at(-1), taken: (await s.fx.kinds(s.task, 'default-taken')).filter((entry) => entry['gate'] === TWICE).map((entry) => entry['answer']) };
      } finally {
        await s.fx.dispose();
      }
    };
    const review = await run('review');
    assert.deepEqual([review.exits, review.envelope, review.taken], [['blocked'], undefined, ['stop']]);
    const investigate = await run('investigate');
    assert.deepEqual([investigate.exits, investigate.envelope?.['builtFrom'], investigate.taken], [['done'], 'args', ['continue without']]);
  });

  it('04-P1: server-disconnected resolves to stop for a review and to continue without for an investigate', async () => {
    const run = async (skill: string) => {
      const s = await session({ skill, route: DISCONNECTED_ROUTE.replace('skill: review', `skill: ${skill}`), headless: true, handlers: { 'test.connect': connect }, requirements: [], text: 'why' });
      try {
        return { exits: await s.exits(), taken: (await s.fx.kinds(s.task, 'default-taken')).filter((entry) => entry['gate'] === DISCONNECTED).map((entry) => entry['answer']), steps: (await s.fx.kinds(s.task, 'step')).filter((entry) => entry['step'] === 'connect').map((entry) => entry['status']) };
      } finally {
        await s.fx.dispose();
      }
    };
    const review = await run('review');
    assert.deepEqual([review.exits, review.taken], [['blocked'], ['stop']]);
    const investigate = await run('investigate');
    assert.deepEqual([investigate.taken, investigate.steps.includes('completed')], [['continue without'], true]);
  });

  it('04-P2: an interactive review on server-ambiguous prints the server options, and a bound answer naming one continues with its captures', async () => {
    const s = await twoServers('review');
    try {
      const gate = await s.next();
      assert.match(gate.text, /Options:\n {2}- confluence_b\n {2}- jira_a\n {2}- continue without\n {2}- stop \(default if nobody answers\)/);
      const after = await s.next({ answers: [{ gate: AMBIGUOUS, option: 'jira_a' }] });
      assert.equal(after.position, 'estimate');
      const envelope = (await s.fx.kinds(s.task, 'envelope')).at(-1)!;
      assert.deepEqual([envelope['builtFrom'], envelope['server']], ['captures', 'jira_a']);
    } finally {
      await s.fx.dispose();
    }
  });
});

describe('04-S review scenarios on the synthetic review route', () => {
  async function review() {
    return session({ skill: 'review', text: 'review it', requirements: TWO_URLS });
  }
  const ASKED = ['ORD-17', 'ORD-18'];

  it('S7/04-E7: a review with one of two sources captured is refused requirements-missing: no exit, no later step, and stop is offered on the second refusal', async () => {
    const s = await review();
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { asked: ASKED });
      await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-missing' && /ORD-18/.test(error.message) && !/ORD-17,/.test(error.message));
      assert.deepEqual(await s.exits(), []);
      assert.equal((await s.fx.kinds(s.task, 'envelope')).length, 0);
      await assert.rejects(s.next(), (error: Error & { code?: string; details: string[] }) => error.code === 'requirements-missing' && error.details.some((detail) => /route stop --task ORD-17 --reason blocked/.test(detail)));
      assert.deepEqual(await s.exits(), [], 'the refusal is not an exit');
      const positions = (await s.fx.kinds(s.task, 'step')).filter((entry) => entry['status'] === 'completed').map((entry) => entry['step']);
      assert.equal(positions.includes('ground'), false);
    } finally {
      await s.fx.dispose();
    }
  });

  it('S7/04-E8: capturing the second source and running route next completes ground and delivers the next step; route stop is its own exit', async () => {
    const s = await review();
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { asked: ASKED });
      await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-missing');
      await s.capture(GET, mcp(jira('ORD-18')), { asked: ASKED });
      const next = await s.next();
      assert.equal(next.position, 'estimate');
      assert.match(next.text, /Run the review\?/);
      const envelope = (await s.fx.kinds(s.task, 'envelope')).at(-1)!;
      assert.deepEqual([envelope['builtFrom'], envelope['missingAsked']], ['captures', []]);
      assert.deepEqual(await s.exits(), []);
      await s.fx.engine.stop(s.task, 'aaaaaaaa-1111-4111-8111-111111111111', 'blocked', 'user stopped', s.fx.scratchpad);
      assert.deepEqual(await s.exits(), ['blocked']);
    } finally {
      await s.fx.dispose();
    }
  });

  it('S7/04-E2: a list-only hit for the second source, or a payload nothing recognises, still leaves it missing', async () => {
    for (const second of ['list', 'unrecognized']) {
      const s = await review();
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

  it('S8: a bound server whose payloads nothing recognises gives the not-captured refusal, then the gate with stop as default and no later step', async () => {
    const s = await session({ skill: 'review', text: 'review it', requirements: TWO_URLS[0] === undefined ? [] : [TWO_URLS[0]] });
    try {
      assert.equal(await s.capture(GET, mcp('{"unrelated":true}')), null);
      await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-not-captured');
      assert.equal(await s.capture(GET, mcp('not json')), null);
      const gate = await s.next();
      assert.match(gate.text, new RegExp(TWICE));
      assert.match(gate.text, /- stop \(default if nobody answers\)/);
      await s.next({ answers: [{ gate: TWICE, option: 'stop' }] });
      assert.deepEqual(await s.exits(), ['blocked']);
      assert.equal((await s.fx.kinds(s.task, 'envelope')).length, 0);
    } finally {
      await s.fx.dispose();
    }
  });
});
