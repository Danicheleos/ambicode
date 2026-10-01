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
  /** Qualified ids (`pack/rule`): read just those rules, once, instead of the whole set. */
  repeated: ['rule'],
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
 * Printed from the same resolver the checks and the reviewer use; skills read
 * this rather than the packs, so there is one answer to "what applies here".
 */
export async function runPolicy(runtime: Runtime, args: ParsedArgs): Promise<PolicyOutput> {
  const workspace = await openWorkspace(runtime);
  const paths = await Promise.all(args.positionals.map((value) => toRepositoryRelative(workspace, value)));

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

  const wanted = args.all('rule');
  if (wanted.length === 0) return { command: 'policy', projectId: project.id, activity: activity.data, paths, policy };

  const known = new Set(policy.rules.map((rule) => rule.qualifiedId));
  const unknown = wanted.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new AmbicodeError('unknown-rule', `No rule applies here with id ${unknown.map((id) => `"${id}"`).join(', ')}.`, {
      field: '--rule',
      details: [`Rules that apply: ${[...known].join(', ') || '(none)'}.`],
    });
  }
  const only = new Set(wanted);
  return {
    command: 'policy',
    projectId: project.id,
    activity: activity.data,
    paths,
    policy: { ...policy, rules: policy.rules.filter((rule) => only.has(rule.qualifiedId)) },
  };
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
