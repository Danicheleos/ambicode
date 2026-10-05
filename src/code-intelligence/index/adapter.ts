import type { ProjectConfig } from '../../contracts/config.ts';
import { codeindexAdapter, type IndexDeps } from './codeindex.ts';
import { noneAdapter } from './none.ts';

export type { IndexDeps } from './codeindex.ts';

export type IndexName = 'none' | 'codeindex';
export type IndexState = 'none' | 'fresh' | 'stale' | 'building' | 'absent' | 'error';
export interface IndexStatus {
  tool: IndexName;
  state: IndexState;
  /** `state === 'fresh'`. */
  fresh: boolean;
  builtMs: number | null;
  reason: string | null;
  /** Project files that differ from the indexed commit, untracked ones included; null when not measured. */
  drift: number | null;
}
export interface IndexDeclaration { name: string; path: string; line: number | null; kind: string | null }
export interface IndexReference { path: string; line: number | null }
export type IndexAnswer<T> = { ok: true; value: T; status: IndexStatus } | { ok: false; status: IndexStatus };

export interface IndexAdapter {
  readonly name: IndexName;
  build(project: ProjectConfig, options: { detached: boolean }): Promise<IndexStatus>;
  status(project: ProjectConfig): Promise<IndexStatus>;
  find(name: string, options?: { kind?: string }): Promise<IndexAnswer<IndexDeclaration[]>>;
  refs(names: readonly string[]): Promise<IndexAnswer<IndexReference[]>>;
  relates(path: string): Promise<IndexAnswer<{ imports: string[] | null; importers: string[] }>>;
  /** `base` is a revision; not parsed before step 08, so it answers not ok. */
  delta(base: string): Promise<IndexAnswer<string[]>>;
}

export const indexStatus = (tool: IndexName, state: IndexState, builtMs: number | null = null, reason: string | null = null, drift: number | null = null): IndexStatus => ({
  tool,
  state,
  fresh: state === 'fresh',
  builtMs,
  reason,
  drift,
});

/** The only way any caller gets an adapter (05-A1). */
export function indexAdapterFor(deps: IndexDeps, project: ProjectConfig): IndexAdapter {
  return deps.config.search.index === 'codeindex' ? codeindexAdapter(deps, project) : noneAdapter();
}

export function formatIndexStatus(status: IndexStatus): string {
  const notes = [status.drift === null || status.drift === 0 ? null : `drift ${status.drift} files`, status.builtMs === null ? null : `built in ${status.builtMs} ms`].filter((note) => note !== null);
  const built = notes.length === 0 ? '' : ` (${notes.join(', ')})`;
  switch (status.state) {
    case 'none':
      return 'index: none';
    case 'fresh':
    case 'stale':
      return `index: ${status.tool} ${status.state}${built}`;
    case 'error':
      return `index: error (${status.reason ?? 'unknown'})`;
    default:
      return `index: ${status.state}`;
  }
}

/** The ledger's `map.index`: `'none'` for the none tool (v6/32), else the status without its reason. */
export const ledgerIndex = (status: IndexStatus): 'none' | { tool: IndexName; state: IndexState; fresh: boolean; builtMs: number | null } =>
  status.tool === 'none' ? 'none' : { tool: status.tool, state: status.state, fresh: status.fresh, builtMs: status.builtMs };
