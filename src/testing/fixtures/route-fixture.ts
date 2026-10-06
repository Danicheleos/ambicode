import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRuntime } from '#composition/root';
import { fsActiveRoutePointer } from '#harness/session/active-route';
import { createEngine } from '#harness/engine/engine';
import { handlerRegistry } from '#harness/engine/handlers';
import { loadRoute, routeRegistry } from '#harness/definition/routes';
import { parseRegistry } from '#harness/gates/gates';
import { readLedger } from '#modules/evidence/ledger/ledger';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { TempRepo } from './temp-repo.ts';
import { REPO_ROOT } from '../paths.ts';
import type { Runtime } from '#types/composition';
import { KINDS, type LedgerEntry } from '#types/modules/evidence';
import { HANDLER_NAMES, type ActiveRoutePointer, type Engine, type Handler, type HandlerRegistry, type RouteDef, type RouteRegistry } from '#types/harness';


export const CONFIG = [
  'schemaVersion: 3',
  'baseline: origin/main',
  'review: { model: sonnet, timeoutSeconds: 300, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288 }',
  'checks: { timeoutSeconds: 120, maxSelectedTestFiles: 20 }',
  'page: { idleTimeoutSeconds: 1800, port: 45831 }',
  'requirements: { mcpServer: null }',
  'remoteChecks: { image: null }',
  'projects:',
  '  - { id: app, root: ".", ecosystem: typescript }',
].join('\n');

export interface RouteFixture {
  repo: TempRepo;
  runtime: Runtime;
  routes: RouteRegistry;
  engine: Engine;
  pointer: ActiveRoutePointer;
  scratchpad: string;
  ledger(task: string): Promise<LedgerEntry[]>;
  kinds(task: string, kind: string): Promise<LedgerEntry[]>;
  advanceClock(ms: number): void;
  rebuild(handlers: Record<string, Handler>): Engine;
  dispose(): Promise<void>;
}

export interface Assembled { runtime: Runtime; routes: RouteRegistry; pointer: ActiveRoutePointer; build(handlers: Record<string, Handler>): Engine }

/** The engine over an existing repository: what a second process attached to the same task directory builds. */
export async function assembleEngine(options: { root: string; routes: Record<string, string>; handlers?: readonly string[]; step?: Record<string, string>; clock?: () => Date }): Promise<Assembled> {
  const clock = options.clock ?? ((): Date => new Date());
  const runtime = await createRuntime({ cwd: options.root, clock: { now: clock, elapsed: () => 0 } });
  const handlerNames = [...HANDLER_NAMES, ...(options.handlers ?? [])];
  const registry = parseRegistry('routes/gates.yaml', await readFile(path.join(REPO_ROOT, 'routes', 'gates.yaml'), 'utf8'), KINDS);
  const context = { root: REPO_ROOT, handlers: handlerNames, readInstruction: async (relative: string) => options.step?.[relative] ?? '' };
  const defs: RouteDef[] = [];
  for (const [name, text] of Object.entries(options.routes)) defs.push(await loadRoute(`routes/${name}/${name}.yaml`, text, context, registry));
  const routes = routeRegistry({ routes: defs, registry });
  const pointer = fsActiveRoutePointer(runtime.fs);
  return {
    runtime,
    routes,
    pointer,
    build: (handlers) => createEngine({ runtime, routes, handlers: handlerRegistry(handlers) as HandlerRegistry, pointer }),
  };
}

export async function routeFixture(options: {
  routes: Record<string, string>;
  handlers?: Record<string, Handler>;
  step?: Record<string, string>;
  config?: string | null;
}): Promise<RouteFixture> {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{}\n');
  if (options.config !== null) await repo.write('.ambicode/config.yaml', options.config ?? CONFIG);
  await repo.commitAll('initial');
  let time = new Date(2026, 9, 5, 10, 0, 0).getTime();
  const assembled = await assembleEngine({ root: repo.root, routes: options.routes, handlers: Object.keys(options.handlers ?? {}), ...(options.step === undefined ? {} : { step: options.step }), clock: () => new Date(time) });
  const { runtime, routes, pointer, build } = assembled;
  const scratchpad = await runtime.fs.temporaryDirectory('ambicode-scratch-');
  const dir = (task: string): string => path.join(repo.root, '.ambicode', 'task', task);
  return {
    repo,
    runtime,
    routes,
    engine: build(options.handlers ?? {}),
    pointer,
    scratchpad,
    ledger: (task) => readLedger(nodeFileSystem, dir(task)),
    kinds: async (task, kind) => (await readLedger(nodeFileSystem, dir(task))).filter((entry) => entry.kind === kind),
    advanceClock: (ms) => {
      time += ms;
    },
    rebuild: build,
    dispose: async () => {
      await repo.dispose();
      await runtime.fs.remove(scratchpad);
    },
  };
}
