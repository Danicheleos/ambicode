import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { openRouteView } from '../route/context.ts';
import { CONFIG, routeFixture, type RouteFixture } from '../testing/route-fixture.ts';
import { withLedgerLock } from '../task/ledger-lock.ts';
import { resolveTaskDir } from '../task/task-dir.ts';
import { captureRequirement, bindsToServer, type CaptureDeps } from './capture.ts';
import { askedKeys, normalizeEnvelope, type EnvelopeInput } from './envelope.ts';
import { splitAcs } from './acs.ts';
import { hasRequirement } from './has-requirement.ts';
import { requirementsTemplate } from './template.ts';
import type { RouteArgs } from '../route/flags.ts';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const ROUTE = `skill: investigate
version: 3
budget: { modelSteps: 6 }
exits: [done, blocked, human, inconclusive, superseded, budget]
revisable: []
steps:
  - id: read
    actor: model
    instruction: "Read."
`;
const SERVER = 'atlassian';

const jira = (key: string, fields: object) => JSON.stringify({ key, fields: { summary: `Summary ${key}`, description: `Body of ${key}`, issuetype: { name: 'Story' }, assignee: { displayName: 'NOT_THE_TICKET' }, ...fields } });
const mcp = (text: string) => ({ content: [{ type: 'text', text }] });

async function session(text = 'ORD-17 which files?', requirements: string[] = []) {
  const fx = await routeFixture({ routes: { investigate: ROUTE }, config: CONFIG.replace('mcpServer: null', `mcpServer: ${SERVER}`) });
  await fx.engine.start({ skill: 'investigate', text, requirements, task: 'ORD-17', cwd: fx.repo.root, session: A, channel: 'hook' });
  const dir = await resolveTaskDir(fx.runtime, 'ORD-17');
  const args = ((await fx.kinds('ORD-17', 'route'))[0]!['args']) as RouteArgs;
  const under = <T>(body: (deps: Omit<CaptureDeps, 'mcpServer' | 'asked'> & { fx: RouteFixture }) => Promise<T>): Promise<T> =>
    withLedgerLock(fx.runtime.fs, dir.root, () => new Date(), A, async (ledger) => {
      const view = (await openRouteView(fx.runtime, fx.routes, 'ORD-17', A))!;
      return body({ runtime: fx.runtime, dir, ledger, view, fx });
    });
  const capture = (tool: string, response: unknown, options: { mcpServer?: string | null; asked?: string[] } = {}) =>
    under((deps) => captureRequirement({ hook_event_name: 'PostToolUse', session_id: A, tool_name: tool, tool_response: response }, { ...deps, mcpServer: options.mcpServer === undefined ? SERVER : options.mcpServer, asked: options.asked ?? ['ORD-17'] }));
  const normalize = (overrides: Partial<EnvelopeInput> = {}) => under((deps) => normalizeEnvelope({ ...deps, args, mcpServer: SERVER, ...overrides }));
  return { fx, dir, args, under, capture, normalize };
}

describe('03-Q1 hasRequirement', () => {
  const table: [string, { text: string; requirements?: string[]; headless?: boolean }, string | null, boolean][] = [
    ['a URL in the text', { text: 'look at https://x.atlassian.net/browse/ORD-17' }, null, true],
    ['any --requirement', { text: 'look', requirements: ['https://x/y'] }, null, true],
    ['a bare key as the first word with a server bound', { text: 'ORD-17 why slow' }, 'atlassian', true],
    ['a bare key without a server', { text: 'ORD-17 why slow' }, null, false],
    ['a key inside prose', { text: 'why is ORD-17 slow' }, 'atlassian', false],
    ['headless without --requirement', { text: 'ORD-17 https://x/y', headless: true }, 'atlassian', false],
    ['headless with --requirement', { text: 'x', requirements: ['u'], headless: true }, null, true],
  ];
  for (const [name, input, server, expected] of table) {
    it(name, () => assert.equal(hasRequirement({ text: input.text, requirements: input.requirements ?? [], headless: input.headless ?? false }, { mcpServer: server }), expected));
  }
});

describe('03-Q2 requirementsTemplate', () => {
  it('names the binding first, the calls per source, the child cap before any child read, and ends with the completion command', () => {
    const { text, bytes } = requirementsTemplate({ sources: ['https://x.atlassian.net/browse/ORD-17', 'https://x.atlassian.net/wiki/spaces/A/pages/123/Title'], task: 'ORD-17', mcpServer: 'atlassian' });
    const lines = text.split('\n');
    assert.match(lines[0]!, /Use the atlassian MCP server/);
    assert.ok(text.includes('getJiraIssue ORD-17 fields=summary,description,issuetype,parent,issuelinks'));
    assert.ok(text.includes('searchJiraIssuesUsingJql "parent = ORD-17" fields=key,summary'));
    assert.match(text, /Confluence page .*: read the page in full; list its child pages/);
    assert.ok(text.indexOf('more than 10 hits') > text.indexOf('searchJiraIssuesUsingJql'));
    assert.match(lines.at(-1)!, /route next --task ORD-17/);
    assert.ok(bytes <= 1536);
  });

  it('tells the model to pin the server when none is configured and stays under the byte cap for many sources', () => {
    assert.match(requirementsTemplate({ sources: ['ORD-1'], task: 't', mcpServer: null }).text, /requirements\.mcpServer/);
    const many = requirementsTemplate({ sources: Array.from({ length: 40 }, (_, index) => `https://x/browse/ORD-${index + 1}`), task: 't', mcpServer: 'a' });
    assert.ok(many.bytes <= 1536);
    assert.match(many.text.split('\n').at(-1)!, /route next/);
  });
});

describe('03-Q3 capture binding', () => {
  it('binds on the exact server or on a case-insensitive token, and on nothing else', () => {
    assert.equal(bindsToServer('atlassian', 'atlassian'), true);
    assert.equal(bindsToServer('claude_ai_Atlassian_Rovo', 'atlassian'), true);
    assert.equal(bindsToServer('claude_ai_Linear', 'atlassian'), false);
    assert.equal(bindsToServer('atlassianish', 'atlassian'), false);
  });

  it('captures nothing without a configured server, for another server or for an unknown tool class', async () => {
    const s = await session();
    try {
      const response = mcp(jira('ORD-17', {}));
      assert.equal(await s.capture('mcp__atlassian__getJiraIssue', response, { mcpServer: null }), null);
      assert.equal(await s.capture('mcp__linear__getIssue', response), null);
      assert.equal(await s.capture('mcp__atlassian__createJiraIssue', response), null);
      assert.equal((await s.fx.kinds('ORD-17', 'requirement')).length, 0);
    } finally {
      await s.fx.dispose();
    }
  });
});

describe('03-Q4 capture', () => {
  it('get: writes requirements/<key>.json with the NOT_THE_TICKET fields stripped, one entry, and advances nothing', async () => {
    const s = await session();
    try {
      const before = (await s.fx.ledger('ORD-17')).length;
      const entry = await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-17', { parent: { key: 'ORD-1' }, issuelinks: [{ inwardIssue: { key: 'ORD-9' } }] })));
      assert.deepEqual([entry?.['key'], entry?.['relation'], entry?.['capture'], entry?.['via']], ['ORD-17', 'asked', 'full', 'mcp__atlassian__getJiraIssue']);
      const file = JSON.parse(await readFile(path.join(s.dir.requirements, 'ORD-17.json'), 'utf8'));
      assert.equal(file.title, 'Summary ORD-17');
      assert.equal(file.type, 'Story');
      assert.equal(file.parent, 'ORD-1');
      assert.deepEqual(file.links, ['ORD-9']);
      assert.match(file.content, /Body of ORD-17/);
      assert.doesNotMatch(file.content, /NOT_THE_TICKET/);
      assert.equal((await s.fx.ledger('ORD-17')).length, before + 1);
      assert.equal((await s.fx.kinds('ORD-17', 'step')).filter((row) => row['status'] === 'completed').length, 0);
    } finally {
      await s.fx.dispose();
    }
  });

  it('fetch and read classes capture a Confluence page', async () => {
    const s = await session();
    try {
      const page = JSON.stringify({ id: '123', title: 'Design', body: { storage: { value: '<p>The <b>design</b></p>' } }, version: { number: 4 } });
      const entry = await s.capture('mcp__atlassian__fetch', mcp(page), { asked: ['page-123'] });
      assert.equal(entry?.['key'], 'page-123');
      const file = JSON.parse(await readFile(path.join(s.dir.requirements, 'page-123.json'), 'utf8'));
      assert.equal(file.sourceVersion, '4');
      assert.match(file.content, /The design/);
      assert.equal((await s.capture('mcp__atlassian__readConfluencePage', mcp(page), { asked: ['page-123'] })), null, 'the same raw payload is not recorded twice');
    } finally {
      await s.fx.dispose();
    }
  });

  it('search: reduced on disk to {key, summary} per hit as capture list, and it is not a capture of the listed document', async () => {
    const s = await session();
    try {
      const hits = mcp(JSON.stringify({ issues: [{ key: 'ORD-18', fields: { summary: 'Child A', description: 'long text' } }, { key: 'ORD-19', fields: { summary: 'Child B' } }] }));
      const entry = await s.capture('mcp__atlassian__searchJiraIssuesUsingJql', hits);
      assert.equal(entry?.['capture'], 'list');
      assert.match(String(entry?.['key']), /^search-[0-9a-f]{12}$/);
      const file = JSON.parse(await readFile(path.join(s.dir.requirements, `${String(entry?.['key'])}.json`), 'utf8'));
      assert.deepEqual(file.hits, [{ key: 'ORD-18', summary: 'Child A' }, { key: 'ORD-19', summary: 'Child B' }]);
      const normalized = await s.normalize();
      assert.equal(normalized.state, 'failed', 'the hits are not documents');
    } finally {
      await s.fx.dispose();
    }
  });

  it('03-F1: two chains on one task keep their own captures of the same key', async () => {
    const s = await session();
    const B = 'bbbbbbbb-2222-4222-8222-222222222222';
    try {
      const inLedger = <T>(who: string, body: (deps: Omit<CaptureDeps, 'mcpServer' | 'asked'>) => Promise<T>): Promise<T> =>
        withLedgerLock(s.fx.runtime.fs, s.dir.root, () => new Date(), who, async (ledger) => body({ runtime: s.fx.runtime, dir: s.dir, ledger, view: (await openRouteView(s.fx.runtime, s.fx.routes, 'ORD-17', who))! }));
      const captureAs = (who: string, text: string) => inLedger(who, (deps) => captureRequirement({ hook_event_name: 'PostToolUse', session_id: who, tool_name: 'mcp__atlassian__getJiraIssue', tool_response: mcp(text) }, { ...deps, mcpServer: SERVER, asked: ['ORD-17'] }));
      await captureAs(A, jira('ORD-17', { description: 'Original body' }));
      await s.fx.engine.start({ skill: 'investigate', text: 'ORD-17 changed', requirements: [], task: 'ORD-17', cwd: s.fx.repo.root, session: B, channel: 'hook' });
      await captureAs(B, jira('ORD-17', { description: 'Changed body' }));
      const sourcesOf = async (who: string): Promise<string> => {
        const result = await inLedger(who, (deps) => normalizeEnvelope({ ...deps, args: ((deps.view as { args?: RouteArgs }).args ?? s.args), mcpServer: SERVER }));
        assert.equal(result.state, 'ok');
        return result.state === 'ok' ? result.sources.map((source) => source.content).join('\n') : '';
      };
      assert.match(await sourcesOf(A), /Original body/);
      assert.doesNotMatch(await sourcesOf(A), /Changed body/);
      assert.match(await sourcesOf(B), /Changed body/);
    } finally {
      await s.fx.dispose();
    }
  });

  it('03-F1/03-Q6: an identical response captured by another chain keeps this chain\'s relation, so its unrelated ticket stays dropped', async () => {
    const s = await session();
    const B = 'bbbbbbbb-2222-4222-8222-222222222222';
    try {
      const inLedger = <T>(who: string, body: (deps: Omit<CaptureDeps, 'mcpServer' | 'asked'>) => Promise<T>): Promise<T> =>
        withLedgerLock(s.fx.runtime.fs, s.dir.root, () => new Date(), who, async (ledger) => body({ runtime: s.fx.runtime, dir: s.dir, ledger, view: (await openRouteView(s.fx.runtime, s.fx.routes, 'ORD-17', who))! }));
      const captureAs = (who: string, asked: string[], text: string) => inLedger(who, (deps) => captureRequirement({ hook_event_name: 'PostToolUse', session_id: who, tool_name: 'mcp__atlassian__getJiraIssue', tool_response: mcp(text) }, { ...deps, mcpServer: SERVER, asked }));
      await s.fx.engine.start({ skill: 'investigate', text: 'ORD-18 which files?', requirements: [], task: 'ORD-17', cwd: s.fx.repo.root, session: B, channel: 'hook' });
      await captureAs(B, ['ORD-18'], jira('ORD-18', { description: 'Asked by B' }));
      await captureAs(B, ['ORD-18'], jira('ORD-17', { description: 'Unrelated' }));
      await captureAs(A, ['ORD-17'], jira('ORD-17', { description: 'Unrelated' }));
      const bArgs = ((await s.fx.kinds('ORD-17', 'route')).find((entry) => entry['session'] === B)!['args']) as RouteArgs;
      const result = await inLedger(B, (deps) => normalizeEnvelope({ ...deps, args: bArgs, mcpServer: SERVER }));
      assert.equal(result.state, 'ok');
      assert.deepEqual(result.state === 'ok' ? result.sources.map((source) => source.key) : [], ['ORD-18']);
    } finally {
      await s.fx.dispose();
    }
  });

  it('an unrecognized payload writes nothing', async () => {
    const s = await session();
    try {
      assert.equal(await s.capture('mcp__atlassian__getAccessibleAtlassianResources', mcp('[{"id":"cloud","url":"https://x"}]')), null);
      assert.equal(await s.capture('mcp__atlassian__getJiraIssue', mcp('not json at all')), null);
      assert.equal((await s.fx.kinds('ORD-17', 'requirement')).length, 0);
    } finally {
      await s.fx.dispose();
    }
  });

  it('classifies relation: child by its parent, parent by a captured child, link by a captured link', async () => {
    const s = await session();
    try {
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-17', { parent: { key: 'ORD-1' }, issuelinks: [{ outwardIssue: { key: 'ORD-9' } }] })));
      const child = await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-20', { parent: { key: 'ORD-17' } })));
      const parent = await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-1', {})));
      const link = await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-9', {})));
      assert.deepEqual([child?.['relation'], child?.['derivedFrom']], ['child', 'ORD-17']);
      assert.deepEqual([parent?.['relation'], parent?.['derivedFrom']], ['parent', 'ORD-17']);
      assert.deepEqual([link?.['relation'], link?.['derivedFrom']], ['link', 'ORD-17']);
    } finally {
      await s.fx.dispose();
    }
  });
});

describe('03-Q5/03-Q6/03-Q7 normalize', () => {
  it('asked keys come from --requirement, URLs and a bare first key; prose keys are not asked', () => {
    assert.deepEqual(askedKeys({ requirements: ['https://x.atlassian.net/browse/ORD-5?focus=1'], text: 'ORD-17 see https://x.atlassian.net/wiki/spaces/A/pages/42/T and ORD-99' }), ['ORD-5', 'page-42', 'ORD-17']);
  });

  it('complete captures build the envelope from captures; a list-only hit is not complete; the asked set is recorded', async () => {
    const s = await session('ORD-17 which files?', ['https://x.atlassian.net/browse/ORD-17']);
    try {
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-17', {})));
      const result = await s.normalize();
      assert.equal(result.state, 'ok');
      if (result.state !== 'ok') return;
      assert.equal(result.builtFrom, 'captures');
      assert.deepEqual([result.asked, result.missingAsked, result.notices], [['ORD-17'], [], []]);
      const envelope = (await s.fx.kinds('ORD-17', 'envelope')).at(-1)!;
      assert.deepEqual([envelope['builtFrom'], envelope['asked'], envelope['missingAsked']], ['captures', ['ORD-17'], []]);
      assert.match(String(envelope['hash']), /^sha256:/);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a derived capture with no chain to an asked key is dropped with a notice; a partial capture carries requirements-partial', async () => {
    const s = await session('ORD-17 x https://x.atlassian.net/browse/ORD-18', []);
    try {
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-17', {})), { asked: ['ORD-17', 'ORD-18'] });
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-77', { parent: { key: 'ORD-76' } })), { asked: ['ORD-17', 'ORD-18'] });
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-30', { parent: { key: 'ORD-17' } })), { asked: ['ORD-17', 'ORD-18'] });
      const result = await s.normalize();
      assert.equal(result.state, 'ok');
      if (result.state !== 'ok') return;
      assert.deepEqual(result.sources.map((source) => source.key).sort(), ['ORD-17', 'ORD-30']);
      assert.ok(result.notices.some((notice) => notice.startsWith('requirements-derived-orphan: ORD-77')));
      assert.ok(result.notices.some((notice) => notice.startsWith('requirements-partial: ORD-18')));
      assert.deepEqual(result.missingAsked, ['ORD-18']);
    } finally {
      await s.fx.dispose();
    }
  });

  it('a review with a missing asked source gets the recoverable requirements-missing refusal instead', async () => {
    const s = await session('ORD-17 x https://x.atlassian.net/browse/ORD-18', []);
    try {
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-17', {})), { asked: ['ORD-17', 'ORD-18'] });
      const result = await s.under(async (deps) => normalizeEnvelope({ ...deps, view: { ...deps.view, skill: 'review' }, args: s.args, mcpServer: SERVER }));
      assert.deepEqual(result.state === 'failed' ? [result.code, result.recoverable] : null, ['requirements-missing', true]);
      assert.equal((await s.fx.kinds('ORD-17', 'envelope')).length, 0);
    } finally {
      await s.fx.dispose();
    }
  });

  it('no capture and no requirement is one ARGS source built from the text', async () => {
    const s = await session('why is the cart slow', []);
    try {
      const result = await s.normalize();
      assert.equal(result.state, 'ok');
      if (result.state !== 'ok') return;
      assert.equal(result.builtFrom, 'args');
      assert.deepEqual(result.sources.map((source) => [source.key, source.title, source.content]), [['ARGS', 'why is the cart slow', 'why is the cart slow']]);
    } finally {
      await s.fx.dispose();
    }
  });

  it('no capture with a requirement: not-captured first, the gate second, the args envelope after "continue without"', async () => {
    const s = await session('ORD-17 which files?', []);
    try {
      const first = await s.normalize();
      assert.equal(first.state, 'failed');
      assert.match(first.state === 'failed' ? first.message : '', /Fetch ORD-17/);
      await s.under(async ({ ledger, fx }) => ledger.append({ kind: 'step', route: (await fx.kinds('ORD-17', 'route'))[0]!.id, step: 'ground', actor: 'code', status: 'failed', cause: 'route-next', code: 'requirements-not-captured' }));
      const second = await s.normalize();
      assert.deepEqual(second.state === 'raise' ? second.gate : null, 'requirements-not-captured-twice');
      await s.under(async ({ ledger, fx }) => {
        const route = (await fx.kinds('ORD-17', 'route'))[0]!.id;
        await ledger.append({ kind: 'acceptance', route, gate: 'requirements-not-captured-twice', instance: 'x', answer: 'continue without', via: 'hook' });
      });
      const third = await s.normalize();
      assert.equal(third.state === 'ok' ? third.builtFrom : null, 'args');
    } finally {
      await s.fx.dispose();
    }
  });
});

describe('03-Q8 splitAcs', () => {
  it('prefers an explicit acceptance section, then bullets, then normative sentences, with stable two-digit ids', () => {
    const explicit = splitAcs([{ key: 'ORD-17', content: 'Context\n- not an AC\n\n## Acceptance criteria\n- Cart shows total\n- Empty cart hides pay\n\n## Notes\n- other' }]);
    assert.deepEqual(explicit, [
      { id: 'AC-ORD-17-01', key: 'ORD-17', quote: 'Cart shows total' },
      { id: 'AC-ORD-17-02', key: 'ORD-17', quote: 'Empty cart hides pay' },
    ]);
    assert.deepEqual(splitAcs([{ key: 'ARGS', content: '1. First\n2) Second' }]).map((unit) => unit.id), ['AC-ARGS-01', 'AC-ARGS-02']);
    const prose = splitAcs([{ key: 'ORD-2', content: 'Short. The cart total must include the shipping fee at checkout time. Another line here.' }]);
    assert.deepEqual(prose.map((unit) => unit.quote), ['The cart total must include the shipping fee at checkout time.']);
    assert.deepEqual(splitAcs([{ key: 'ORD-17', content: 'Nothing normative here' }]), []);
  });

  it('the same text gives the same ids', () => {
    const source = [{ key: 'ORD-17', content: '- one\n- two' }];
    assert.deepEqual(splitAcs(source), splitAcs(source));
  });
});

describe('03-T8 requirements commands', () => {
  it('template prints the calls for the asked sources; acs on a task with no envelope says so; normalize finds the owner from the task (5.1)', async () => {
    const { REQUIREMENTS_ACS_OPTIONS, REQUIREMENTS_NORMALIZE_OPTIONS, REQUIREMENTS_TEMPLATE_OPTIONS, runRequirementsAcs, runRequirementsNormalize, runRequirementsTemplate } = await import('../cli/commands/requirements.ts');
    const { parseArgs } = await import('../cli/args.ts');
    const s = await session();
    try {
      const template = await runRequirementsTemplate(s.fx.runtime, parseArgs('requirements template', ['--task', 'ORD-17', '--requirement', 'https://x.atlassian.net/browse/ORD-17'], REQUIREMENTS_TEMPLATE_OPTIONS));
      assert.match(template.text, /getJiraIssue ORD-17/);
      assert.match(template.text, /Use the atlassian MCP server/);
      assert.ok(Buffer.byteLength(template.text) <= 1536);
      const acs = await runRequirementsAcs(s.fx.runtime, parseArgs('requirements acs', ['--task', 'ORD-17'], REQUIREMENTS_ACS_OPTIONS));
      assert.match(acs.text, /No envelope/);
      const normalizeArgs = parseArgs('requirements normalize', ['--task', 'ORD-17'], REQUIREMENTS_NORMALIZE_OPTIONS);
      await assert.rejects(runRequirementsNormalize(s.fx.runtime, normalizeArgs), (error: Error & { code?: string }) => error.code !== 'session-unbound' && /Nothing was captured/.test(error.message));
      await s.capture('mcp__atlassian__getJiraIssue', mcp(jira('ORD-17', {})));
      const normalized = await runRequirementsNormalize(s.fx.runtime, normalizeArgs);
      assert.match(normalized.text, /Envelope built from captures: ORD-17/);
      assert.equal((await s.fx.kinds('ORD-17', 'envelope')).length, 1);
    } finally {
      await s.fx.dispose();
    }
  });
});
