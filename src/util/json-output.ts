/**
 * The one `--json` serialization, so a byte count measured before printing equals stdout.
 * `pretty` is the default, for output a person reads. `compact` is one line, for payloads
 * only a model reads (`prepare`'s default, `locate`). Both end with exactly one newline.
 */
export type JsonFormat = 'pretty' | 'compact';

export function formatJsonOutput(value: unknown, format: JsonFormat = 'pretty'): string {
  return format === 'compact' ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`;
}
