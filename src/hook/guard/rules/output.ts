// ambicode prints the next step last, so `| head` hides the instructions (task-multi failed 2 of 3 runs on it).
import { basename, type Segment } from '../../shell/command-parser.ts';

/** Whether `segments[at]` is `head` fed by an ambicode call, run literally or as `node $S` with `S=…ambicode.mjs` in `command`. */
export function cutsOutput(segments: Segment[], at: number, command: string): boolean {
  const [call = '', next = ''] = segments[at - 1]?.argv ?? [];
  // The parser drops `node` only before a literal ambicode.mjs; `node $S` keeps it.
  const script = call === 'node' ? next : call;
  return segments[at]!.piped && basename(segments[at]!.argv[0] ?? '') === 'head' && (basename(script) === 'ambicode.mjs' || (script[0] === '$' && new RegExp(`\\b${script.replace(/\W/g, '')}=\\S*ambicode\\.mjs`).test(command)));
}
