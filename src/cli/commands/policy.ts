import { Activity } from '../../contracts/primitives.ts';
import type { ResolvedPolicy } from '../../contracts/policy.ts';
import {
  openWorkspace,
  projectById,
  projectForPath,
  resolvePolicyFor,
  toRepositoryRelative,
  type Runtime,
} from '../../composition/root.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';

export const POLICY_OPTIONS = {
  values: ['project', 'activity'],
  flags: ['json'],
  // The one command whose operands are data: the paths policy is resolved for.
  positionals: true,
} as const;

export interface PolicyOutput {
  command: 'policy';
  projectId: string;
  activity: string;
  paths: string[];
  policy: ResolvedPolicy;
}

/**
 * The effective policy, printed from the same resolver the checks and the
 * reviewer use. Skills read this rather than reading packs themselves, so
 * there is exactly one answer to "what applies here" (D14).
 */
export async function runPolicy(runtime: Runtime, args: ParsedArgs): Promise<PolicyOutput> {
  const workspace = await openWorkspace(runtime);
  const paths = args.positionals.map((value) => toRepositoryRelative(workspace, value));

  const activityInput = args.value('activity') ?? 'review';
  const activity = Activity.safeParse(activityInput);
  if (!activity.success) {
    throw new AmbicodeError('bad-argument', `Unknown activity "${activityInput}".`, {
      field: 'activity',
      details: [`Activities: ${Activity.options.join(', ')}.`],
    });
  }

  const requested = args.value('project');
  const project =
    requested !== null
      ? projectById(workspace.config, requested)
      : (paths[0] !== undefined ? projectForPath(workspace.config, paths[0]) : null) ??
        workspace.config.projects[0];

  if (project === undefined || project === null) {
    throw new AmbicodeError('unknown-project', 'No project could be determined for this request.', {
      details: ['Pass --project <id>, or give a path inside a configured project root.'],
    });
  }

  const policy = await resolvePolicyFor({
    workspace,
    project,
    activity: activity.data,
    paths,
  });

  return { command: 'policy', projectId: project.id, activity: activity.data, paths, policy };
}

export function renderPolicy(output: PolicyOutput): string {
  const lines = [
    `project:  ${output.projectId}`,
    `activity: ${output.activity}`,
    `paths:    ${output.paths.join(', ') || '(none supplied — activity-level content only)'}`,
    '',
    'packs',
  ];

  for (const pack of output.policy.packs) {
    lines.push(`  ${pack.reference}  authority=${pack.authority}  source=${pack.sourceLocation}`);
  }
  if (output.policy.packs.length === 0) lines.push('  (none apply)');

  lines.push('', `rules (${output.policy.rules.length})`);
  for (const rule of output.policy.rules) {
    lines.push(`  ${rule.qualifiedId} [${rule.category}] ${rule.instruction}`);
  }

  lines.push('', 'command decisions');
  for (const decision of output.policy.commandDecisions) {
    const reasons = decision.sources
      .map((source) => `${source.packId}:${source.action}${source.reason === undefined ? '' : ` (${source.reason})`}`)
      .join('; ');
    lines.push(`  ${decision.command}: ${decision.action}  <- ${reasons}`);
  }
  if (output.policy.commandDecisions.length === 0) {
    lines.push('  (none declared — an undeclared command is not run)');
  }

  lines.push('', 'prompts');
  for (const prompt of output.policy.prompts) {
    lines.push(`  ${prompt.stage}: ${prompt.packId} -> ${prompt.declaredPath}`);
  }
  if (output.policy.prompts.length === 0) lines.push('  (none)');

  if (output.policy.diagnostics.length > 0) {
    lines.push('', 'diagnostics');
    for (const diagnostic of output.policy.diagnostics) {
      lines.push(`  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
    }
  }
  return lines.join('\n');
}
