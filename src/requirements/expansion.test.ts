import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hitCount } from './expansion.ts';
import path from 'node:path';
import { loadPayload } from '../route/delivery.ts';
import { jira, mcp, search, session } from './session-fixture.ts';

const GATE = 'requirements-expansion-capped';
const CHILDREN = Array.from({ length: 12 }, (_, index) => `ORD-${101 + index}`);
const JQL = { jql: 'parent = ORD-17', fields: 'key,summary' };

async function wideEpic(options: { headless?: boolean } = {}) {
  const s = await session({ skill: 'investigate', ...options });
  await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-17', { issuetype: { name: 'Epic' } })));
  await s.capture('mcp__atlassian__searchJiraIssuesUsingJql', search(CHILDREN), { input: JQL });
  return s;
}

const fetchLines = (error: unknown): string[] => String((error as Error).message).split('\n').filter((line) => /^(mcp__\w+__)?getJiraIssue /.test(line));

/** What ground's normalize handed the route's payload: the notices and the sources. */
async function envelopePayload(s: Awaited<ReturnType<typeof wideEpic>>): Promise<string> {
  const chain = (await s.fx.kinds(s.task, 'route'))[0]!.id;
  return (await loadPayload(s.fx.runtime.fs, { steps: path.join(s.dir.root, 'steps') } as never, chain, 'envelope')) ?? '';
}

describe('04-X expansion gate', () => {
  it('04-X1: hitCount is the larger of the stored hits and the payload total', () => {
    const list = { query: '', total: 0, hits: [{ key: 'A-1', summary: '' }, { key: 'A-2', summary: '' }], retrievedVia: 'x', retrievedAt: 'x', rawHash: 'x' };
    assert.equal(hitCount(list), 2);
    assert.equal(hitCount({ ...list, total: 31 }), 31);
  });

  it('04-X2: 12 hits raise the gate at the first advance, before normalize and before any child capture', async () => {
    const s = await wideEpic();
    try {
      const message = await s.next();
      assert.match(message.text, /requirements-expansion-capped/);
      assert.match(message.text, /read all/);
      assert.match(message.text, new RegExp(`read these: ${CHILDREN.join(', ')}`));
      assert.equal((await s.fx.kinds(s.task, 'envelope')).length, 0);
      assert.deepEqual((await s.fx.kinds(s.task, 'requirement')).filter((entry) => entry['derivedFrom'] === 'ORD-17' && entry['capture'] === 'full'), []);
      assert.equal((await s.fx.kinds(s.task, 'gate')).filter((entry) => entry['gate'] === GATE).length, 1);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-X2: ten hits or fewer raise nothing', async () => {
    const s = await session({ skill: 'investigate' });
    try {
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-17')));
      await s.capture('mcp__atlassian__searchJiraIssuesUsingJql', search(CHILDREN.slice(0, 10)), { input: JQL });
      const message = await s.next();
      assert.doesNotMatch(message.text, /requirements-expansion-capped/);
      assert.equal((await s.fx.kinds(s.task, 'envelope')).length, 1);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-X3/04-X4: "read these: A,B" makes ground refuse once with exactly those two fetches, and the next advance completes it', async () => {
    const s = await wideEpic();
    try {
      await s.next();
      let failure: unknown;
      await s.next({ answers: [{ gate: GATE, option: 'read these: ORD-103,ORD-105,ORD-999' }] }).catch((error: unknown) => void (failure = error));
      assert.deepEqual(fetchLines(failure), [
        'mcp__atlassian__getJiraIssue ORD-103 fields=summary,description,issuetype,parent,issuelinks',
        'mcp__atlassian__getJiraIssue ORD-105 fields=summary,description,issuetype,parent,issuelinks',
      ]);
      assert.equal((failure as { code: string }).code, 'requirements-expansion-fetch');
      assert.equal((await s.fx.kinds(s.task, 'envelope')).length, 0, 'ground did not complete');
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-103')));
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-105')));
      const done = await s.next();
      assert.equal(done.position, 'estimate');
      const envelope = (await s.fx.kinds(s.task, 'envelope')).at(-1)!;
      assert.deepEqual((envelope['sources'] as { key: string }[]).map((source) => source.key).sort(), ['ORD-103', 'ORD-105', 'ORD-17']);
      assert.deepEqual(envelope['missingAsked'], []);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-X3: keys that are not hits are dropped with a notice; an empty list is none', async () => {
    const s = await wideEpic();
    try {
      await s.next();
      let failure: unknown;
      await s.next({ answers: [{ gate: GATE, option: 'read these: ORD-103, ORD-999' }] }).catch((error: unknown) => void (failure = error));
      assert.equal(fetchLines(failure).length, 1);
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-103')));
      const done = await s.next();
      assert.equal(done.position, 'estimate');
      assert.match(await envelopePayload(s), /requirements-expansion-dropped: ORD-999 are not hits of ORD-17/);
    } finally {
      await s.fx.dispose();
    }
    const none = await wideEpic();
    try {
      await none.next();
      const done = await none.next({ answers: [{ gate: GATE, option: 'read these: ,' }] });
      assert.equal(done.position, 'estimate');
      assert.deepEqual((await none.fx.kinds(none.task, 'envelope')).at(-1)!['missingAsked'], []);
    } finally {
      await none.fx.dispose();
    }
  });

  it('04-X4: "read all" asks for every stored hit, once per answer; a chosen key still missing afterwards is named in a notice', async () => {
    const s = await wideEpic();
    try {
      await s.next();
      let failure: unknown;
      await s.next({ answers: [{ gate: GATE, option: 'read all' }] }).catch((error: unknown) => void (failure = error));
      assert.equal(fetchLines(failure).length, 12);
      for (const key of CHILDREN.slice(0, 11)) await s.capture('mcp__atlassian__getJiraIssue', mcp(jira(key)));
      const done = await s.next();
      assert.equal(done.position, 'estimate');
      assert.match(await envelopePayload(s), /requirements-expansion-partial: ORD-112 chosen under ORD-17 but not captured/);
    } finally {
      await s.fx.dispose();
    }
  });

  it('04-X3/04-X5: none, and the headless default, leave the hits list-only: neither sources nor missing', async () => {
    const interactive = await wideEpic();
    try {
      await interactive.next();
      const done = await interactive.next({ answers: [{ gate: GATE, option: 'none' }] });
      assert.equal(done.position, 'estimate');
      const envelope = (await interactive.fx.kinds(interactive.task, 'envelope')).at(-1)!;
      assert.deepEqual([(envelope['sources'] as { key: string }[]).map((source) => source.key), envelope['missingAsked']], [['ORD-17'], []]);
    } finally {
      await interactive.fx.dispose();
    }
    const headless = await wideEpic({ headless: true });
    try {
      await headless.next();
      const envelope = (await headless.fx.kinds(headless.task, 'envelope')).at(-1)!;
      assert.deepEqual([(envelope['sources'] as { key: string }[]).map((source) => source.key), envelope['missingAsked']], [['ORD-17'], []]);
      assert.deepEqual((await headless.fx.kinds(headless.task, 'default-taken')).filter((entry) => entry['gate'] === GATE).map((entry) => entry['answer']), ['none']);
    } finally {
      await headless.fx.dispose();
    }
  });
});
