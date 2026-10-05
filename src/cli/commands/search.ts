import path from 'node:path';
import { openWorkspace, projectForRequest, toRepositoryRelative, type Runtime } from '../../composition/root.ts';
import { buildMap, resolveLayers, type MapResult } from '../../code-intelligence/map.ts';
import { find, refs, renderFind, type RefsResult } from '../../code-intelligence/refs.ts';
import { relates, renderRelates } from '../../code-intelligence/relates.ts';
import { formatIndexStatus, indexAdapterFor } from '../../code-intelligence/index/adapter.ts';
import { indexDepsOf, runIndexBuild } from '../../code-intelligence/index/codeindex.ts';
import { openRouteView } from '../../route/context.ts';
import { taskSlugFor } from '../../review/review-name.ts';
import { withLedgerLock } from '../../task/ledger-lock.ts';
import { resolveTaskDir } from '../../task/task-dir.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';
import { routeTools } from './route.ts';

export const MAP_OPTIONS = { values: ['task', 'project', 'mode', 'layers'], repeated: ['term', 'symbol'], flags: ['json', 'show'], positionals: true } as const;
export const REFS_OPTIONS = { values: ['project', 'task'], flags: ['json', 'show'], positionals: true } as const;
export const FIND_OPTIONS = { values: ['project', 'task', 'kind'], flags: ['json'], positionals: true } as const;
export const RELATES_OPTIONS = { values: ['project', 'task'], flags: ['json', 'show'], positionals: true } as const;
export const INDEX_OPTIONS = { values: ['project'], flags: ['json'] } as const;

export interface SearchOutput { command: 'map' | 'refs' | 'find' | 'relates'; text: string; bytes: number; file?: string; data: unknown }

/** The ledger entry goes to the task's one live route, if any; otherwise it is recorded without one. */
async function record(runtime: Runtime, args: ParsedArgs, entry: { kind: string; [field: string]: unknown }): Promise<void> {
  const slug = taskSlugFor({ requirementIds: [], task: args.value('task') });
  if (slug === null) return;
  const dir = await resolveTaskDir(runtime, slug);
  const tools = await routeTools(runtime, slug);
  const session = tools.binding.state === 'bound' ? tools.binding.session : null;
  const view = session === null ? null : await openRouteView(runtime, tools.routes, slug, session);
  await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), session ?? runtime.ids.writerId(), (ledger) =>
    ledger.append({ ...(view === null ? {} : { route: view.routeId }), ...entry }),
  );
}

async function showFile(runtime: Runtime, args: ParsedArgs, name: string, full: string): Promise<string | undefined> {
  const slug = taskSlugFor({ requirementIds: [], task: args.value('task') });
  if (!args.flag('show') || slug === null) return undefined;
  const dir = await resolveTaskDir(runtime, slug);
  await runtime.fs.mkdirp(dir.steps);
  const file = path.join(dir.steps, `${name}.md`);
  await runtime.fs.writeText(file, `${full}\n`);
  return file;
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
  const map: MapResult = await buildMap({ runtime, project, mode, layers, layersSource: source, terms, paths: args.positionals, symbols });
  await record(runtime, args, { kind: 'map', ...map.entry });
  const file = await showFile(runtime, args, 'map', map.text);
  return { command: 'map', text: map.text, bytes: map.bytes, ...(file === undefined ? {} : { file }), data: { layers: map.layers, terms: map.terms, candidates: map.candidates, symbols: map.symbols, collides: map.collisions, limitations: map.limitations, index: map.index, omitted: map.omitted } };
}

export async function runRefs(runtime: Runtime, args: ParsedArgs): Promise<SearchOutput> {
  if (args.positionals.length === 0) throw new AmbicodeError('bad-argument', '"refs" needs at least one name.', { field: 'refs' });
  const workspace = await openWorkspace(runtime);
  const project = projectForRequest(workspace.config, args.value('project'), []);
  const result: RefsResult = await refs(runtime, args.positionals, { project, show: false });
  await record(runtime, args, { kind: 'search', command: 'refs', names: args.positionals, hits: result.hits, bytes: result.bytes });
  const file = await showFile(runtime, args, 'refs', result.full);
  return { command: 'refs', text: result.text, bytes: result.bytes, ...(file === undefined ? {} : { file }), data: { names: result.names, hits: result.hits, truncated: result.truncated, limitations: result.limitations } };
}

export async function runFind(runtime: Runtime, args: ParsedArgs): Promise<SearchOutput> {
  const [name, ...extra] = args.positionals;
  if (name === undefined || extra.length > 0) throw new AmbicodeError('bad-argument', '"find" takes exactly one name.', { field: 'find' });
  const workspace = await openWorkspace(runtime);
  const project = projectForRequest(workspace.config, args.value('project'), []);
  const result = await find(runtime, name, { project, kind: args.value('kind') });
  const { text } = renderFind(result);
  const bytes = Buffer.byteLength(text);
  await record(runtime, args, { kind: 'search', command: 'find', names: [name], hits: result.declarations.length, bytes });
  return { command: 'find', text, bytes, data: result };
}

export async function runRelates(runtime: Runtime, args: ParsedArgs): Promise<SearchOutput> {
  const [value, ...extra] = args.positionals;
  if (value === undefined || extra.length > 0) throw new AmbicodeError('bad-argument', '"relates" takes exactly one path.', { field: 'path' });
  const workspace = await openWorkspace(runtime);
  const project = projectForRequest(workspace.config, args.value('project'), [await toRepositoryRelative(workspace, value)]);
  const result = await relates(indexDepsOf(runtime, workspace.git, workspace.repositoryRoot, workspace.config), project, value);
  const rendered = renderRelates(result);
  const text = rendered.text;
  const bytes = Buffer.byteLength(text);
  await record(runtime, args, { kind: 'search', command: 'relates', names: [result.path], hits: result.importers.length, bytes });
  const file = await showFile(runtime, args, 'relates', rendered.full);
  return { command: 'relates', text, bytes, ...(file === undefined ? {} : { file }), data: result };
}

export async function runIndex(runtime: Runtime, args: ParsedArgs, action: 'build' | 'status'): Promise<{ text: string; data: unknown }> {
  const workspace = await openWorkspace(runtime);
  const project = projectForRequest(workspace.config, args.value('project'), []);
  const deps = indexDepsOf(runtime, workspace.git, workspace.repositoryRoot, workspace.config);
  if (action === 'build' && workspace.config.search.index === 'none') return { text: 'index: none — nothing to build', data: await indexAdapterFor(deps, project).status(project) };
  const status = action === 'build' ? await runIndexBuild(deps, project) : await indexAdapterFor(deps, project).status(project);
  return { text: formatIndexStatus(status), data: status };
}

export const renderSearch = (output: SearchOutput): string => (output.file === undefined ? output.text : `${output.text}\nFull result: ${output.file}`);
