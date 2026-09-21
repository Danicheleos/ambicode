/**
 * The one canonical serialization for every `--json` command output (doc 04
 * P2.4 correction B2): two-space indentation plus a single trailing newline.
 * The CLI's generic dispatch (`src/cli/main.ts`) and anything that needs to
 * measure the exact bytes a `--json` invocation will print — today,
 * `ambicode prepare`'s aggregate context budget (`src/cli/commands/
 * prepare.ts`) — both call this function, never a second ad hoc
 * `JSON.stringify` form, so a byte count computed ahead of printing can be
 * asserted equal to what is actually written to stdout.
 */
export function formatJsonOutput(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
