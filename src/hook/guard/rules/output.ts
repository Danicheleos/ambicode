// ambicode prints the next step last, so `| head` hides the instructions.
import { basename, type Segment } from '../../shell/command-parser.ts';

/** Whether `segments[at]` is `head` fed by a literal ambicode.mjs call. */
export function cutsOutput(segments: Segment[], at: number): boolean {
  return segments[at]!.piped && basename(segments[at]!.argv[0] ?? '') === 'head' && basename(segments[at - 1]?.argv[0] ?? '') === 'ambicode.mjs';
}
