import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { routeFixture , stopRoute } from '#testing/fixtures/route-fixture';
import { handlerRegistry } from './execute.ts';
import { createEngine } from './engine.ts';
import type { Handler, HandlerRegistry, StartInput } from '#types/harness';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const HEAD = (skill: string, extra = '') => `skill: ${skill}\nversion: 3\nrevisable: [${extra}]\nsteps:\n`;

export const INVESTIGATE = `${HEAD('inv')}  - id: template
    actor: code
    when: args.hasRequirement
    run: [t.template]
  - id: fetch
    actor: model
    when: args.hasRequirement
    instruction: "Fetch the requirement.\\nThen run route next."
  - id: ground
    actor: code
    run: [t.ground]
    produces: [envelope, map, "policy{before-work}"]
    repeat: 2
  - id: scope
    actor: human
    when: map.empty
    gate:
      question: "Nothing matched. Where should I look?"
      options: ["search anyway"]
      default: "search anyway"
      onAnswer: { "*": "revise ground --term $answer" }
  - id: read
    actor: model
    payload: [t.ground]
    instruction: "Read the code.\\nKeep two hypotheses."
  - id: report-step
    actor: code
    run: [t.report]
    produces: ["policy{before-report}"]
  - id: write
    actor: model
    instruction: "Write the note."
    produces: ["note{investigation}"]
`;

export interface Counts { template: number; ground: number; report: number; terms: string[][] }

export function investigateHandlers(state: { candidates: number; payload?: string }, counts: Counts): Record<string, Handler> {
  return {
    't.template': async () => {
      counts.template += 1;
      return { state: 'ok', payload: 'template text' };
    },
    't.ground': async ({ ledger, revise }) => {
      counts.ground += 1;
      if (revise?.args['term'] !== undefined) counts.terms.push([...revise.args['term']]);
      const candidates = revise?.args['term'] === undefined ? state.candidates : 2;
      await ledger.append({ kind: 'envelope', sources: [], builtFrom: 'args', asked: [], missingAsked: [], hash: 'h' });
      await ledger.append({ kind: 'map', mode: 'prompt', candidates, layers: [{ name: 'shortlist', ms: 1, hits: candidates }], layersSource: 'default', terms: { pass1: [], pass2: [] }, limitations: [], index: 'none', bytes: 10 });
      await ledger.append({ kind: 'policy', stage: 'before-work', packs: [], rules: 0, omitted: 0, bytes: 10 });
      return { state: 'ok', payload: state.payload ?? 'map text' };
    },
    't.report': async ({ ledger }) => {
      counts.report += 1;
      await ledger.append({ kind: 'policy', stage: 'before-report', packs: [], rules: 0, omitted: 0, bytes: 10 });
      return { state: 'ok', payload: null };
    },
  };
}

const newCounts = (): Counts => ({ template: 0, ground: 0, report: 0, terms: [] });

async function inv(options: { candidates?: number; payload?: string; config?: string | null; extraRoutes?: Record<string, string>; handlers?: Record<string, Handler> } = {}) {
  const counts = newCounts();
  const state = { candidates: options.candidates ?? 3, ...(options.payload === undefined ? {} : { payload: options.payload }) };
  const fx = await routeFixture({
    routes: { inv: INVESTIGATE, ...(options.extraRoutes ?? {}) },
    handlers: { ...investigateHandlers(state, counts), ...(options.handlers ?? {}) },
    ...(options.config === undefined ? {} : { config: options.config }),
  });
  const start = (input: Partial<StartInput> = {}) =>
    fx.engine.start({ skill: 'inv', text: 'how does the cart work', requirements: [], task: 'cart', cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad, ...input });
  const next = (input: Partial<Parameters<typeof fx.engine.advance>[0]> = {}) =>
    fx.engine.advance({ task: 'cart', session: A, cause: 'route-next', scratchpadDir: fx.scratchpad, ...input });
  return { fx, counts, state, start, next };
}

const stepRows = (entries: { kind: string; [k: string]: unknown }[]): string[] =>
  entries.filter((entry) => entry.kind === 'step').map((entry) => `${entry['step']}:${entry['status']}`);

describe('engine: entry points and the one algorithm', () => {
  it('03-E1/03-E4: start runs the reachable code and delivers the first model step; route next completes it and continues', async () => {
    const { fx, counts, start, next } = await inv();
    try {
      const first = await start();
      assert.equal(first.task, 'cart');
      assert.equal(first.position, 'read');
      assert.equal(counts.ground, 1);
      assert.equal(counts.template, 0);
      assert.match(first.text, /^\[ambicode\] inv · task cart · step read \(5\/7\)\nNow: Read the code\.\nThen: .*route next --task cart/);
      assert.match(first.text, /## t\.ground\nmap text/);
      assert.deepEqual(stepRows(await fx.ledger('cart')), ['template:skipped', 'fetch:skipped', 'ground:completed', 'scope:skipped', 'read:delivered']);
      const second = await next();
      assert.equal(second.position, 'write');
      assert.equal(counts.report, 1);
      assert.equal(counts.ground, 1);
      assert.deepEqual(stepRows(await fx.ledger('cart')).slice(5), ['read:completed', 'report-step:completed', 'write:delivered']);
    } finally {
      await fx.dispose();
    }
  });

  it('03-E1/03-E3: a command tail at a model step completes it exactly as route next does; delivery alone completes nothing', async () => {
    const { fx, start, next } = await inv();
    try {
      await start();
      assert.equal((await fx.kinds('cart', 'step')).some((entry) => entry['step'] === 'read' && entry['status'] === 'completed'), false);
      await next({ cause: 'requirements normalize' });
      const completed = (await fx.kinds('cart', 'step')).filter((entry) => entry['step'] === 'read' && entry['status'] === 'completed');
      assert.equal(completed.length, 1);
      assert.equal(completed[0]!['cause'], 'requirements normalize');
    } finally {
      await fx.dispose();
    }
  });

  it('03-E2: a same-session start supersedes the live route on the same task and begins a new one', async () => {
    const { fx, counts, start } = await inv();
    try {
      const first = await start();
      const again = await start();
      assert.equal(again.position, first.position);
      assert.notEqual(again.routeId, first.routeId);
      assert.equal(counts.ground, 2);
      const exits = await fx.kinds('cart', 'exit');
      assert.deepEqual(exits.map((entry) => [entry['route'], entry['reason']]), [[first.routeId, 'superseded']]);
    } finally {
      await fx.dispose();
    }
  });

  it('03-E1: a start whose delivery was lost begins a fresh route; the lost one is superseded', async () => {
    const { fx, start } = await inv();
    try {
      const first = await start();
      const file = path.join(fx.repo.root, '.ambicode', 'task', 'cart', 'ledger.jsonl');
      const lines = (await readFile(file, 'utf8')).trim().split('\n');
      assert.equal(JSON.parse(lines.at(-1)!).status, 'delivered');
      await writeFile(file, `${lines.slice(0, -1).join('\n')}\n`);
      const restarted = await start();
      assert.equal(restarted.position, 'read');
      assert.notEqual(restarted.routeId, first.routeId);
      assert.equal((await fx.kinds('cart', 'exit')).at(-1)?.['reason'], 'superseded');
    } finally {
      await fx.dispose();
    }
  });

  it('03-E2b: a start on another task supersedes the session route found through the pointer', async () => {
    const { fx, start } = await inv();
    try {
      const first = await start({ task: 'one' });
      await start({ task: 'two' });
      assert.deepEqual((await fx.kinds('one', 'exit')).map((entry) => [entry['route'], entry['reason']]), [[first.routeId, 'superseded']]);
      assert.equal((await fx.kinds('two', 'exit')).length, 0);
    } finally {
      await fx.dispose();
    }
  });
});

const REVISABLE_TEMPLATE = `${HEAD('rt', 'template')}  - id: template
    actor: code
    run: [t.template]
    repeat: 2
  - id: read
    actor: model
    instruction: "Read."
  - id: finish
    actor: model
    instruction: "Finish."
`;

describe('engine: templates, scope revises and re-entry (S9)', () => {
  it('S9/03-F12: the template completes once; a scope revise does not rerun it; a scope revise re-enters ground only', async () => {
    const { fx, counts, state, start, next } = await inv({ candidates: 0 });
    try {
      const requirement = 'https://example.invalid/browse/ORD-17';
      const first = await start({ requirements: [requirement], task: 'ORD-17' });
      assert.equal(first.position, 'fetch');
      assert.equal(counts.template, 1);
      assert.equal(counts.ground, 0);

      const gate = await next({ task: 'ORD-17' });
      assert.equal(gate.position, 'scope');
      assert.match(gate.text, /Nothing matched\. Where should I look\?\n.*search anyway.*default if nobody answers/s);
      assert.match(gate.text, /\[ambicode gate scope aaaaaaaa-\d+\]/);
      assert.equal(counts.ground, 1);
      await next({ task: 'ORD-17' });
      assert.equal(counts.template, 1);
      assert.equal(counts.ground, 1);

      state.candidates = 0;
      const after = await next({ task: 'ORD-17', answers: [{ gate: 'scope', option: 'src/cart' }] });
      assert.equal(after.position, 'read');
      assert.equal(counts.template, 1);
      assert.equal(counts.ground, 2);
      assert.deepEqual(counts.terms, [['src/cart']]);
      const entries = await fx.ledger('ORD-17');
      assert.equal(entries.filter((entry) => entry.kind === 'step' && entry['step'] === 'template' && entry['status'] === 'completed').length, 1);
      const revise = entries.find((entry) => entry.kind === 'revise')!;
      assert.deepEqual([revise['from'], revise['via'], revise['args']], ['ground', 'model', { term: ['src/cart'] }]);
    } finally {
      await fx.dispose();
    }
  });

  it('S9: a route that lists the template as revisable with repeat 2 reruns it once, then refuses with a limit', async () => {
    const counts = newCounts();
    const fx = await routeFixture({ routes: { rt: REVISABLE_TEMPLATE }, handlers: investigateHandlers({ candidates: 1 }, counts) });
    try {
      const base = { skill: 'rt', text: 'x', requirements: [], task: 't1', cwd: fx.repo.root, session: A, channel: 'hook' as const };
      await fx.engine.start(base);
      assert.equal(counts.template, 1);
      const again = await fx.engine.advance({ task: 't1', session: A, cause: 'route-next', revise: 'template' });
      assert.equal(counts.template, 2);
      assert.equal(again.position, 'read');
      const completed = (await fx.kinds('t1', 'step')).filter((entry) => entry['step'] === 'template' && entry['status'] === 'completed');
      assert.equal(completed.length, 2);
      const refused = await fx.engine.advance({ task: 't1', session: A, cause: 'route-next', revise: 'template' });
      assert.equal(counts.template, 2);
      assert.match(refused.text, /repeat limit is spent/);
      assert.deepEqual((await fx.kinds('t1', 'limit')).map((entry) => [entry['which'], entry['step']]), [['repeat', 'template']]);
      await assert.rejects(fx.engine.advance({ task: 't1', session: A, cause: 'route-next', revise: 'read' }), (error: Error & { code?: string }) => error.code === 'revise-not-allowed');
    } finally {
      await fx.dispose();
    }
  });
});
