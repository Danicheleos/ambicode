import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { jira, mcp, session } from '#testing/fixtures/requirements-session';
import { renderRequirement, renderRequirements, requirementGapsOf } from './envelope/render.ts';
import { requirementSources } from '#modules/review/bundle/requirements';
import { loadPayload } from '#harness/engine/execute';

const GET = 'mcp__atlassian__getJiraIssue';
const TICKET = 'https://x.atlassian.net/browse/ORD-17';
const adf = (...paragraphs: string[]) => ({ type: 'doc', content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) });

describe('renderRequirement keeps every field with text', () => {
  it('a Jira issue: summary, rich-text description, acceptance criteria in a custom field, labels; API links are dropped', () => {
    const text = renderRequirement(JSON.stringify({
      key: 'ORD-17', self: 'https://x.atlassian.net/rest/api/3/issue/1',
      fields: { summary: 'Cart total', description: adf('Total is the sum.', 'Empty cart is zero.'), customfield_10200: adf('AC1: rounds to cents'), labels: ['cart', 'money'], storyPoints: 5, assignee: { displayName: 'Ann', avatarUrls: { '48x48': 'https://x/a.png' } } },
    }));
    for (const part of ['Cart total', 'Total is the sum.', 'Empty cart is zero.', 'AC1: rounds to cents', 'cart', 'money', 'storyPoints: 5', 'Ann']) assert.ok(text.includes(part), `${part} missing from:\n${text}`);
    assert.doesNotMatch(text, /rest\/api|a\.png/);
  });

  it('a Confluence page keeps its storage body as text with line and cell breaks; prose that is not JSON stays as captured', () => {
    const text = renderRequirement(JSON.stringify({ title: 'Orders', body: { storage: { value: '<h1>Rules</h1><p>Orders &amp; refunds</p><table><tr><td>VAT</td><td>20%</td></tr></table>' } } }));
    assert.match(text, /Orders\n/);
    assert.match(text, /Rules\nOrders & refunds\nVAT \| 20% \|/);
    assert.equal(renderRequirement('plain <b>prose</b>'), 'plain <b>prose</b>');
  });

  it('names what was not captured first', () => {
    const text = renderRequirements([{ key: 'ORD-17', url: '', content: 'abc' }], ['ORD-9']);
    assert.match(text, /^Not captured: ORD-9; list it under Not verified\.\n\n## ORD-17\nabc/);
  });
});

describe('a large ticket reaches the model whole', () => {
  it('the investigate read step points at the rendered text and the task folder holds all of it; nothing is cut or re-fetched', async () => {
    const s = await session({ skill: 'investigate', shipped: true, requirements: [TICKET], text: 'ORD-17 which files?' });
    try {
      const marker = 'END-OF-TICKET';
      const body = `${'The cart keeps every item the shopper adds. '.repeat(1400)}${marker}`;
      assert.ok(body.length > 60_000);
      await s.capture(GET, mcp(jira('ORD-17', { description: body })), { input: { issueIdOrKey: 'ORD-17' }, asked: [TICKET] });
      const message = await s.next();
      // The pointer's file is the one copy: no second requirements file is written beside it.
      const file = /## envelope\nRead (\S+) \(\d{5,} bytes\) with your first reads\./.exec(message.text)?.[1];
      assert.ok(file !== undefined, message.text);
      const written = await s.fx.runtime.fs.readText(file);
      assert.ok(written.includes(marker) && written.length > 60_000, `${written.length} chars`);
      assert.doesNotMatch(message.text, /\[cut\]/);
      assert.equal(await s.fx.runtime.fs.readText(path.join(s.dir.root, 'requirements.md')).catch(() => null), null);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a route started on a task that holds the ticket skips fetch and delivers the same text', async () => {
    const s = await session({ skill: 'investigate', shipped: true, requirements: [TICKET], text: 'ORD-17 which files?' });
    try {
      await s.capture(GET, mcp(jira('ORD-17', { description: 'Whole body.' })), { input: { issueIdOrKey: 'ORD-17' }, asked: [TICKET] });
      await s.next();
      const again = await s.fx.engine.start({ skill: 'investigate', text: 'ORD-17 and the other files?', requirements: [TICKET], task: s.task, cwd: s.fx.repo.root, session: 'bbbbbbbb-2222-4222-8222-222222222222', channel: 'hook', scratchpadDir: s.fx.scratchpad });
      const head = (await s.fx.kinds(s.task, 'route')).at(-1)!;
      assert.deepEqual(head['captured'], [TICKET]);
      assert.notEqual(again.position, 'fetch');
      assert.deepEqual((await s.fx.kinds(s.task, 'envelope')).map((entry) => entry['route']).length, 2);
      assert.match((await loadPayload(s.fx.runtime.fs, s.dir, head['id'] as string, 'envelope'))!, /Whole body\./);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a route started after the held ticket file was deleted fetches it again, and its head lists no capture', async () => {
    const s = await session({ skill: 'investigate', shipped: true, requirements: [TICKET], text: 'ORD-17 which files?' });
    try {
      await s.capture(GET, mcp(jira('ORD-17', { description: 'Whole body.' })), { input: { issueIdOrKey: 'ORD-17' }, asked: [TICKET] });
      await s.next();
      await Promise.all((await s.fx.runtime.fs.readdir(s.dir.requirements)).map((file) => s.fx.runtime.fs.remove(path.join(s.dir.requirements, file.name))));
      const again = await s.fx.engine.start({ skill: 'investigate', text: 'ORD-17 and the other files?', requirements: [TICKET], task: s.task, cwd: s.fx.repo.root, session: 'bbbbbbbb-2222-4222-8222-222222222222', channel: 'hook', scratchpadDir: s.fx.scratchpad });
      assert.deepEqual((await s.fx.kinds(s.task, 'route')).at(-1)!['captured'], []);
      assert.equal(again.position, 'fetch');
    } finally {
      await s.fx.dispose();
    }
  });

  it('the review gets each source as the same readable text, custom fields and page bodies included, whole', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET] });
    try {
      const evidence = { sources: [{ id: 'ORD-17', url: TICKET, title: 'T', retrievedAt: 'now', content: JSON.stringify({ key: 'ORD-17', fields: { summary: 'T', customfield_10200: adf('AC1: rounds to cents') } }) }] };
      const [source] = await requirementSources(s.fx.runtime, { urls: [TICKET], evidence: { kind: 'inline', evidence } });
      assert.equal(source!.content, renderRequirement(evidence.sources[0]!.content));
      assert.match(source!.content, /AC1: rounds to cents/);
    } finally {
      await s.fx.dispose();
    }
  });
});

const user = (n: number) => ({ self: `https://x.atlassian.net/rest/api/3/user?accountId=u${n}`, accountId: `5b10ac8d82e05b22cc7d4ef${n}`, emailAddress: `person${n}@example.com`, avatarUrls: { '48x48': `https://avatar.example/${n}/48.png`, '24x24': `https://avatar.example/${n}/24.png` }, displayName: `Person ${n}`, active: true, timeZone: 'Europe/Berlin', accountType: 'atlassian' });
const adfDoc = (...paragraphs: string[]) => ({ version: 1, type: 'doc', content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) });

/** A Jira issue as getJiraIssue returns it: 15 comments, 30 changelog histories, 5 links, watchers, votes, a worklog. */
function realisticIssue(): string {
  const issue = {
    id: '10042', key: 'ORD-17', self: 'https://x.atlassian.net/rest/api/3/issue/10042', expand: 'renderedFields,names,changelog',
    fields: {
      summary: 'Cart total ignores discounts', description: adfDoc('The cart total must subtract every discount before tax.', 'Discounts never go below zero.'),
      customfield_10200: adfDoc('AC1: total rounds to cents', 'AC2: a 100% discount gives zero'),
      issuetype: { name: 'Story', iconUrl: 'https://x.atlassian.net/icon.png' }, status: { name: 'In Progress' }, labels: ['cart', 'money'],
      creator: user(1), reporter: user(2), assignee: user(3),
      watches: { self: 'https://x.atlassian.net/rest/api/3/issue/ORD-17/watchers', watchCount: 7, isWatching: false },
      votes: { self: 'https://x.atlassian.net/rest/api/3/issue/ORD-17/votes', votes: 2, hasVoted: false },
      worklog: { startAt: 0, maxResults: 20, total: 1, worklogs: [{ author: user(4), timeSpent: '2h', comment: adfDoc('pairing') }] },
      issuelinks: Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, self: `https://x.atlassian.net/rest/api/3/issueLink/${i}`, type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, outwardIssue: { id: `${i}`, key: `ORD-${20 + i}`, self: `https://x.atlassian.net/rest/api/3/issue/${i}`, fields: { summary: `Linked ${i}`, status: { name: 'Open', iconUrl: 'https://x.atlassian.net/s.png' } } } })),
      comment: { startAt: 0, maxResults: 50, total: 15, comments: Array.from({ length: 15 }, (_, i) => ({ id: `${i}`, self: `https://x.atlassian.net/rest/api/3/issue/10042/comment/${i}`, author: user(i % 4), body: adfDoc(`Comment ${i}: discounts apply per line, not per order.`), updateAuthor: user(i % 4), created: '2026-03-01T10:00:00.000+0100', updated: '2026-03-01T10:00:00.000+0100', jsdPublic: true })) },
    },
    changelog: { startAt: 0, maxResults: 30, total: 30, histories: Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, author: user(i % 4), created: '2026-02-01T10:00:00.000+0100', items: [{ field: 'status', fieldtype: 'jira', fieldId: 'status', from: '1', fromString: 'To Do', to: '3', toString: 'In Progress' }] })) },
  };
  return JSON.stringify(issue);
}

describe('a Jira capture does not grow when rendered', () => {
  it('a realistic issue renders to no more characters than its raw JSON, drops edit history and account metadata, and keeps every requirement text', () => {
    const raw = realisticIssue();
    const text = renderRequirement(raw);
    assert.ok(text.length <= raw.length, `${text.length} > ${raw.length}`);
    for (const part of ['Cart total ignores discounts', 'subtract every discount before tax', 'Discounts never go below zero', 'AC1: total rounds to cents', 'AC2: a 100% discount gives zero', 'Comment 14: discounts apply per line', 'Linked 4', 'Person 3', 'In Progress', 'money']) assert.ok(text.includes(part), `${part} missing`);
    assert.doesNotMatch(text, /changelog|histories|fromString|worklog|watchCount|hasVoted|accountId|emailAddress|timeZone|accountType|example\.com|avatar/);
  });

  it('a capture whose fields all render to nothing falls back to the raw content', () => {
    const raw = JSON.stringify({ self: 'https://x/rest/1', fields: { description: null, labels: [] } });
    assert.equal(renderRequirement(raw), raw);
  });
});

describe('Atlassian rich text keeps its links, mentions, tables and breaks', () => {
  const doc = (...content: unknown[]) => JSON.stringify({ fields: { description: { type: 'doc', content } } });
  const para = (...content: unknown[]) => ({ type: 'paragraph', content });
  const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks === undefined ? {} : { marks }) });

  it('inlineCard, blockCard and embedCard render their url', () => {
    const out = renderRequirement(doc(para(text('See '), { type: 'inlineCard', attrs: { url: 'https://x/browse/ORD-9' } }), { type: 'blockCard', attrs: { url: 'https://x/wiki/pages/1' } }, { type: 'embedCard', attrs: { url: 'https://x/design/2' } }));
    assert.match(out, /See https:\/\/x\/browse\/ORD-9\nhttps:\/\/x\/wiki\/pages\/1\nhttps:\/\/x\/design\/2/);
  });

  it('a mention renders its text; a link mark renders `text (href)`', () => {
    const out = renderRequirement(doc(para({ type: 'mention', attrs: { id: 'abc', text: '@Ann' } }, text(' read the '), text('spec', [{ type: 'link', attrs: { href: 'https://x/spec' } }]))));
    assert.match(out, /@Ann read the spec \(https:\/\/x\/spec\)/);
  });

  it('table cells in a row are separated by " | " and rows are lines; header cells too', () => {
    const cell = (type: string, value: string) => ({ type, content: [para(text(value))] });
    const out = renderRequirement(doc({ type: 'table', content: [{ type: 'tableRow', content: [cell('tableHeader', 'Item'), cell('tableHeader', 'Rate')] }, { type: 'tableRow', content: [cell('tableCell', 'VAT'), cell('tableCell', '20%')] }] }));
    assert.match(out, /Item \| Rate\nVAT \| 20%/);
  });

  it('a hardBreak is a newline', () => {
    assert.match(renderRequirement(doc(para(text('one'), { type: 'hardBreak' }, text('two')))), /one\ntwo/);
  });

  it('Confluence macro parameters are set apart from the macro body', () => {
    const storage = '<ac:structured-macro ac:name="info"><ac:parameter ac:name="title">Hi</ac:parameter><ac:rich-text-body><p>x</p></ac:rich-text-body></ac:structured-macro>';
    const out = renderRequirement(JSON.stringify({ title: 'P', body: { storage: { value: storage } } }));
    assert.match(out, /Hi\nx/);
    assert.doesNotMatch(out, /Hix/);
  });
});

describe('the gap lines of a rendered requirements text', () => {
  it('a bare key with no requirements server is its own gap, apart from a failed capture, and both lead the text', () => {
    const rendered = renderRequirements([{ key: 'ORD-1', url: '', content: 'body' }], ['ORD-17', 'ORD-9'], ['ORD-17']);
    assert.match(rendered, /^Not captured: ORD-9; list it under Not verified\.\nORD-17 looks like a ticket key; no requirements server is configured, so it was not fetched; list it under Not verified\.\n\n## ORD-1/);
    assert.equal(requirementGapsOf(rendered).split('\n').length, 2);
    assert.equal(requirementGapsOf('## ORD-1\nbody'), '');
  });
});
