import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEnvelope } from './envelope.ts';
import { jira, mcp, search, session } from '#testing/fixtures/requirements-session';

const TWO = { skill: 'investigate', text: 'ORD-17 x https://x.atlassian.net/browse/ORD-18', requirements: [] as string[] };
const GET = 'mcp__atlassian__getJiraIssue';
const LIST = 'mcp__atlassian__searchJiraIssuesUsingJql';

describe('04-E envelope and coverage', () => {
  it('04-E1: missingAsked is computed before the branch, in the captures and the args case alike', async () => {
    const s = await session(TWO);
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { asked: ['ORD-17', 'ORD-18'] });
      const partial = await s.normalize();
      assert.deepEqual(partial.state === 'ok' ? [partial.builtFrom, partial.missingAsked] : null, ['captures', ['ORD-18']]);
      assert.deepEqual((await s.fx.kinds(s.task, 'envelope')).at(-1)!['missingAsked'], ['ORD-18']);
    } finally {
      await s.fx.dispose();
    }
    const none = await session({ ...TWO, requirements: ['https://x.atlassian.net/browse/ORD-18'] });
    try {
      await none.under(async ({ ledger, fx }) => void (await ledger.append({ kind: 'acceptance', route: (await fx.kinds(none.task, 'route'))[0]!.id, gate: 'requirements-not-captured-twice', instance: 'x', answer: 'continue without', via: 'hook' })));
      const args = await none.normalize();
      assert.deepEqual(args.state === 'ok' ? [args.builtFrom, args.missingAsked] : null, ['args', ['ORD-18', 'ORD-17']]);
    } finally {
      await none.fx.dispose();
    }
  });

  it('04-E1: binding is settled before expansion and coverage: an ambiguous pair raises the server gate even with a wide list recorded', async () => {
    const s = await session({ server: null });
    try {
      await s.capture('mcp__jira_a__getJiraIssue', mcp(jira('ORD-17')), { server: null });
      await s.capture('mcp__jira_a__searchJiraIssuesUsingJql', search(Array.from({ length: 12 }, (_, index) => `ORD-${101 + index}`)), { server: null, input: { jql: 'parent = ORD-17' } });
      await s.capture('mcp__confluence_b__getJiraIssue', mcp(jira('ORD-17', { description: 'Other server body' })), { server: null });
      const result = await s.normalize({ mcpServer: null });
      assert.equal(result.state === 'raise' ? result.gate : null, 'requirements-server-ambiguous');
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-E2: a list-only hit for an asked key and an unrecognized payload do not cover it', async () => {
    const s = await session(TWO);
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { asked: ['ORD-17', 'ORD-18'] });
      await s.capture(LIST, search(['ORD-18']), { asked: ['ORD-17', 'ORD-18'], input: { jql: 'project = ORD' } });
      assert.equal(await s.capture(GET, mcp('{"unrelated":1}'), { asked: ['ORD-17', 'ORD-18'] }), null);
      const result = await s.normalize();
      assert.deepEqual(result.state === 'ok' ? result.missingAsked : null, ['ORD-18']);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-E3: a capture with no chain to an asked key is dropped with the orphan notice, not a gate', async () => {
    const s = await session({ skill: 'investigate' });
    try {
      await s.capture(GET, mcp(jira('ORD-17')));
      await s.capture(GET, mcp(jira('ORD-77', { parent: { key: 'ORD-76' } })));
      await s.capture(GET, mcp(jira('ORD-30', { parent: { key: 'ORD-17' } })));
      const result = await s.normalize();
      assert.equal(result.state, 'ok');
      if (result.state !== 'ok') return;
      assert.deepEqual(result.sources.map((source) => source.key).sort(), ['ORD-17', 'ORD-30']);
      assert.deepEqual(result.notices.filter((notice) => notice.startsWith('requirements-derived-orphan')), ['requirements-derived-orphan: ORD-77 is not linked to an asked requirement and was dropped.']);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-E4: with no capture and nothing to fetch the envelope is one ARGS source and writes nothing under requirements/', async () => {
    const s = await session({ skill: 'investigate', text: 'why is the cart slow', requirements: [] });
    try {
      const result = await s.normalize();
      assert.equal(result.state, 'ok');
      if (result.state !== 'ok') return;
      assert.deepEqual([result.builtFrom, result.sources.map((source) => [source.key, source.title])], ['args', [['ARGS', 'why is the cart slow']]]);
      assert.deepEqual(await s.fx.runtime.fs.readdir(s.dir.requirements).catch(() => []), []);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-E5: nothing captured is refused once, then a gate; "continue without" builds the args envelope and "stop" exits blocked', async () => {
    const run = async (answer: string) => {
      const s = await session({ skill: 'investigate' });
      try {
        await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-not-captured' && /Fetch ORD-17/.test(error.message));
        const gate = await s.next();
        assert.match(gate.text, /requirements-not-captured-twice/);
        assert.match(gate.text, /- continue without \(default if nobody answers\)\n {2}- stop/);
        const after = await s.next({ answers: [{ gate: 'requirements-not-captured-twice', option: answer }] });
        return { after, envelope: (await s.fx.kinds(s.task, 'envelope')).at(-1), exits: await s.exits() };
      } finally {
        await s.fx.dispose();
      }
    };
    const cont = await run('continue without');
    assert.deepEqual([cont.envelope?.['builtFrom'], cont.after.position], ['args', 'estimate']);
    const stop = await run('stop');
    assert.deepEqual([stop.envelope, stop.exits], [undefined, ['blocked']]);
  });

  it('04-E6: a partial capture is a notice for investigate, plan and task, and the envelope keeps missingAsked', async () => {
    for (const skill of ['investigate', 'plan', 'task']) {
      const s = await session(TWO);
      try {
        await s.capture(GET, mcp(jira('ORD-17')), { asked: ['ORD-17', 'ORD-18'] });
        const result = await s.under((deps) => normalizeEnvelope({ ...deps, view: { ...deps.view, skill }, args: s.args, mcpServer: 'atlassian' }));
        assert.equal(result.state, 'ok', skill);
        if (result.state !== 'ok') continue;
        assert.deepEqual([result.notices.filter((notice) => notice.startsWith('requirements-partial: ORD-18')).length, result.missingAsked], [1, ['ORD-18']], skill);
      } finally {
        await s.fx.dispose();
      }
    }
  });
});
