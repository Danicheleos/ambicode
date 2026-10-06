import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bindServer, capturedServers, capturesFrom, observedTools, serverOf } from './binding.ts';
import { jira, mcp, session } from '#testing/fixtures/requirements-session';

describe('04-B binding', () => {
  it('04-B1: serverOf is the segment between mcp__ and the next __', () => {
    const table: [string, string | null][] = [
      ['mcp__atlassian__getJiraIssue', 'atlassian'],
      ['mcp__claude_ai_Atlassian_Rovo__getJiraIssue', 'claude_ai_Atlassian_Rovo'],
      ['getJiraIssue', null],
      ['mcp__nodelimiter', null],
    ];
    for (const [tool, server] of table) assert.equal(serverOf(tool), server, tool);
  });

  it('04-B2: a configured server captures from itself or a token of its name; none configured captures from a candidate token', () => {
    const table: [string | null, string, boolean][] = [
      ['atlassian', 'atlassian', true],
      ['atlassian', 'claude_ai_Atlassian_Rovo', true],
      ['Atlassian', 'my-atlassian.server', true],
      ['atlassian', 'atlassianish', false],
      ['atlassian', 'linear', false],
      [null, 'claude_ai_Atlassian_Rovo', true],
      [null, 'jira-cloud', true],
      [null, 'linear', false],
    ];
    for (const [configured, server, expected] of table) assert.equal(capturesFrom(configured, server), expected, `${configured} ${server}`);
  });

  it('04-B3: exact, token, only-candidate, ambiguous and none', () => {
    assert.deepEqual(bindServer('atlassian', ['atlassian', 'acme_atlassian']), { state: 'bound', server: 'atlassian', how: 'exact' });
    assert.deepEqual(bindServer('atlassian', ['claude_ai_Atlassian_Rovo']), { state: 'bound', server: 'claude_ai_Atlassian_Rovo', how: 'token' });
    assert.deepEqual(bindServer(null, ['claude_ai_Atlassian_Rovo', 'claude_ai_Atlassian_Rovo']), { state: 'bound', server: 'claude_ai_Atlassian_Rovo', how: 'only-candidate' });
    assert.deepEqual(bindServer('atlassian', ['x_atlassian', 'acme_atlassian']), { state: 'ambiguous', servers: ['acme_atlassian', 'x_atlassian'] });
    assert.deepEqual(bindServer(null, ['jira-a', 'confluence-b']), { state: 'ambiguous', servers: ['confluence-b', 'jira-a'] });
    assert.deepEqual(bindServer('atlassian', []), { state: 'none' });
    assert.deepEqual(bindServer('atlassian', ['linear']), { state: 'none' });
  });

  it('04-B3: captured servers and observed tools come from the requirement entries only', () => {
    const entries = [
      { kind: 'requirement', via: 'mcp__a__getJiraIssue' },
      { kind: 'requirement', via: 'mcp__b__searchJiraIssuesUsingJql' },
      { kind: 'requirement', via: 'mcp__a__getJiraIssue' },
      { kind: 'map', via: 'mcp__c__x' },
    ];
    assert.deepEqual(capturedServers(entries), ['a', 'b']);
    assert.deepEqual(observedTools(entries), ['mcp__a__getJiraIssue', 'mcp__b__searchJiraIssuesUsingJql']);
  });

  it('04-B4: two captured candidates raise the ambiguous gate before coverage; a server answer uses only that server, continue without builds the args envelope', async () => {
    const ask = async (answer: string) => {
      const s = await session({ server: null });
      try {
        await s.capture('mcp__jira_a__getJiraIssue', mcp(jira('ORD-17')), { server: null });
        await s.capture('mcp__confluence_b__getJiraIssue', mcp(jira('ORD-17', { description: 'Other server body' })), { server: null });
        const first = await s.normalize({ mcpServer: null });
        assert.deepEqual(first.state === 'raise' ? [first.gate, first.values] : null, ['requirements-server-ambiguous', { servers: ['confluence_b', 'jira_a'] }]);
        assert.equal((await s.fx.kinds('ORD-17', 'envelope')).length, 0, 'raised before coverage');
        await s.under(async ({ ledger, fx }) => void (await ledger.append({ kind: 'acceptance', route: (await fx.kinds('ORD-17', 'route'))[0]!.id, gate: 'requirements-server-ambiguous', instance: 'x', answer, via: 'hook' })));
        return await s.normalize({ mcpServer: null });
      } finally {
        await s.fx.dispose();
      }
    };
    const chosen = await ask('jira_a');
    assert.equal(chosen.state === 'ok' ? chosen.builtFrom : null, 'captures');
    assert.match(chosen.state === 'ok' ? chosen.sources[0]!.content : '', /Body of ORD-17/);
    const without = await ask('continue without');
    assert.equal(without.state === 'ok' ? without.builtFrom : null, 'args');
    assert.ok(without.state === 'ok' && without.notices.some((notice) => notice.startsWith('requirements-server-ambiguous')));
  });

  it('04-B5: a single candidate with nothing pinned is bound and the pin notice comes once per chain', async () => {
    const s = await session({ server: null });
    try {
      await s.capture('mcp__claude_ai_Atlassian_Rovo__getJiraIssue', mcp(jira('ORD-17')), { server: null });
      const first = await s.normalize({ mcpServer: null });
      assert.ok(first.state === 'ok' && first.notices.some((notice) => notice.includes('requirements.mcpServer: claude_ai_Atlassian_Rovo')));
      const second = await s.normalize({ mcpServer: null });
      assert.ok(second.state === 'ok' && !second.notices.some((notice) => notice.startsWith('requirements-server-unpinned')));
      assert.equal((await s.fx.kinds('ORD-17', 'envelope')).at(-1)!['server'], 'claude_ai_Atlassian_Rovo');
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-B2: a non-matching server is ignored and nothing is written; 04-B6: no route active means no ledger work', async () => {
    const s = await session();
    try {
      assert.equal(await s.capture('mcp__linear__getJiraIssue', mcp(jira('ORD-17'))), null);
      assert.equal((await s.fx.kinds('ORD-17', 'requirement')).length, 0);
    } finally {
      await s.fx.dispose();
    }
  });
});
