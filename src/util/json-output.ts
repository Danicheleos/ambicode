/**
 * The one canonical serialization for every `--json` command output (doc 04
 * P2.4 correction B2). The CLI's generic dispatch (`src/cli/main.ts`) and
 * anything that needs to measure the exact bytes a `--json` invocation will
 * print — today, `ambicode prepare`'s aggregate context budget
 * (`src/cli/commands/prepare.ts`) — both call this function, never a second
 * ad hoc `JSON.stringify` form, so a byte count computed ahead of printing
 * can be asserted equal to what is actually written to stdout.
 *
 * Two forms, chosen by the command, not by the caller's taste:
 *   - `pretty` (the default) indents by two spaces. `prepare` moved here from
 *     `compact` (I5): sweep traces showed agents piping the one-line payload
 *     through `head -c` and losing the tail, so the ~1.9 KiB of indentation
 *     buys the payload actually being read whole;
 *   - `compact` puts it on one line — today `locate`, whose rows a model
 *     scans rather than reads.
 *
 * Both end with exactly one newline.
 */
export type JsonFormat = 'pretty' | 'compact';

export function formatJsonOutput(value: unknown, format: JsonFormat = 'pretty'): string {
  return format === 'compact' ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`;
}
