import type { JsonFormat } from '#types/util';

export function formatJsonOutput(value: unknown, format: JsonFormat = 'pretty'): string {
  return format === 'compact' ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`;
}
