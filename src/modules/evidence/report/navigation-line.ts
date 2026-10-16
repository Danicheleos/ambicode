import type { LedgerEntry } from '#types/modules/evidence';

/** Only code-made calls are recorded; a model's own reads are not, and the line says so. */
export function navigationLine(entries: readonly LedgerEntry[]): string {
  const calls = new Map<string, { count: number; names: number }>();
  for (const entry of entries) {
    if (entry.kind !== 'search') continue;
    const command = typeof entry.command === 'string' ? entry.command : 'search';
    const seen = calls.get(command) ?? { count: 0, names: 0 };
    calls.set(command, { count: seen.count + 1, names: seen.names + (Array.isArray(entry.names) ? entry.names.length : 0) });
  }
  const listed = [...calls].map(([command, { count, names }]) => `${command} x${count}${names > 0 ? ` (${names} ${names === 1 ? 'name' : 'names'})` : ''}`);
  return `Navigation (CLI calls): ${listed.length === 0 ? 'none recorded' : listed.join(', ')} — model reads not recorded`;
}
