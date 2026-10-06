import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { hitCount } from './expansion.ts';
import { jira, mcp, search, session } from '#testing/fixtures/requirements-session';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

/**
 * The fixtures mirror the key paths of the two recorded shapes and carry no recorded value:
 * get: content[].text(json).data.{appliedContentFormat,id,key,fields.*}; search: content[].text(json).data.{isLast,issues[].{id,key,fields.*}}.
 * A fixture file as a tool response: its `text` object becomes the JSON string a server sends. */
async function fixture(name: string): Promise<{ content: { type: string; text: string }[] }> {
  const raw = JSON.parse(await readFile(path.join(FIXTURES, name), 'utf8')) as { content: { type: string; text: unknown }[] };
  return { content: raw.content.map((part) => ({ type: part.type, text: JSON.stringify(part.text) })) };
}

const readJson = async (file: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;

describe('04-C capture', () => {
  it('04-C1: the tool prefix classifies it; another prefix or a payload of neither shape writes nothing', async () => {
    const s = await session();
    try {
      const response = mcp(jira('ORD-17'));
      assert.equal(await s.capture('mcp__atlassian__createJiraIssue', response), null);
      assert.equal(await s.capture('mcp__atlassian__getJiraIssue', mcp('{"unrelated":true}')), null);
      assert.equal(await s.capture('mcp__atlassian__searchJiraIssuesUsingJql', mcp('{"unrelated":true}')), null);
      assert.equal((await s.fx.kinds(s.task, 'requirement')).length, 0);
      assert.equal((await s.capture('mcp__atlassian__GETJIRAISSUE', response))?.['capture'], 'full', 'the prefix is read case-insensitively');
      assert.equal((await s.capture('mcp__atlassian__fetch', mcp(JSON.stringify({ id: '9', title: 'T', body: { storage: { value: '<p>x</p>' } } })), { asked: ['page-9'] }))?.['capture'], 'full');
      assert.equal((await s.capture('mcp__atlassian__searchJiraIssuesUsingJql', search(['ORD-18'])))?.['capture'], 'list');
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-C2: get keeps the text fields without the NOT_THE_TICKET fields; fetch keeps the page body', async () => {
    const s = await session();
    try {
      const entry = await s.capture('mcp__atlassian__getJiraIssue', await fixture('p8-get-issue.json'));
      assert.deepEqual([entry?.['key'], entry?.['relation'], entry?.['capture']], ['ORD-17', 'asked', 'full']);
      const file = await readJson(path.join(s.dir.requirements, 'ORD-17.json'));
      assert.match(String(file['content']), /Adding the 51st item is refused/);
      assert.doesNotMatch(String(file['content']), /NOT_THE_TICKET/);
      const page = await s.capture('mcp__atlassian__fetch', mcp(JSON.stringify({ id: '77', title: 'Design', body: { storage: { value: '<p>The <b>design</b></p>' } } })), { asked: ['page-77'] });
      assert.equal(page?.['key'], 'page-77');
      assert.match(String((await readJson(path.join(s.dir.requirements, 'page-77.json')))['content']), /The design/);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-C3: a 53 KB search of 20 hits is stored as key and summary, in at most 2,048 bytes', async () => {
    const s = await session();
    try {
      const issues = Array.from({ length: 20 }, (_, index) => ({ key: `ORD-${100 + index}`, fields: { summary: `Child ${index}`, description: 'x'.repeat(2400), comment: { comments: [{ body: 'y'.repeat(200) }] } } }));
      const response = mcp(JSON.stringify({ total: 20, issues }));
      assert.ok(Buffer.byteLength(JSON.stringify(response)) > 53_000);
      const entry = await s.capture('mcp__atlassian__searchJiraIssuesUsingJql', response, { input: { jql: 'parent = ORD-17', fields: 'key,summary' } });
      assert.deepEqual([entry?.['capture'], entry?.['relation'], entry?.['hits'], entry?.['derivedFrom'], entry?.['key']], ['list', 'list', 20, 'ORD-17', 'ORD-17']);
      const file = path.join(s.dir.requirements, `search-${String(entry?.['rawHash']).replace('sha256:', '').slice(0, 12)}.json`);
      assert.ok(Buffer.byteLength(await readFile(file, 'utf8')) <= 2048);
      const stored = await readJson(file);
      assert.deepEqual(Object.keys(stored).sort(), ['hits', 'query', 'rawHash', 'retrievedAt', 'retrievedVia', 'total']);
      assert.deepEqual((stored['hits'] as { key: string; summary: string }[])[3], { key: 'ORD-103', summary: 'Child 3' });
      assert.equal(stored['query'], 'parent = ORD-17');
      assert.equal((await readdir(s.dir.requirements)).length, 1);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-C3: a search with another query is a list with no parent; hitCount takes the larger of the hits and the payload total', async () => {
    const s = await session();
    try {
      const entry = await s.capture('mcp__atlassian__searchJiraIssuesUsingJql', search(['ORD-18', 'ORD-19'], 40), { input: { jql: 'project = ORD' } });
      assert.deepEqual([entry?.['key'], entry?.['derivedFrom'], entry?.['hits']], ['SEARCH', null, 40]);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-C4: relation and derivedFrom for asked, child, parent, link and unrelated keys', async () => {
    const s = await session();
    try {
      const asked = await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-17', { parent: { key: 'ORD-1' }, issuelinks: [{ outwardIssue: { key: 'ORD-9' } }] })));
      await s.capture('mcp__atlassian__searchJiraIssuesUsingJql', search(['ORD-30']), { input: { jql: 'parent = ORD-17' } });
      const child = await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-30')));
      const parent = await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-1')));
      const link = await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-9')));
      const other = await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-77')));
      const row = (entry: typeof asked) => [entry?.['relation'], entry?.['derivedFrom']];
      assert.deepEqual([asked, child, parent, link, other].map(row), [['asked', null], ['child', 'ORD-17'], ['parent', 'ORD-17'], ['link', 'ORD-17'], ['link', null]]);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-C5: both P8 shapes are recognised from fixtures that mirror the recorded key paths', async () => {
    const s = await session();
    try {
      const got = await s.capture('mcp__plugin_atlassian_atlassian__getJiraIssue', await fixture('p8-get-issue.json'), { server: 'plugin_atlassian_atlassian' });
      assert.deepEqual([got?.['key'], got?.['capture']], ['ORD-17', 'full']);
      const list = await s.capture('mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql', await fixture('p8-search.json'), { server: 'plugin_atlassian_atlassian', input: { jql: 'parent = ORD-17' } });
      assert.deepEqual([list?.['capture'], list?.['hits']], ['list', 2]);
      const stored = await readJson(path.join(s.dir.requirements, `search-${String(list?.['rawHash']).replace('sha256:', '').slice(0, 12)}.json`));
      assert.deepEqual(stored['hits'], [{ key: 'ORD-18', summary: 'Child A' }, { key: 'ORD-19', summary: 'Child B' }]);
      assert.equal(hitCount({ query: '', total: 0, hits: [{ key: 'A', summary: '' }], retrievedVia: 'x', retrievedAt: 'x', rawHash: 'x' }), 1);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-C6: the hook writes captures only: no map, no step, no envelope', async () => {
    const s = await session();
    try {
      const before = (await s.fx.ledger(s.task)).map((entry) => entry.id);
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-17')));
      await s.capture('mcp__atlassian__searchJiraIssuesUsingJql', search(['ORD-18']));
      const added = (await s.fx.ledger(s.task)).filter((entry) => !before.includes(entry.id)).map((entry) => entry.kind);
      assert.deepEqual(added, ['requirement', 'requirement']);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-B3: the same response from two servers keeps both origins, so ground raises the ambiguity', async () => {
    const s = await session({ server: null });
    try {
      const response = mcp(jira('ORD-17'));
      await s.capture('mcp__jira_a__getJiraIssue', response);
      await s.capture('mcp__jira_b__getJiraIssue', response);
      const result = await s.normalize();
      assert.deepEqual([result.state, result.state === 'raise' ? result.gate : null], ['raise', 'requirements-server-ambiguous']);
    } finally {
      await s.fx.dispose();
    }
  });
});
