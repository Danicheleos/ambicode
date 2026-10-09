import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { handlerRegistry } from './handlers.ts';
import { createEngine } from './engine.ts';
import type { Handler, HandlerRegistry, StartInput } from '#types/harness';
import type { IndexStatus } from '#types/modules/search';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const HEAD = (skill: string, extra = '') => `skill: ${skill}\nversion: 3\nbudget: { modelSteps: 6 }\nexits: [done, blocked, human, inconclusive, superseded, budget]\nrevisable: [${extra}]\nsteps:\n`;

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
      release: "search anyway"
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

  it('step entries carry timing, budget use and the printed size; the exit carries the budget spent', async () => {
    const { fx, start, next } = await inv();
    try {
      const first = await start();
      await next();
      await fx.engine.stop('cart', A, 'blocked', undefined, fx.scratchpad);
      const steps = await fx.kinds('cart', 'step');
      const ground = steps.find((entry) => entry['step'] === 'ground' && entry['status'] === 'completed');
      const read = steps.find((entry) => entry['step'] === 'read' && entry['status'] === 'delivered');
      assert.equal(typeof ground?.['ms'], 'number');
      assert.deepEqual([read?.['payloadBytes'], read?.['payloadTokens']], [first.bytes, Math.ceil(first.bytes / 4)]);
      assert.equal((read?.['budget'] as { modelSteps: number }).modelSteps, 1);
      const exit = (await fx.kinds('cart', 'exit')).at(-1);
      assert.equal(typeof (exit?.['budget'] as { modelSteps: number } | undefined)?.modelSteps, 'number');
    } finally {
      await fx.dispose();
    }
  });

  it('D5: a delivered step entry carries `answer` exactly when the step declares answer: note', async () => {
    const answering = INVESTIGATE.replace('    produces: ["note{investigation}"]\n', '    produces: ["note{investigation}"]\n    answer: note\n');
    assert.notEqual(answering, INVESTIGATE);
    const { fx, start, next } = await inv({ extraRoutes: { inv: answering } });
    try {
      await start();
      await next();
      const delivered = (await fx.kinds('cart', 'step')).filter((entry) => entry['status'] === 'delivered' && entry['actor'] === 'model');
      assert.deepEqual(delivered.map((entry) => [entry['step'], entry['answer']]), [['read', undefined], ['write', 'note']]);
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

  it('03-E2: a same-session start with the same args reprints and writes no completion, no counter, no rerun', async () => {
    const { fx, counts, start } = await inv();
    try {
      const first = await start();
      const before = await fx.ledger('cart');
      const again = await start();
      assert.equal(again.position, first.position);
      assert.equal(again.text.split('\n')[0], first.text.split('\n')[0]);
      assert.equal(counts.ground, 1);
      assert.deepEqual(await fx.ledger('cart'), before);
    } finally {
      await fx.dispose();
    }
  });

  it('03-E1: an interrupted start (outputs recorded, delivery lost) only delivers on the next entry point', async () => {
    const { fx, counts, start } = await inv();
    try {
      await start();
      const file = path.join(fx.repo.root, '.ambicode', 'task', 'cart', 'ledger.jsonl');
      const lines = (await readFile(file, 'utf8')).trim().split('\n');
      assert.equal(JSON.parse(lines.at(-1)!).status, 'delivered');
      await writeFile(file, `${lines.slice(0, -1).join('\n')}\n`);
      const resumed = await start();
      assert.equal(resumed.position, 'read');
      assert.equal(counts.ground, 1);
      const rows = stepRows(await fx.ledger('cart'));
      assert.equal(rows.filter((row) => row === 'ground:completed').length, 1);
      assert.equal(rows.filter((row) => row === 'read:delivered').length, 1);
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
  it('S9/03-F12: the template completes once; resumes do not rerun it; a scope revise re-enters ground only', async () => {
    const { fx, counts, state, start, next } = await inv({ candidates: 0 });
    try {
      const requirement = 'https://example.invalid/browse/ORD-17';
      const first = await start({ requirements: [requirement], task: 'ORD-17' });
      assert.equal(first.position, 'fetch');
      assert.equal(counts.template, 1);
      assert.equal(counts.ground, 0);
      await start({ requirements: [requirement], task: 'ORD-17' });
      assert.equal(counts.template, 1);

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

describe('05-B6 index build at route start', () => {
  const status = (state: IndexStatus['state']): IndexStatus => ({ tool: 'codeindex', state, fresh: false, builtMs: null, reason: state === 'error' ? 'boom' : null, drift: null });

  async function withIndex(startIndex: () => Promise<IndexStatus>) {
    const handlers = investigateHandlers({ candidates: 3 }, newCounts());
    const fx = await routeFixture({ routes: { inv: INVESTIGATE }, handlers });
    const calls: { project: string; routeAlreadyWritten: boolean; task: string }[] = [];
    let task = '';
    const engine = createEngine({
      runtime: fx.runtime,
      routes: fx.routes,
      handlers: handlerRegistry(handlers) as HandlerRegistry,
      pointer: fx.pointer,
      startIndex: async (_deps, project) => {
        calls.push({ project: project.id, routeAlreadyWritten: (await fx.kinds(task, 'route')).length === 1, task });
        return startIndex();
      },
    });
    const start = (channel: 'hook' | 'cli', name: string) => {
      task = name;
      return engine.start({ skill: 'inv', text: 'how does the cart work', requirements: [], task: name, cwd: fx.repo.root, session: A, channel, scratchpadDir: fx.scratchpad });
    };
    return { fx, engine, calls, start };
  }

  it('05-B6: start calls startIndexBuild once per start channel, after the route entry; advance does not', async () => {
    const { fx, engine, calls, start } = await withIndex(async () => status('building'));
    try {
      for (const channel of ['hook', 'cli'] as const) {
        const message = await start(channel, `cart-${channel}`);
        assert.equal(message.position, 'read');
        assert.deepEqual(calls.filter((call) => call.task === `cart-${channel}`), [{ project: 'app', routeAlreadyWritten: true, task: `cart-${channel}` }]);
      }
      assert.equal(calls.length, 2);
      await engine.advance({ task: 'cart-cli', session: A, cause: 'route-next', scratchpadDir: fx.scratchpad });
      assert.equal(calls.length, 2);
    } finally {
      await fx.dispose();
    }
  });

  it('05-B6: a start whose build status is error, or whose build rejects, still completes', async () => {
    const rows: [string, () => Promise<IndexStatus>][] = [['error status', async () => status('error')], ['rejection', async () => Promise.reject(new Error('spawn exploded'))]];
    for (const [title, startIndex] of rows) {
      const { fx, calls, start } = await withIndex(startIndex);
      try {
        assert.equal((await start('hook', 'cart')).position, 'read', title);
        assert.equal(calls.length, 1);
      } finally {
        await fx.dispose();
      }
    }
  });
});

const WORKER_ROUTE = `${HEAD('wk')}  - id: scout
    actor: worker
    gate:
      question: "Run the scout worker?"
      options: [run, inline, skip]
      default: skip
      release: skip
  - id: write
    actor: model
    instruction: "Write it."
`;

describe('engine: headless visibility and worker steps (B18, B15)', () => {
  it('B18: a model-set headless start says so, a user-set one says that, and route status shows mode, channel and the defaults taken', async () => {
    for (const [channel, said] of [['cli', /headless \(set by the model\)/], ['hook', /headless \(set by the user\)/]] as const) {
      const { fx, start } = await inv({ candidates: 0 });
      try {
        const first = await start({ headless: true, channel, task: `cart-${channel}` });
        assert.match(first.text, said);
        const [position] = await fx.engine.status(`cart-${channel}`, null);
        assert.equal(position?.mode, 'headless');
        assert.equal(position?.channel, channel);
        assert.deepEqual(position?.decisions.map((entry) => [entry.kind, entry['gate']]), [['default-taken', 'scope']]);
      } finally {
        await fx.dispose();
      }
    }
  });

  it('B15: a worker step prints a run/inline/skip gate and does not throw; the default skips it and records the skip', async () => {
    const fx = await routeFixture({ routes: { wk: WORKER_ROUTE } });
    try {
      const input = { skill: 'wk', text: 'go', requirements: [], task: 'w1', cwd: fx.repo.root, session: A, channel: 'hook' as const, scratchpadDir: fx.scratchpad };
      const first = await fx.engine.start(input);
      assert.equal(first.position, 'scout');
      assert.match(first.text, /Run the scout worker\?/);
      const headless = await fx.engine.start({ ...input, task: 'w2', headless: true, session: 'bbbbbbbb-1111-4111-8111-111111111111' });
      assert.equal(headless.position, 'write');
      assert.deepEqual((await fx.kinds('w2', 'worker')).map((entry) => [entry['worker'], entry['outcome']]), [['scout', 'skipped']]);
    } finally {
      await fx.dispose();
    }
  });

  it('B15: a run answer for a worker that is not in workers.approved is not run and records inline', async () => {
    const fx = await routeFixture({ routes: { wk: WORKER_ROUTE } });
    try {
      await fx.engine.start({ skill: 'wk', text: 'go', requirements: [], task: 'w1', cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      const print = (await fx.kinds('w1', 'gate')).at(-1)!;
      const after = await fx.engine.advance({ task: 'w1', session: A, cause: 'gate-hook', scratchpadDir: fx.scratchpad, answers: [{ gate: 'scout', option: 'run', instance: print.id }] });
      assert.equal(after.position, 'write');
      assert.deepEqual((await fx.kinds('w1', 'worker')).map((entry) => [entry['outcome'], entry['reason']]), [['inline', 'not in workers.approved']]);
    } finally {
      await fx.dispose();
    }
  });
});
