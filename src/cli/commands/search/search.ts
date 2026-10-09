import { openWorkspace, projectForRequest } from '#modules/config/workspace';
import { buildMap, resolveLayers } from '#modules/search/map';
import { refs } from '#modules/search/refs';
import { COMMAND_SPECS } from '#skills/investigate/commands';
import { taskSlugFor } from '#modules/review/bundle/review-name';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { AmbicodeError } from '#util/errors';
import { routeTools } from '../route/route.ts';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const MAP_OPTIONS = { values: ['task', 'project', 'mode', 'layers'], repeated: ['term', 'symbol'], flags: ['json'], positionals: true } as const;

export const REFS_OPTIONS = { values: ['project', 'task'], flags: ['json', 'declarations'], positionals: true } as const;

interface SearchOutput { command: 'map' | 'refs'; text: string; bytes: number; data: unknown }

/** The ledger entry goes to the task's one live route, if any; otherwise it is recorded without one. */
async function record(runtime: Runtime, args: ParsedArgs, entry: { kind: string; [field: string]: unknown }): Promise<void> {
  const slug = taskSlugFor({ requirementIds: [], task: args.value('task') });
  if (slug === null) return;
  const dir = await resolveTaskDir(runtime, slug);
  const tools = await routeTools(runtime, slug);
  const { session, view } = await tools.engine.command(COMMAND_SPECS.search, { task: slug }, async (scope) => scope);
  await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), session ?? runtime.ids.writerId(), async (ledger) => {
    await ledger.append({ ...(view === null ? {} : { route: view.routeId }), ...entry });
  });
}

export async function runMap(runtime: Runtime, args: ParsedArgs): Promise<SearchOutput> {
  if (args.value('layers') !== null) {
    throw new AmbicodeError('search-layers-not-for-model', '--layers is not for the model: the layer list is a configuration choice.', { field: 'layers', details: ['Edit search.layers in .ambicode/config.yaml.'] });
  }
  const mode = args.value('mode') ?? 'prompt';
  if (mode !== 'prompt' && mode !== 'context') throw new AmbicodeError('bad-argument', '--mode takes prompt or context.', { field: 'mode' });
  const terms = args.all('term');
  const symbols = args.all('symbol');
  if (terms.length === 0 && symbols.length === 0 && args.positionals.length === 0) {
    throw new AmbicodeError('bad-argument', '"map" needs at least one --term, --symbol or path.', { field: 'map' });
  }
  const workspace = await openWorkspace(runtime);
  const project = projectForRequest(workspace.config, args.value('project'), args.positionals);
  const { layers, source } = resolveLayers(workspace.config.search, mode);
  const map = await buildMap(runtime, { project, mode, layers, layersSource: source, terms, paths: args.positionals, symbols });
  await record(runtime, args, { kind: 'map', ...map.entry });
  return { command: 'map', text: map.text, bytes: map.bytes, data: { layers: map.layers, terms: map.terms, candidates: map.candidates, symbols: map.symbols, collides: map.collisions, limitations: map.limitations, omitted: map.omitted } };
}

export async function runRefs(runtime: Runtime, args: ParsedArgs): Promise<SearchOutput> {
  if (args.positionals.length === 0) throw new AmbicodeError('bad-argument', '"refs" needs at least one name.', { field: 'refs' });
  const workspace = await openWorkspace(runtime);
  const project = projectForRequest(workspace.config, args.value('project'), []);
  const result = await refs(runtime, args.positionals, { project, declarations: args.flag('declarations') });
  await record(runtime, args, { kind: 'search', command: 'refs', names: args.positionals, hits: result.hits, bytes: result.bytes });
  return { command: 'refs', text: result.text, bytes: result.bytes, data: { names: result.names, hits: result.hits, truncated: result.truncated, limitations: result.limitations } };
}

const searchCommand = (runSearch: typeof runMap): CliCommand['run'] => async (runtime, args) => {
  const output = await runSearch(runtime, args);
  return { text: output.text, data: output.data, json: 'compact' };
};

export const mapCommand: CliCommand = { name: 'map', summary: 'Files, symbols and spans a request touches, at most 6 KiB.', options: MAP_OPTIONS, run: searchCommand(runMap) };

export const refsCommand: CliCommand = { name: 'refs', summary: 'Lines using each whole word, at most 4 KiB; --declarations lists declarations.', options: REFS_OPTIONS, run: searchCommand(runRefs) };
