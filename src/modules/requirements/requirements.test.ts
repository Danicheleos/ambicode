import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { jira, mcp, session } from '#testing/fixtures/requirements-session';
import { contentHash } from '#util/hash';
import { hasRequirement } from './capture/has-requirement.ts';
import { keyOfSource, readCapture } from './capture/capture.ts';
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
  it('a Jira key anywhere wins, else the last path segment of a URL, else the text; a fragment or query does not change it', () => {
    assert.equal(keyOfSource(TICKET), 'ORD-17');
    assert.equal(keyOfSource(`${TICKET}?focusedId=1#top`), 'ORD-17');
    assert.equal(keyOfSource(PAGE), 'Orders');
    assert.equal(keyOfSource('https://x.example/docs/spec#intro'), 'spec');
    assert.equal(keyOfSource('ORD-17'), 'ORD-17');
  });

  it('asked keys come from --requirement, URLs and a bare first key; prose keys are not asked', () => {
    assert.deepEqual(askedKeys({ requirements: [PAGE], text: `ORD-18 see ${TICKET} and ORD-19` }), ['Orders', 'ORD-17', 'ORD-18']);
  });
});

describe('capture stores the raw result text', () => {
  it('an MCP call is stored under its key with url, tool, retrievedAt, rawHash and the whole text; no step, no map', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET] });
    try {
      const body = jira('ORD-17', { description: 'The cart holds 50 items.' });
      const entry = await s.capture(GET, mcp(body), { input: { issueIdOrKey: 'ORD-17' } });
      assert.equal(entry?.['key'], 'ORD-17');
      const stored = await readCapture(s.fx.runtime.fs, s.dir, 'ORD-17', null);
      assert.deepEqual(stored && { key: stored.key, tool: stored.tool, content: stored.content, rawHash: stored.rawHash }, { key: 'ORD-17', tool: GET, content: body, rawHash: contentHash(body) });
      assert.deepEqual((await s.fx.ledger(s.task)).map((e) => e.kind).filter((kind) => kind === 'requirement' || kind === 'map'), ['requirement']);
    } finally {
      await s.fx.dispose();
    }
  });

  it('WebFetch is keyed by its URL; the same response twice is one entry; a call naming no key writes nothing; so does a call when nothing was asked', async () => {
    const s = await session({ skill: 'investigate', requirements: [PAGE] });
    try {
      const response = { result: 'Orders page body' };
      assert.equal((await s.capture('WebFetch', response, { input: { url: PAGE }, asked: ['Orders'] }))?.['key'], 'Orders');
      assert.equal(await s.capture('WebFetch', response, { input: { url: PAGE }, asked: ['Orders'] }), null);
      assert.equal(await s.capture(GET, mcp('x'), { input: { cloudId: 'abc' } }), null);
      assert.equal(await s.capture('mcp__other__search', mcp('x'), { input: { issueIdOrKey: 'ORD-17' }, asked: [] }), null);
      assert.equal(await s.capture('Read', mcp('x'), { input: { issueIdOrKey: 'ORD-17' } }), null);
      assert.equal((await s.fx.kinds(s.task, 'requirement')).length, 1);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a result over 256 KB is cut to 256 KB and its hash is of what is stored; an edited file no longer reads', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET] });
    try {
      await s.capture(GET, mcp('a'.repeat(300 * 1024)), { input: { issueIdOrKey: 'ORD-17' } });
      const stored = await readCapture(s.fx.runtime.fs, s.dir, 'ORD-17', null);
      assert.equal(stored?.content.length, 256 * 1024);
      const file = path.join(s.dir.requirements, (await s.fx.runtime.fs.readdir(s.dir.requirements))[0]!.name);
      await s.fx.runtime.fs.writeText(file, (await readFile(file, 'utf8')).replace('"aaaa', '"bbbb'));
      assert.equal(await readCapture(s.fx.runtime.fs, s.dir, 'ORD-17', null), null);
    } finally {
      await s.fx.dispose();
    }
  });
});

describe('envelope', () => {
  it('captured sources build the envelope with their url and hash; the asked set and missingAsked are recorded', async () => {
    const s = await session({ skill: 'investigate', requirements: [TICKET, PAGE] });
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { input: { issueIdOrKey: 'ORD-17' }, asked: ['ORD-17', 'Orders'] });
      const result = await s.normalize();
      assert.ok(result.state === 'ok' && result.builtFrom === 'captures');
      assert.deepEqual([result.asked, result.missingAsked], [['ORD-17', 'Orders'], ['Orders']]);
      assert.match(result.notices.join(' '), /requirements-partial: Orders/);
      const [entry] = await s.fx.kinds(s.task, 'envelope');
      assert.deepEqual((entry!['sources'] as { key: string; rawHash: string }[]).map((source) => [source.key, source.rawHash]), [['ORD-17', contentHash(jira('ORD-17'))]]);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a review with an asked source missing is refused requirements-missing, recoverably', async () => {
    const s = await session({ requirements: [TICKET, PAGE] });
    try {
      await s.capture(GET, mcp(jira('ORD-17')), { input: { issueIdOrKey: 'ORD-17' }, asked: ['ORD-17', 'Orders'] });
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
        await assert.rejects(s.next(), (error: Error & { code?: string }) => error.code === 'requirements-not-captured' && /Fetch ORD-17/.test(error.message));
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

  it('with nothing to fetch the envelope is one ARGS source', async () => {
    const s = await session({ skill: 'investigate', requirements: [], text: 'which files?' });
    try {
      const result = await s.normalize();
      assert.ok(result.state === 'ok' && result.builtFrom === 'args');
      assert.deepEqual(result.sources.map((source) => source.key), ['ARGS']);
    } finally {
      await s.fx.dispose();
    }
  });
});
