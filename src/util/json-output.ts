/**
 * The one `--json` serialization, so a byte count measured before printing equals stdout.
 * `pretty` is the default: agents pipe a one-line payload through `head -c` and lose the tail.
 * `compact` suits rows a model scans (`locate`). Both end with exactly one newline.
 */
export type JsonFormat = 'pretty' | 'compact';

export function formatJsonOutput(value: unknown, format: JsonFormat = 'pretty'): string {
  return format === 'compact' ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`;
}
