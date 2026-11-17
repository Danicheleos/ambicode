import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { jira, mcp, session } from '#testing/fixtures/requirements-session';
import { contentHash } from '#util/hash';
import { hasRequirement, requirementsIn } from './capture/has-requirement.ts';
import { namesKey, sourceId } from '#util/issue-key';
import { fileOf, mapTextOf, readCapture, titleOf } from './capture/capture.ts';
import { askedKeys } from './envelope/envelope.ts';

const GET = 'mcp__atlassian__getJiraIssue';
const TICKET = 'https://x.atlassian.net/browse/ORD-17';
const PAGE = 'https://x.atlassian.net/wiki/spaces/ENG/pages/42/Orders';

describe('hasRequirement', () => {
  const table: [string, { text: string; requirements?: string[]; headless?: boolean }, string | null, boolean][] = [
    ['a URL in the text', { text: 'look at https://x.atlassian.net/browse/ORD-17' }, null, true],
    ['any --requirement', { text: 'look', requirements: ['https://x/y'] }, null, true],
    ['a bare key as the first word with a server bound', { text: 'ORD-17 why slow' }, 'atlassian', true],
    ['a bare key without a server', { text: 'ORD-17 why slow' }, null, false],
    ['a key inside prose', { text: 'why is ORD-17 slow' }, 'atlassian', false],
    ['headless without --requirement', { text: 'ORD-17 https://x/y', headless: true }, 'atlassian', false],
  ];
  for (const [name, input, server, expected] of table) {
    it(name, () => assert.equal(hasRequirement({ text: input.text, requirements: input.requirements ?? [], headless: input.headless ?? false }, { mcpServer: server }), expected));
  }
});

describe('keys', () => {
  it('asked keys are the --requirement values, URLs in the text and a bare first key, raw; prose keys are not asked', () => {
    assert.deepEqual(askedKeys({ requirements: [PAGE], text: `ORD-18 see ${TICKET} and ORD-19` }), [PAGE, TICKET, 'ORD-18']);
  });

  it('a first-word key is matched whole: ORD-1 beside a link to ORD-12 asks both', () => {
    assert.deepEqual(askedKeys({ requirements: [], text: 'ORD-1 compare https://x/browse/ORD-12' }), ['https://x/browse/ORD-12', 'ORD-1']);
    assert.deepEqual(askedKeys({ requirements: [], text: 'ORD-1 see https://x/browse/ORD-1?focusedId=3' }), ['https://x/browse/ORD-1?focusedId=3']);
  });

  it('namesKey takes a key as a whole token and sourceId makes a URL and its key one source', () => {
    assert.deepEqual([namesKey('/browse/ORD-12', 'ORD-1'), namesKey('XORD-1', 'ORD-1'), namesKey('/browse/ORD-1?x=1', 'ORD-1'), namesKey('{"k":"ORD-1"}', 'ORD-1')], [false, false, true, true]);
    assert.equal(sourceId(TICKET), sourceId('ORD-17'));
    assert.notEqual(sourceId('https://x/browse/ORD-1'), sourceId('ORD-12'));
    assert.equal(sourceId(PAGE), PAGE);
  });

  it('a merge request description link to ORD-12 does not hide the title\'s ORD-1', () => {
    assert.deepEqual(requirementsIn('ORD-1 fix', 'see https://x/browse/ORD-12', []), ['ORD-1', 'https://x/browse/ORD-12']);
  });
});

describe('capture stores the raw result text', () => {
  it('an MCP call is stored under its key with url, retrievedAt, rawHash (the tool is the ledger via) and the whole text; no step, no map', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET] });
    try {
      const body = jira('ORD-17', { description: 'The cart holds 50 items.' });
      const entry = await s.capture(GET, mcp(body), { input: { issueIdOrKey: 'ORD-17' } });
      assert.deepEqual([entry?.['key'], entry?.['via']], ['ORD-17', GET]);
      const stored = await readCapture(s.fx.runtime.fs, s.dir, 'ORD-17', null);
      assert.deepEqual(stored && { key: stored.key, content: stored.content, rawHash: stored.rawHash }, { key: 'ORD-17', content: body, rawHash: contentHash(body) });
      assert.deepEqual((await s.fx.ledger(s.task)).map((e) => e.kind).filter((kind) => kind === 'requirement' || kind === 'map'), ['requirement']);
    } finally {
      await s.fx.dispose();
    }
  });

  it('WebFetch is keyed by its URL; the same response twice is one entry; a call naming no key writes nothing; so does a call when nothing was asked', async () => {
    const s = await session({ skill: 'investigate', requirements: [PAGE] });
    try {
      const response = { result: 'Orders page body' };
      assert.equal((await s.capture('WebFetch', response, { input: { url: PAGE }, asked: [PAGE] }))?.['key'], PAGE);
      assert.equal(await s.capture('WebFetch', response, { input: { url: PAGE }, asked: [PAGE] }), null);
      assert.equal(await s.capture(GET, mcp('x'), { input: { cloudId: 'abc' } }), null);
      assert.equal(await s.capture('mcp__other__search', mcp('x'), { input: { issueIdOrKey: 'ORD-17' }, asked: [] }), null);
      assert.equal(await s.capture('Read', mcp('x'), { input: { issueIdOrKey: 'ORD-17' } }), null);
      assert.equal((await s.fx.kinds(s.task, 'requirement')).length, 1);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a call naming only the issue key is stored under the asked URL it is the last segment of', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET] });
    try {
      assert.equal((await s.capture(GET, mcp(jira('ORD-17')), { input: { issueIdOrKey: 'ORD-17' }, asked: [TICKET] }))?.['key'], TICKET);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a child whose key only starts with the asked key is linked, never recorded as the asked one', async () => {
    const s = await session({ skill: 'investigate', requirements: ['https://x.atlassian.net/browse/ORD-1'], text: 'ORD-1 which files?' });
    try {
      const asked = ['https://x.atlassian.net/browse/ORD-1'];
      await s.capture(GET, mcp(jira('ORD-1')), { input: { issueIdOrKey: 'ORD-1' }, asked });
      const child = await s.capture(GET, mcp(jira('ORD-12', { description: 'child body' })), { input: { issueIdOrKey: 'ORD-12' }, asked });
      assert.deepEqual([child?.['key'], child?.['relation']], ['ORD-12', 'linked']);
      assert.match((await readCapture(s.fx.runtime.fs, s.dir, asked[0]!, null))!.content, /Body of ORD-1\b/);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a result over 256 KB is saved and read back whole; an edited file no longer reads', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET] });
    try {
      await s.capture(GET, mcp('a'.repeat(300 * 1024)), { input: { issueIdOrKey: 'ORD-17' } });
      const stored = await readCapture(s.fx.runtime.fs, s.dir, 'ORD-17', null);
      assert.equal(stored?.content.length, 300 * 1024);
      assert.equal(stored?.rawHash, contentHash('a'.repeat(300 * 1024)));
      assert.equal(Object.hasOwn((await s.fx.kinds(s.task, 'requirement'))[0]!, 'capture'), false);
      const saved = JSON.parse(await readFile(path.join(s.dir.requirements, (await s.fx.runtime.fs.readdir(s.dir.requirements))[0]!.name), 'utf8')) as Record<string, unknown>;
      assert.deepEqual(Object.keys(saved), ['key', 'url', 'retrievedAt', 'rawHash', 'content']);
      const file = path.join(s.dir.requirements, (await s.fx.runtime.fs.readdir(s.dir.requirements))[0]!.name);
      await s.fx.runtime.fs.writeText(file, (await readFile(file, 'utf8')).replace('"aaaa', '"bbbb'));
      assert.equal(await readCapture(s.fx.runtime.fs, s.dir, 'ORD-17', null), null);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a capture saved with the old `cutFrom` key still reads, without the key', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET] });
    try {
      const content = 'plain text';
      await s.fx.runtime.fs.mkdirp(s.dir.requirements);
      await s.fx.runtime.fs.writeText(fileOf(s.dir, 'request'), JSON.stringify({ key: 'request', url: '', tool: 'request', retrievedAt: '2026-11-07T12:09:34.950Z', rawHash: contentHash(content), content, cutFrom: null }));
      const stored = await readCapture(s.fx.runtime.fs, s.dir, 'request', null);
      assert.equal(stored?.content, content);
      assert.equal(Object.hasOwn(stored!, 'cutFrom'), false);
    } finally {
      await s.fx.dispose();
    }
  });
});

describe('envelope', () => {
  it('captured sources build the envelope with their url and hash; the asked set and missingAsked are recorded', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET, PAGE] });
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { input: { issueIdOrKey: 'ORD-17' }, asked: [TICKET, PAGE] });
      const result = await s.normalize();
      assert.ok(result.state === 'ok' && result.builtFrom === 'captures');
      assert.deepEqual([result.asked, result.missingAsked], [[TICKET, PAGE], [PAGE]]);
      const [entry] = await s.fx.kinds(s.task, 'envelope');
      assert.deepEqual((entry!['sources'] as { key: string; rawHash: string }[]).map((source) => [source.key, source.rawHash]), [[TICKET, contentHash(jira('ORD-17'))]]);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a child issue fetched after the asked one is captured too, and the envelope holds both', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET] });
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { input: { issueIdOrKey: 'ORD-17' }, asked: [TICKET] });
      await s.capture(GET, mcp(jira('ORD-18', { description: 'API contract: POST /orders' })), { input: { issueIdOrKey: 'ORD-18' }, asked: [TICKET] });
      const result = await s.normalize();
      assert.ok(result.state === 'ok' && result.builtFrom === 'captures');
      assert.deepEqual(result.sources.map((source) => source.key).sort(), ['ORD-18', TICKET]);
      assert.deepEqual([result.asked, result.missingAsked], [[TICKET], []]);
      assert.match(result.sources.find((source) => source.key === 'ORD-18')!.content, /POST \/orders/);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a fetch or token during a later step records nothing, even when it names a tracker key or an unrelated page', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET] });
    try {
      await s.capture('WebFetch', { result: 'Ticket body' }, { input: { url: TICKET }, asked: [TICKET] });
      await s.fx.engine.advance({ task: s.task, cause: 'route-next', scratchpadDir: s.fx.scratchpad });
      assert.notEqual((await s.under(async ({ view }) => view)).position, 'fetch');
      assert.equal(await s.capture('WebFetch', { result: 'MDN' }, { input: { url: 'https://developer.example.org/en/utf-8', prompt: 'UTF-8 notes' }, asked: [TICKET] }), null);
      assert.equal(await s.capture(GET, mcp(jira('ORD-18')), { input: { issueIdOrKey: 'ORD-18' }, asked: [TICKET] }), null);
    } finally {
      await s.fx.dispose();
    }
  });

  it('during the fetch step a bare token in free text or a foreign host is not linked; a same-host URL is', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET] });
    try {
      assert.equal(await s.capture('WebFetch', { result: 'MDN' }, { input: { url: 'https://developer.example.org/en/docs', prompt: 'explain UTF-8 and SHA-256' }, asked: [TICKET] }), null);
      assert.equal(await s.capture('mcp__atlassian__search', mcp('hits'), { input: { query: 'UTF-8 ORD-99 bug' }, asked: [TICKET] }), null);
      assert.equal((await s.capture('WebFetch', { result: 'child body' }, { input: { url: 'https://x.atlassian.net/browse/ORD-30' }, asked: [TICKET] }))?.['relation'], 'linked');
    } finally {
      await s.fx.dispose();
    }
  });

  describe('a search result is keyed by the issues it returns, never by the keys its query names', () => {
    const SEARCH = 'mcp__atlassian__searchJiraIssuesUsingJql';
    /** The shape both getJiraIssue and the search return: issues.nodes holds one node per issue. */
    const found = (...keys: string[]): string => JSON.stringify({ context: {}, issues: { nodes: keys.map((key) => ({ expand: '', fields: { summary: `Summary ${key}`, description: `Body of ${key}` }, id: key.replace(/\D/g, ''), key, self: '', webUrl: '' })), pageInfo: { hasNextPage: false }, webUrl: '' } });
    const search = (s: Awaited<ReturnType<typeof session>>, jql: string, text: string) => s.captureAll(SEARCH, mcp(text), { input: { jql, cloudId: 'x.atlassian.net' }, asked: [TICKET] });
    const rows = async (s: Awaited<ReturnType<typeof session>>) => (await s.fx.kinds(s.task, 'requirement')).map((row) => [row['key'], row['relation']]);
    const ticketText = async (s: Awaited<ReturnType<typeof session>>) => (await readCapture(s.fx.runtime.fs, s.dir, TICKET, null))?.content;
    const readTicket = (s: Awaited<ReturnType<typeof session>>) => s.captureAll(GET, mcp(jira('ORD-17')), { input: { issueIdOrKey: 'ORD-17' }, asked: [TICKET] });

    it('a search naming the asked ticket leaves its capture whole and links the children it returns, and the envelope holds all three', async () => {
      const s = await session({ skill: 'investigate', requirements: [TICKET] });
      try {
        await readTicket(s);
        await search(s, 'parent = ORD-17 OR key in (ORD-18, ORD-19)', found('ORD-18', 'ORD-19'));
        assert.equal(await ticketText(s), jira('ORD-17'));
        assert.deepEqual(await rows(s), [[TICKET, 'asked'], ['ORD-18', 'linked'], ['ORD-19', 'linked']]);
        const result = await s.normalize();
        assert.ok(result.state === 'ok');
        assert.deepEqual(result.sources.map((source) => source.key).sort(), ['ORD-18', 'ORD-19', TICKET]);
        assert.deepEqual(result.missingAsked, []);
      } finally {
        await s.fx.dispose();
      }
    });

    it('during fetch a search that does not name the asked key still links the issues it returns', async () => {
      const s = await session({ skill: 'investigate', requirements: [TICKET] });
      try {
        await search(s, 'key in (ORD-18, ORD-19)', found('ORD-18', 'ORD-19'));
        assert.deepEqual(await rows(s), [['ORD-18', 'linked'], ['ORD-19', 'linked']]);
      } finally {
        await s.fx.dispose();
      }
    });

    it('after the fetch step the same search saves nothing', async () => {
      const s = await session({ skill: 'investigate', requirements: [TICKET] });
      try {
        await readTicket(s);
        await s.fx.engine.advance({ task: s.task, cause: 'route-next', scratchpadDir: s.fx.scratchpad });
        await search(s, 'key in (ORD-18, ORD-19)', found('ORD-18', 'ORD-19'));
        assert.deepEqual(await rows(s), [[TICKET, 'asked']]);
      } finally {
        await s.fx.dispose();
      }
    });

    it('a search returning the asked item and a child leaves the asked capture as read and links the child', async () => {
      const s = await session({ skill: 'investigate', requirements: [TICKET] });
      try {
        await readTicket(s);
        await search(s, 'key = ORD-17 OR parent = ORD-17', found('ORD-17', 'ORD-18'));
        assert.equal(await ticketText(s), jira('ORD-17'));
        assert.deepEqual(await rows(s), [[TICKET, 'asked'], ['ORD-18', 'linked']]);
      } finally {
        await s.fx.dispose();
      }
    });

    it('a search naming the asked key that returns no issues, or prose, saves nothing and keeps the asked capture', async () => {
      const s = await session({ skill: 'investigate', requirements: [TICKET] });
      try {
        await readTicket(s);
        await search(s, 'parent = ORD-17', JSON.stringify({ context: {}, issues: { nodes: [], pageInfo: {} } }));
        await search(s, 'parent = ORD-17', 'No issues matched parent = ORD-17');
        assert.equal(await ticketText(s), jira('ORD-17'));
        assert.deepEqual(await rows(s), [[TICKET, 'asked']]);
      } finally {
        await s.fx.dispose();
      }
    });

    it('an issue under a wrapper object that lists subtasks is read whole as the asked capture, outside fetch too (the subtasks are not split off)', async () => {
      const s = await session({ skill: 'investigate', requirements: [TICKET] });
      try {
        await readTicket(s);
        await s.fx.engine.advance({ task: s.task, cause: 'route-next', scratchpadDir: s.fx.scratchpad });
        const body = JSON.stringify({ issue: { key: 'ORD-17', fields: { summary: 'S', subtasks: [{ key: 'ORD-18' }, { key: 'ORD-19' }] } } });
        await s.captureAll(GET, mcp(body), { input: { issueIdOrKey: 'ORD-17' }, asked: [TICKET] });
        assert.deepEqual(await rows(s), [[TICKET, 'asked'], [TICKET, 'asked']]);
        assert.equal(await ticketText(s), body);
      } finally {
        await s.fx.dispose();
      }
    });

    it('a one-node search for the asked ticket does not replace its direct read', async () => {
      const s = await session({ skill: 'investigate', requirements: [TICKET] });
      try {
        await readTicket(s);
        await search(s, 'key = ORD-17', found('ORD-17'));
        assert.equal(await ticketText(s), jira('ORD-17'));
        assert.deepEqual(await rows(s), [[TICKET, 'asked']]);
      } finally {
        await s.fx.dispose();
      }
    });

    it('a one-node search for the asked ticket with no earlier capture is saved as the asked source', async () => {
      const s = await session({ skill: 'investigate', requirements: [TICKET] });
      try {
        const text = found('ORD-17');
        await search(s, 'key = ORD-17', text);
        assert.deepEqual(await rows(s), [[TICKET, 'asked']]);
        assert.equal(await ticketText(s), text);
      } finally {
        await s.fx.dispose();
      }
    });

    it('a plain issue whose fields list subtasks is one capture under the asked key, whole', async () => {
      const s = await session({ skill: 'investigate', requirements: [TICKET] });
      try {
        const body = jira('ORD-17', { subtasks: [{ key: 'ORD-18', fields: { summary: 'a' } }, { key: 'ORD-19', fields: { summary: 'b' } }] });
        await s.captureAll(GET, mcp(body), { input: { issueIdOrKey: 'ORD-17' }, asked: [TICKET] });
        assert.deepEqual(await rows(s), [[TICKET, 'asked']]);
        assert.equal(await ticketText(s), body);
      } finally {
        await s.fx.dispose();
      }
    });
  });

  it('a failed asked fetch plus an unrelated page read leaves the requirement not captured', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET] });
    try {
      await s.capture('WebFetch', { result: 'MDN' }, { input: { url: 'https://developer.example.org/en/docs' }, asked: [TICKET] });
      const result = await s.normalize();
      assert.ok(result.state === 'failed' && result.code === 'requirements-not-captured');
      await s.capture(GET, mcp(jira('ORD-18')), { input: { issueIdOrKey: 'ORD-18' }, asked: [TICKET] });
      const linkedOnly = await s.normalize();
      assert.ok(linkedOnly.state === 'failed' && linkedOnly.code === 'requirements-not-captured', 'a linked capture alone never satisfies the asked requirement');
    } finally {
      await s.fx.dispose();
    }
  });

  it('a review with an asked source missing is refused requirements-missing, recoverably', async () => {
    const s = await session({ requirements: [TICKET, PAGE] });
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { input: { issueIdOrKey: 'ORD-17' }, asked: [TICKET, PAGE] });
      const result = await s.normalize();
      assert.ok(result.state === 'failed' && result.code === 'requirements-missing');
    } finally {
      await s.fx.dispose();
    }
  });

  it('nothing captured is refused once, then a gate; "continue without" builds the args envelope and "stop" exits blocked', async () => {
    const run = async (answer: string) => {
      const s = await session({ skill: 'investigate' });
      try {
        await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-not-captured' && /Fetch https:\/\/x.atlassian.net\/browse\/ORD-17/.test(error.message));
        assert.match((await s.next()).text, /requirements-not-captured-twice/);
        await s.next({ answers: [{ gate: 'requirements-not-captured-twice', option: answer }] });
        return { envelope: (await s.fx.kinds(s.task, 'envelope')).at(-1), exits: await s.exits() };
      } finally {
        await s.fx.dispose();
      }
    };
    assert.equal((await run('continue without')).envelope?.['builtFrom'], 'args');
    assert.deepEqual(await run('stop').then((result) => [result.envelope, result.exits]), [undefined, ['blocked']]);
  });

  it('a bare key with no requirements server is not fetched, and the envelope reports it as not captured', async () => {
    const s = await session({ skill: 'plan', server: null, requirements: [], text: 'ORD-17 which files?' });
    try {
      const result = await s.normalize();
      assert.ok(result.state === 'ok');
      assert.deepEqual([result.asked, result.missingAsked], [['ORD-17'], ['ORD-17']]);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a bare key with no server is reported as not fetched, not as a failed capture, and the gap is in the step message beside the pointer', async () => {
    const s = await session({ skill: 'investigate', shipped: true, server: null, requirements: [], text: 'ORD-17 which files add to cart?' });
    try {
      const message = await s.next();
      assert.match(message.text, /## envelope\nRead \S+ \(\d+ bytes\) with your first reads\.\nORD-17 looks like a ticket key; no requirements server is configured, so it was not fetched/);
      assert.doesNotMatch(message.text, /Not captured/);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a failed capture of an asked page shows as Not captured in the step message, beside a captured ticket', async () => {
    const s = await session({ skill: 'investigate', shipped: true, requirements: [TICKET, PAGE], text: 'which files add to cart?' });
    try {
      await s.capture(GET, mcp(jira('ORD-17', { description: 'cart rules' })), { input: { issueIdOrKey: 'ORD-17' }, asked: [TICKET, PAGE] });
      const message = await s.next();
      assert.match(message.text, new RegExp(`## envelope\\nRead \\S+ \\(\\d+ bytes\\) with your first reads\\.\\nNot captured: ${PAGE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}; list it under Not verified\\.`));
    } finally {
      await s.fx.dispose();
    }
  });

  it('a route asking the URL of a key an earlier route captured by key does not fetch again', async () => {
    const s = await session({ skill: 'investigate', shipped: true, requirements: ['ORD-17'], text: 'which files add to cart?' });
    try {
      await s.capture(GET, mcp(jira('ORD-17', { description: 'cart rules' })), { input: { issueIdOrKey: 'ORD-17' }, asked: ['ORD-17'] });
      await s.next();
      const again = await s.fx.engine.start({ skill: 'investigate', text: 'again', requirements: [TICKET], task: s.task, cwd: s.fx.repo.root, session: 'bbbbbbbb-2222-4222-8222-222222222222', channel: 'hook', scratchpadDir: s.fx.scratchpad });
      assert.notEqual(again.position, 'fetch');
      assert.deepEqual((await s.fx.kinds(s.task, 'envelope')).at(-1)!['missingAsked'], []);
    } finally {
      await s.fx.dispose();
    }
  });

  it('with nothing to fetch the request text is the one source, saved as typed', async () => {
    const s = await session({ skill: 'investigate', requirements: [], text: 'which files?' });
    try {
      const result = await s.normalize();
      assert.ok(result.state === 'ok' && result.builtFrom === 'captures');
      assert.deepEqual(result.sources.map((source) => [source.key, source.content]), [['request', 'which files?']]);
    } finally {
      await s.fx.dispose();
    }
  });
});

describe('titleOf', () => {
  it('takes the issue summary or page title from the captured JSON, else the key', () => {
    assert.equal(titleOf(JSON.stringify({ issues: { nodes: [{ key: 'VS-1', fields: { summary: 'Support bulk import', description: 'x' } }] } }), 'VS-1'), 'Support bulk import');
    assert.equal(titleOf(JSON.stringify({ results: [{ id: '9', title: 'Orders page' }] }), 'p'), 'Orders page');
    assert.equal(titleOf('plain prose, not JSON', 'ORD-17'), 'ORD-17');
    assert.equal(titleOf('{"fields":{"summary":"  "}}', 'ORD-17'), 'ORD-17');
  });
});

const nested = (key: string, summary: string, description: string | null, extra: Record<string, unknown> = {}): string => JSON.stringify({ key, fields: { parent: { fields: { summary: 'PARENT-SUMMARY' } }, issuetype: { description: 'ISSUETYPE-DESC' }, status: { description: 'STATUS-DESC' }, summary, description, ...extra } });

describe('mapTextOf', () => {
  it('an own summary and description win over nested parent, issuetype and status ones', () => {
    assert.equal(titleOf(nested('VS-1', 'Own title', 'Own body'), 'VS-1'), 'Own title');
    assert.equal(mapTextOf(nested('VS-1', 'Own title', 'Own body'), 'Own title'), 'Own title\nOwn body');
  });

  it('an asked issue and a linked child each reduce to title and description, joined', () => {
    const sources = [nested('VS-1', 'Asked', 'Asked body'), nested('VS-2', 'Child', 'Child body')];
    assert.equal(sources.map((content) => mapTextOf(content, titleOf(content, 'k'))).join('\n'), 'Asked\nAsked body\nChild\nChild body');
  });

  it('a typed request and prose are unchanged', () => {
    assert.equal(mapTextOf('where is the cart total computed?', 'request'), 'request\nwhere is the cart total computed?');
  });

  it('JSON with no description gives the title only', () => {
    assert.equal(mapTextOf(JSON.stringify({ key: 'VS-1', fields: { issuetype: { description: 'ITYPE' }, summary: 'Only title', description: null } }), 'Only title'), 'Only title');
  });

  it('a Confluence page gives its title and its storage body as text', () => {
    assert.equal(mapTextOf(JSON.stringify({ title: 'Orders', body: { storage: { value: '<p>Rules</p>' } } }), 'Orders'), 'Orders\nRules');
  });

  it('a Jira REST v3 description in ADF reaches the map as text', () => {
    const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Total is the sum.' }] }] };
    assert.equal(mapTextOf(JSON.stringify({ fields: { summary: 'Cart', description: adf } }), 'Cart'), 'Cart\nTotal is the sum.');
  });

  it('a GitHub or GitLab issue gives its title and string body', () => {
    assert.equal(mapTextOf(JSON.stringify({ title: 'Fix cart', body: 'GitHub body text' }), 'Fix cart'), 'Fix cart\nGitHub body text');
  });

  it('JSON with no summary or title keeps the raw capture after the key', () => {
    assert.equal(mapTextOf('{"id":7,"note":"x"}', 'ORD-17'), 'ORD-17\n{"id":7,"note":"x"}');
  });
});
