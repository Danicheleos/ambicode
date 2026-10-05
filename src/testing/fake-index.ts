import { indexStatus, type IndexAdapter, type IndexAnswer, type IndexDeclaration, type IndexName, type IndexState } from '../code-intelligence/index/adapter.ts';

export interface FakeIndexOptions {
  state?: IndexState;
  declarations?: IndexDeclaration[];
  relates?: { imports: string[] | null; importers: string[] };
  byPath?: Record<string, string[]>;
  byName?: Record<string, string[]>;
}

/** An adapter that answers from tables when fresh or stale, and refuses otherwise. */
export function fakeIndex(options: FakeIndexOptions = {}): IndexAdapter & { calls: string[] } {
  const state = options.state ?? 'fresh';
  const status = indexStatus('codeindex' as IndexName, state, state === 'fresh' || state === 'stale' ? 120 : null, state === 'error' ? 'boom' : null);
  const calls: string[] = [];
  const answer = <T>(value: T): IndexAnswer<T> => (state === 'fresh' || state === 'stale' ? { ok: true, value, status } : { ok: false, status });
  return {
    name: 'codeindex',
    calls,
    build: async () => status,
    status: async () => status,
    find: async (name) => {
      calls.push(`find ${name}`);
      return answer(options.byName?.[name]?.map((path) => ({ name, path, line: 1, kind: 'function' })) ?? options.declarations ?? []);
    },
    refs: async () => answer([]),
    relates: async (path) => {
      calls.push(`relates ${path}`);
      return answer(options.byPath === undefined ? (options.relates ?? { imports: [], importers: [] }) : { imports: [], importers: options.byPath[path] ?? [] });
    },
    delta: async () => answer([]),
  };
}
