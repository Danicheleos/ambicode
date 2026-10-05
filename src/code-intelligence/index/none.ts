import { indexStatus, type IndexAdapter } from './adapter.ts';

/** No index: every query answers "not ok" so callers fall back and say `index: none` (05-A2). */
export function noneAdapter(): IndexAdapter {
  const status = indexStatus('none', 'none');
  const refuse = async () => ({ ok: false as const, status });
  return {
    name: 'none',
    build: async () => status,
    status: async () => status,
    find: refuse,
    refs: refuse,
    relates: refuse,
    delta: refuse,
  };
}
