// A separate entry from the CLI bundle: the bundle costs 88-143 ms to start and the guard runs before every Bash call.
import { guardDecision, type GuardInput } from './guard-core.ts';
import { fsGuardState } from './guard-state.ts';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let output: Record<string, unknown> = {};
  try {
    output = guardDecision(JSON.parse(raw) as GuardInput, process.env.CLAUDE_PLUGIN_ROOT, fsGuardState);
  } catch (error) {
    // A hook is advisory; any failure must leave the tool call alone (15 Failure modes: exit 0, a stderr line).
    process.stderr.write(`ambicode guard: no decision: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
});
