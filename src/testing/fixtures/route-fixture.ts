import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRuntime } from '#composition/root';
import { latestRouteOf } from '#harness/engine/fold';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { createEngine } from '#harness/engine/engine';
import { handlerRegistry } from '#harness/engine/execute';
import { scriptHandler } from '#harness/engine/script';
import { loadRoute, routeRegistry } from '#harness/definition/routes';
import { parseRegistry } from '#harness/gates/gates';
import { readLedger } from '#platform/ledger/ledger';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { TempRepo } from './temp-repo.ts';
import { REPO_ROOT } from '../paths.ts';
import type { Runtime } from '#types/composition';
import type { ProcessRunner } from '#types/platform/ports';
import { KINDS, type LedgerEntry } from '#types/modules/evidence';
import { HANDLER_NAMES, type Engine, type Handler, type HandlerRegistry, type RouteDef, type RouteRegistry } from '#types/harness';

const RUN = 'model: sonnet, effort: medium, timeoutMinutes: 15';

/** Everything above `projects:`; the review limits are the ones tests assert against. */
export const CONFIG_HEAD = [
  'schemaVersion: 5',
  'id: repo',
  'baseline: origin/main',
  'context: { maxTotalTokens: 24000, maxFileTokens: 2500, maxIndexTokens: 5000 }',
  'skills:',
  `  init: { ${RUN}, scout: { ${RUN} } }`,
  `  review: { ${RUN}, maxFindings: 7, maxChangedFiles: 50, maxChangedLines: 2000, maxContextBytes: 524288, excludePaths: [] }`,
  `  task: { ${RUN}, checkTimeoutSeconds: 120 }`,
  `  plan: { ${RUN} }`,
  `  investigate: { ${RUN} }`,
  `  rules: { ${RUN} }`,
  'requirements: { runtimes: {}, mcps: [], lsps: [], env: [] }',
  'projects:',
].join('\n');

export const CONFIG = `${CONFIG_HEAD}\n  - { id: app, root: ".", paths: [src/], ecosystem: { languages: [typescript], frameworks: [], packageManager: null } }`;

export interface RouteFixture {
  repo: TempRepo;
  runtime: Runtime;
  routes: RouteRegistry;
  engine: Engine;
  scratchpad: string;
  ledger(task: string): Promise<LedgerEntry[]>;
  kinds(task: string, kind: string): Promise<LedgerEntry[]>;
  advanceClock(ms: number): void;
  rebuild(handlers: Record<string, Handler>): Engine;
  dispose(): Promise<void>;
}

/** A review run lives under reviews/, every other route under tasks/. */
function runDirOf(root: string, task: string): string {
  const reviews = path.join(root, '.ambicode', 'reviews', task);
  return existsSync(path.join(reviews, 'ledger.jsonl')) ? reviews : path.join(root, '.ambicode', 'tasks', task);
}

/** Ends the session's open route as the removed `route stop` did: an `exit` entry, . */
export async function stopRoute(fx: Pick<RouteFixture, 'runtime'>, task: string, session: string, reason: string, detail?: string): Promise<void> {
  const root = runDirOf(fx.runtime.cwd, task);
  await withLedgerLock(fx.runtime.fs, root, () => fx.runtime.clock.now(), async (ledger) => {
    const read = await ledger.read();
    const route = read.state === 'ok' ? latestRouteOf(read.entries, session) : null;
    if (route === null) throw new Error(`no route of ${session} on ${task}`);
    await ledger.append({ kind: 'exit', route: route.id, reason, ...(detail === undefined ? {} : { detail }) });
  });
}

interface Assembled { runtime: Runtime; routes: RouteRegistry; build(handlers: Record<string, Handler>): Engine }

/** The engine over an existing repository: what a second process attached to the same task directory builds. */
export async function assembleEngine(options: { root: string; routes: Record<string, string>; handlers?: readonly string[]; step?: Record<string, string>; clock?: () => Date; pluginRoot?: string; wrapRunner?: (real: ProcessRunner) => ProcessRunner }): Promise<Assembled> {
  const clock = options.clock ?? ((): Date => new Date());
  const real = await createRuntime({ cwd: options.root, clock: { now: clock, elapsed: () => 0 }, ...(options.pluginRoot === undefined ? {} : { pluginRoot: options.pluginRoot }) });
  // The engine's own handlers run checks through the runtime's runner, so a test that scripts check output wraps it here, not after the engine is built.
  const runtime: Runtime = options.wrapRunner === undefined ? real : { ...real, runner: options.wrapRunner(real.runner) };
  const handlerNames = [...HANDLER_NAMES, ...(options.handlers ?? [])];
  const registry = parseRegistry('routes/gates.yaml', await readFile(path.join(REPO_ROOT, 'routes', 'gates.yaml'), 'utf8'), KINDS);
  const context = { handlers: handlerNames, readInstruction: async (relative: string) => options.step?.[relative] ?? '' };
  const defs: RouteDef[] = [];
  for (const [name, text] of Object.entries(options.routes)) defs.push(await loadRoute(`routes/${name}/${name}.yaml`, text, context));
  const routes = routeRegistry({ routes: defs, registry });
  return {
    runtime,
    routes,
    build: (handlers) => createEngine({ runtime, routes, handlers: handlerRegistry({ script: scriptHandler, ...handlers }) as HandlerRegistry }),
  };
}

export async function routeFixture(options: {
  routes: Record<string, string>;
  handlers?: Record<string, Handler>;
  step?: Record<string, string>;
  config?: string | null;
  /** Where `skills/<skill>/scripts/*.mjs` are read from for `run: script(<name>)` steps; the repository by default. */
  pluginRoot?: string;
  wrapRunner?: (real: ProcessRunner) => ProcessRunner;
}): Promise<RouteFixture> {
  const repo = await TempRepo.create();
  await repo.write('package.json', '{}\n');
  if (options.config !== null) await repo.write('.ambicode/config.yaml', options.config ?? CONFIG);
  await repo.commitAll('initial');
  let time = new Date(2026, 9, 5, 10, 0, 0).getTime();
  const assembled = await assembleEngine({ root: repo.root, routes: options.routes, handlers: Object.keys(options.handlers ?? {}), ...(options.step === undefined ? {} : { step: options.step }), ...(options.pluginRoot === undefined ? {} : { pluginRoot: options.pluginRoot }), ...(options.wrapRunner === undefined ? {} : { wrapRunner: options.wrapRunner }), clock: () => new Date(time) });
  const { runtime, routes, build } = assembled;
  const scratchpad = await runtime.fs.temporaryDirectory('ambicode-scratch-');
  const dir = (task: string): string => runDirOf(repo.root, task);
  return {
    repo,
    runtime,
    routes,
    engine: build({ script: scriptHandler, ...(options.handlers ?? {}) }),
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
