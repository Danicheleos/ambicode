// A command that prints a route step prints it last, so `| head` hides the instructions: the pipe is cut out of the
// command instead of refusing it. Commands outside STEP_PRINTING print no step, so a new read-only command is never held.
import { basename, type Segment } from '../../shell/command-parser.ts';

// Each is a `cause` of runCommandTail or an engine start/advance in src/cli/commands (a test compares them).
export const STEP_PRINTING = new Set(['route start', 'route next', 'check', 'note save', 'rules apply', 'requirements normalize', 'policy check --drafts']);

// Read-only or output-only, so auto-allowing them beside the rewritten call skips no prompt that mattered.
const HARMLESS = new Set(['ambicode.mjs', 'cd', 'pushd', 'popd', 'echo', 'cat', 'ls', 'pwd', 'true', 'false', 'grep', 'head', 'tail', 'wc', 'sort', 'jq', 'for', 'done', 'fi']);

/** Whether `segment` is an ambicode call that can print a step; a name only the shell resolves is assumed to. */
function printsStep({ argv, opaque }: Segment): boolean {
  if (basename(argv[0] ?? '') !== 'ambicode.mjs') return false;
  if (opaque[1] === true || argv[1] === undefined) return true;
  const two = `${argv[1]} ${argv[2] ?? ''}`;
  return STEP_PRINTING.has(argv[1]) || STEP_PRINTING.has(two) || (two === 'policy check' && argv.includes('--drafts'));
}

/** Whether `segments[at]` is `head` fed by an ambicode call that prints a step. */
export function cutsOutput(segments: Segment[], at: number): boolean {
  const feeder = segments[at - 1];
  return segments[at]!.piped && basename(segments[at]!.argv[0] ?? '') === 'head' && feeder !== undefined && printsStep(feeder);
}

/** The command without the `| head …` of each cut segment; `null` unless every cut can be located and nothing else in it can do harm. */
export function withoutCuts(command: string, segments: Segment[], cuts: number[]): string | null {
  if (/<<|\$\(|`|<\(/.test(command)) return null;
  const cutting = new Set(cuts);
  for (const [at, segment] of segments.entries()) {
    if (segment.unparsed || segment.writeTargets.length > 0) return null;
    if (!cutting.has(at) && !HARMLESS.has(basename(segment.argv[0] ?? '')) && segment.argv.length > 0) return null;
  }
  let out = command;
  for (const at of [...cuts].reverse()) {
    const [from, to] = segments[at]!.span;
    const head = out.slice(0, from).trimEnd();
    if (!head.endsWith('|') || head.slice(0, -1).trimEnd().endsWith('\\')) return null;
    out = head.slice(0, -1).trimEnd() + out.slice(to);
  }
  return out;
}
