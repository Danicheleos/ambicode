import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { openRouteView } from '../route/context.ts';
import { defaultHandlers, type Handler } from '../route/handlers.ts';
import type { StartInput } from '../route/engine.ts';
import type { RouteArgs } from '../route/flags.ts';
import { CONFIG, routeFixture, type RouteFixture } from '../testing/route-fixture.ts';
import { withLedgerLock } from '../task/ledger-lock.ts';
import { resolveTaskDir } from '../task/task-dir.ts';
import { captureRequirement, type CaptureDeps } from './capture.ts';
import { normalizeEnvelope, type EnvelopeInput } from './envelope.ts';

export const A = 'aaaaaaaa-1111-4111-8111-111111111111';
export const FIXTURE_ROUTE = path.resolve(import.meta.dirname, '..', 'route', 'fixtures', 'review-requirements.yaml');

export const jira = (key: string, fields: object = {}): string =>
  JSON.stringify({ key, fields: { summary: `Summary ${key}`, description: `Body of ${key}`, issuetype: { name: 'Story' }, assignee: { displayName: 'NOT_THE_TICKET' }, ...fields } });
export const mcp = (text: string): { content: { type: string; text: string }[] } => ({ content: [{ type: 'text', text }] });
export const search = (keys: readonly string[], total?: number): ReturnType<typeof mcp> =>
  mcp(JSON.stringify({ ...(total === undefined ? {} : { total }), issues: keys.map((key) => ({ key, fields: { summary: `Summary ${key}` } })) }));

export interface SessionOptions {
  skill?: string;
  /** The route file's text; the review fixture by default. */
  route?: string;
  server?: string | null;
  text?: string;
  requirements?: string[];
  headless?: boolean;
  handlers?: Record<string, Handler>;
  task?: string;
  /** The shipped investigate route and its step texts, over a two-file repository. */
  shipped?: boolean;
}

/** A started route over a real temporary repository, with capture and normalize driven the way the hook and ground drive them. */
export async function session(options: SessionOptions = {}) {
  const skill = options.skill ?? 'review';
  const task = options.task ?? 'ORD-17';
  const server = options.server === undefined ? 'atlassian' : options.server;
  const root = path.resolve(import.meta.dirname, '..', '..');
  const route = options.shipped === true ? await readFile(path.join(root, 'routes', 'investigate.yaml'), 'utf8') : (options.route ?? (await readFile(FIXTURE_ROUTE, 'utf8')).replace('skill: review', `skill: ${skill}`));
  const step: Record<string, string> = {};
  if (options.shipped === true) for (const name of ['investigate-fetch', 'investigate-read']) step[`routes/steps/${name}.md`] = await readFile(path.join(root, 'routes', 'steps', `${name}.md`), 'utf8');
  const fx = await routeFixture({
    routes: { [skill]: route },
    handlers: { ...defaultHandlers(), ...options.handlers },
    config: server === null ? CONFIG : CONFIG.replace('mcpServer: null', `mcpServer: ${server}`),
    ...(options.shipped === true ? { step } : {}),
  });
  if (options.shipped === true) {
    await fx.repo.write('src/cart.ts', 'export function addToCart(items: string[], item: string): string[] {\n  return [...items, item];\n}\n');
    await fx.repo.commitAll('cart');
  }
  const startInput: StartInput = {
    skill, text: options.text ?? 'ORD-17 which files?', requirements: options.requirements ?? ['https://x.atlassian.net/browse/ORD-17'], task, cwd: fx.repo.root, session: A, channel: 'hook',
    scratchpadDir: fx.scratchpad, ...(options.headless === true ? { headless: true } : {}),
  };
  const started = await fx.engine.start(startInput);
  const dir = await resolveTaskDir(fx.runtime, task);
  const args = ((await fx.kinds(task, 'route'))[0]!['args']) as RouteArgs;
  const under = <T>(body: (deps: Omit<CaptureDeps, 'mcpServer' | 'asked'> & { fx: RouteFixture }) => Promise<T>): Promise<T> =>
    withLedgerLock(fx.runtime.fs, dir.root, () => new Date(), A, async (ledger) => {
      const view = (await openRouteView(fx.runtime, fx.routes, task, A))!;
      return body({ runtime: fx.runtime, dir, ledger, view, fx });
    });
  const capture = (tool: string, response: unknown, extra: { server?: string | null; asked?: string[]; input?: Record<string, unknown> } = {}) =>
    under((deps) => captureRequirement(
      { hook_event_name: 'PostToolUse', session_id: A, tool_name: tool, tool_response: response, ...(extra.input === undefined ? {} : { tool_input: extra.input }) } as never,
      { ...deps, mcpServer: extra.server === undefined ? server : extra.server, asked: extra.asked ?? [task] },
    ));
  const normalize = (overrides: Partial<EnvelopeInput> = {}) => under((deps) => normalizeEnvelope({ ...deps, args, mcpServer: server, ...overrides }));
  const next = (input: Partial<Parameters<typeof fx.engine.advance>[0]> = {}) => fx.engine.advance({ task, session: A, cause: 'route-next', scratchpadDir: fx.scratchpad, ...input });
  const exits = async (): Promise<string[]> => (await fx.kinds(task, 'exit')).map((entry) => String(entry['reason']));
  return { fx, dir, args, started, under, capture, normalize, next, exits, task };
}
