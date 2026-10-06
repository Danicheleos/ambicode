import type { ProjectConfig } from '#types/config';
import { codeindexAdapter } from './codeindex.ts';
import { noneAdapter } from './none.ts';
import type { IndexName, IndexState, IndexStatus, IndexAdapter } from '#types/search';
import type { IndexDeps } from '../types/code-index.ts';

export type { IndexDeps } from '../types/code-index.ts';

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
