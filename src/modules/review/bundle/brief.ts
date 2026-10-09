import path from 'node:path';
import { addressableLines } from '#platform/git/diff';
import { renderRule } from '#modules/policy/stage';
import type { Runtime } from '#types/composition';
import type { ReviewBundle } from '#types/modules/review';
import type { DiffFile } from '#types/platform/git';

export const BRIEF_FILE = 'brief.md';

/** `3-5, 9, 12-14`: the line numbers a finding may name, collapsed so a large file costs one line. */
export function rangesOf(lines: ReadonlySet<number>): string {
  const sorted = [...lines].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let index = 0; index < sorted.length; index++) {
    const start = sorted[index]!;
    let end = start;
    while (sorted[index + 1] === end + 1) end = sorted[++index]!;
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
  }
  return ranges.length === 0 ? '(none)' : ranges.join(', ');
}

function fileSection(file: DiffFile): string[] {
  const where = file.newPath ?? file.oldPath ?? '(no path)';
  const head = file.oldPath !== null && file.newPath !== null && file.oldPath !== file.newPath ? `${where} (was ${file.oldPath})` : where;
  return [
    `### ${head} [${file.changeKind}]`,
    `new-side lines: ${file.newPath === null ? '(file deleted)' : rangesOf(addressableLines(file, 'new'))}`,
    `old-side lines: ${file.oldPath === null ? '(file added)' : rangesOf(addressableLines(file, 'old'))}`,
    '```diff',
    file.patchSection.trimEnd(),
    '```',
    '',
  ];
}

/** The text the reviewer subagent reads first; written beside `result.json` so the agent never needs the checkout. */
export function renderBrief(bundle: ReviewBundle): string {
  const { result } = bundle;
  const target = result.target;
  const lines = [
    `# Review brief ${bundle.reviewId}`,
    '',
    `Target: ${target.kind}${target.baseRef === null ? '' : ` against ${target.baseRef}`} (${target.snapshotId}).`,
    `Snapshot: ${bundle.snapshot.directory} (mirrored files under files/, the whole patch in changed.diff).`,
    'A finding may name only a line listed below, on the side listed. Anything else voids the whole answer.',
    '',
    '## Changed files',
    '',
    ...bundle.files.flatMap(fileSection),
    '## Policy rules',
    '',
    ...(bundle.policies.flatMap(({ policy }) => policy.rules).length === 0
      ? ['(none resolved)']
      : bundle.policies.flatMap(({ policy }) => policy.rules.map(renderRule))),
    '',
    '## Requirements',
    '',
    ...(result.requirements.length === 0
      ? ['(none supplied: quality review)']
      : result.requirements.flatMap((source) => [`### ${source.id}: ${source.title}`, source.content, ''])),
    '## Check results',
    '',
    ...(result.checks.length === 0
      ? ['(no check ran)']
      : result.checks.map((check) => {
          const limits = check.limitations.length === 0 ? '' : `; limitations: ${check.limitations.join(' | ')}`;
          return `- ${check.projectId}/${check.checkId}: ${check.status}, exit ${check.exitCode ?? 'none'}${limits}`;
        })),
    '',
  ];
  return lines.join('\n');
}

export async function writeBrief(runtime: Runtime, bundle: ReviewBundle): Promise<string> {
  const briefPath = path.join(bundle.reviewDirectory, BRIEF_FILE);
  await runtime.fs.writeText(briefPath, renderBrief(bundle));
  return briefPath;
}
