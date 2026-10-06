import { Activity } from '#types/primitives';
import type { ResolvedPolicy, StagePayload } from '#types/modules/policy';
import { openWorkspace, projectById, projectForPath, resolvePolicyFor, toRepositoryRelative } from '#composition/root';
import { policyStage } from '#modules/policy/stage';
import { AmbicodeError } from '#util/errors';
import type { Runtime } from '#types/composition';
import type { ParsedArgs } from '../../types/cli.ts';

interface PolicyOutput {
  command: 'policy';
  projectId: string;
  activity: string;
  paths: string[];
  policy: ResolvedPolicy;
  /** `--stage`: the text a route delivers at that stage, with the same byte caps unless `--show`. */
  stage?: StagePayload;
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

  const stage = args.value('stage');
  if (stage !== null && stage !== 'before-work' && stage !== 'before-report') {
    throw new AmbicodeError('bad-argument', '--stage takes before-work or before-report.', { field: 'stage' });
  }
  if (stage === null && args.flag('show')) throw new AmbicodeError('bad-argument', '--show goes with --stage.', { field: 'show' });

  const policy = await resolvePolicyFor({
    workspace,
    project,
    activity: activity.data,
    paths,
  });
  if (stage !== null) {
    const payload = await policyStage({ runtime, project, activity: activity.data, paths, stage, show: args.flag('show') });
    return { command: 'policy', projectId: project.id, activity: activity.data, paths, policy, stage: payload };
  }

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
  if (output.stage !== undefined) return output.stage.text;
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
