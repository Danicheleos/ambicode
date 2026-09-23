import { openWorkspace, projectForRequest, type Runtime } from '../../composition/root.ts';
import {
  DEFAULT_LOCATE_LIMIT,
  locate,
  termsFromRequirements,
} from '../../code-intelligence/locate.ts';
import { LocateOutput as LocateOutputSchema, type LocateOutput } from '../../contracts/locate.ts';
import { loadRequirementEvidence } from '../../requirements/normalize.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';
import { evidenceSource } from '../target-option.ts';

export const LOCATE_OPTIONS = {
  values: ['project', 'evidence', 'limit'],
  flags: ['json'],
  positionals: true,
} as const;

export type { LocateOutput };

/**
 * `ambicode locate` (R4): the candidate files a request is probably about, so
 * a task or investigation starts from a shortlist instead of from a search.
 *
 * It reads git and nothing else: no project command runs, nothing is written,
 * and no index or cache is created or consulted. The terms come from the
 * command line, or from the same requirement envelope every other command
 * accepts — there is no second evidence format.
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

  // Stated terms win outright. A caller who names the words is narrowing the
  // search deliberately, and silently adding a frequency heuristic's guesses
  // to that would widen what they asked for.
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
    // An empty shortlist is an answer. It is never widened into the project.
    lines.push('  (none — no file matched well enough to be worth starting from)');
  }

  if (output.limitations.length > 0) {
    lines.push('', 'limitations');
    lines.push(...output.limitations.map((limitation) => `  ${limitation}`));
  }
  lines.push('', 'This is a hypothesis: confirm each candidate before editing it.');
  return lines.join('\n');
}
