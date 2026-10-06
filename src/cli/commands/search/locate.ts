import { openWorkspace, projectForRequest } from '#composition/root';
import { locate, termsFromRequirements } from '#modules/search/text/locate';
import { LocateOutput as LocateOutputSchema, DEFAULT_LOCATE_LIMIT, type LocateOutput } from '#types/modules/search';
import { loadRequirementEvidence } from '#modules/requirements/envelope/normalize';
import { AmbicodeError } from '#util/errors';
import { evidenceSource } from '../../options/target-option.ts';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const LOCATE_OPTIONS = {
  values: ['project', 'evidence', 'limit'],
  flags: ['json'],
  positionals: true,
} as const;

export type { LocateOutput };

/**
 * Shortlists the files a request is probably about. Reads git and nothing else: runs no
 * project command, writes nothing, and creates or consults no index or cache.
 */
export async function runLocate(runtime: Runtime, args: ParsedArgs): Promise<LocateOutput> {
  const workspace = await openWorkspace(runtime);
  const project = projectForRequest(workspace.config, args.value('project'), []);
  const limit = parseLimit(args.value('limit'));

  const evidence = evidenceSource(runtime, args.value('evidence'));
  const derived: string[] = [];
  if (evidence !== null) {
    const envelope = await loadRequirementEvidence(runtime, evidence);
    derived.push(...termsFromRequirements(envelope.sources));
  }

  // Stated terms win outright: adding the frequency heuristic's guesses would widen what the
  // caller deliberately narrowed.
  const supplied = args.positionals;
  if (supplied.length === 0 && derived.length === 0) {
    throw new AmbicodeError('bad-argument', '"locate" needs at least one term, or --evidence.', {
      field: 'locate',
      details: [
        'ambicode locate invoice "negative amount"',
        'ambicode locate --evidence -   (terms are derived from the retrieved requirement text)',
      ],
    });
  }

  const shortlist = await locate({
    git: workspace.git,
    project,
    terms: supplied.length > 0 ? supplied : derived,
    limit,
  });

  return LocateOutputSchema.parse({
    command: 'locate' as const,
    projectId: project.id,
    terms: shortlist.terms,
    limit,
    candidates: shortlist.candidates,
    limitations:
      supplied.length > 0 || derived.length === 0
        ? shortlist.limitations
        : [
            'Terms were derived from the requirement text by word frequency, not stated by the caller; pass them as operands to narrow the search.',
            ...shortlist.limitations,
          ],
  });
}

function parseLimit(value: string | null): number {
  if (value === null) return DEFAULT_LOCATE_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AmbicodeError('bad-argument', '--limit needs a positive whole number.', {
      field: '--limit',
      details: [`Default: ${DEFAULT_LOCATE_LIMIT}.`],
    });
  }
  return parsed;
}

export function renderLocate(output: LocateOutput): string {
  const lines = [
    `project: ${output.projectId}`,
    `terms:   ${output.terms.join(', ') || '(none)'}`,
    '',
    `candidates (${output.candidates.length}, limit ${output.limit})`,
  ];

  for (const candidate of output.candidates) {
    lines.push(`  ${candidate.path}  [${candidate.score}]`);
    lines.push(...candidate.reasons.map((reason) => `      ${reason}`));
  }
  if (output.candidates.length === 0) {
    lines.push('  (none — no file matched well enough to be worth starting from)');
  }

  if (output.limitations.length > 0) {
    lines.push('', 'limitations');
    lines.push(...output.limitations.map((limitation) => `  ${limitation}`));
  }
  lines.push('', 'This is a hypothesis: confirm each candidate before editing it.');
  return lines.join('\n');
}

export const locateCommand: CliCommand = {
  name: 'locate',
  options: LOCATE_OPTIONS,
  run: async (runtime, args) => {
    const output = await runLocate(runtime, args);
    // Compact: its reader is a model, and indentation on a path list carries no information.
    return { text: renderLocate(output), data: output, json: 'compact' };
  },
};
