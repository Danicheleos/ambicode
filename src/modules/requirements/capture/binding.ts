type Binding =
  | { state: 'bound'; server: string; how: 'exact' | 'token' | 'only-candidate' }
  | { state: 'none' }
  | { state: 'ambiguous'; servers: string[] };

const CANDIDATE_TOKENS = ['atlassian', 'jira', 'confluence', 'rovo'] as const;

const tokensOf = (server: string): string[] => server.toLowerCase().split(/[_.-]+/).filter((token) => token !== '');

/** `mcp__<server>__<tool>` → `<server>`. */
export function serverOf(toolName: string): string | null {
  const match = /^mcp__(.+?)__/.exec(toolName);
  return match === null ? null : match[1]!;
}

const matchesConfigured = (configured: string, server: string): boolean => tokensOf(server).includes(configured.toLowerCase());
const isCandidate = (server: string): boolean => tokensOf(server).some((token) => CANDIDATE_TOKENS.some((name) => token.includes(name)));

/** Hook time, route active: whether a payload from this server is recorded at all. */
export function capturesFrom(configured: string | null, server: string): boolean {
  if (configured === null) return isCandidate(server);
  return server === configured || matchesConfigured(configured, server);
}

/** Ground time: the server the captures came from, over the distinct servers they name. */
export function bindServer(configured: string | null, servers: readonly string[]): Binding {
  const distinct = [...new Set(servers)].sort();
  if (configured !== null && distinct.includes(configured)) return { state: 'bound', server: configured, how: 'exact' };
  const matching = distinct.filter((server) => (configured === null ? isCandidate(server) : matchesConfigured(configured, server)));
  if (matching.length === 0) return { state: 'none' };
  if (matching.length > 1) return { state: 'ambiguous', servers: matching };
  return { state: 'bound', server: matching[0]!, how: configured === null ? 'only-candidate' : 'token' };
}

/** The distinct servers of the `via` tool names on a chain's requirement entries. */
export function capturedServers(entries: readonly { kind: string; [field: string]: unknown }[]): string[] {
  const servers = entries.flatMap((entry) => (entry.kind === 'requirement' ? serverOf(String(entry['via'] ?? '')) ?? [] : []));
  return [...new Set(servers)].sort();
}

/** The distinct tool names that produced a task's captures (04-T6). */
export function observedTools(entries: readonly { kind: string; [field: string]: unknown }[]): string[] {
  return [...new Set(entries.flatMap((entry) => (entry.kind === 'requirement' && entry['capture'] !== 'disconnected' ? [String(entry['via'])] : [])))];
}
