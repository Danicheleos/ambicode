import path from 'node:path';
import { validateTargetArgs } from '#composition/start';
import type { Runtime } from '#types/composition';
import type { EvidenceSource } from '#types/modules/requirements';
import type { ParsedArgs } from '#types/cli';
import type { ResolvedTargetOptions } from '../types/options.ts';

export { validateTargetArgs };

export function resolveTargetOptions(
  command: string,
  runtime: Runtime,
  args: ParsedArgs,
): ResolvedTargetOptions {
  return {
    target: validateTargetArgs(command, args),
    requirementUrls: args.all('requirement'),
    evidence: evidenceSource(runtime, args.value('evidence')),
    approvals: new Set(args.all('approve')),
    declines: new Set(args.all('decline')),
    task: args.value('task'),
    excludePaths: args.all('exclude'),
    onlyPaths: args.all('only'),
    contextPaths: args.all('context'),
    withTests: args.flag('with-tests'),
  };
}

/** `-` is standard input, so a skill can pipe the same evidence to `prepare` and `review` without a temp file. */
export function evidenceSource(runtime: Runtime, value: string | null): EvidenceSource | null {
  if (value === null) return null;
  if (value === '-') return { kind: 'stdin' };
  return { kind: 'file', path: path.isAbsolute(value) ? value : path.resolve(runtime.cwd, value) };
}
