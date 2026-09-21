import {
  openWorkspace,
  projectById,
  projectForPath,
  resolvePolicyFor,
  toRepositoryRelative,
  type Runtime,
} from '../../composition/root.ts';
import { Activity } from '../../contracts/primitives.ts';
import type { ResolvedPolicy } from '../../contracts/policy.ts';
import { PrepareOutput as PrepareOutputSchema, type PrepareOutput, type PreparePolicy } from '../../contracts/prepare.ts';
import type { AmbicodeConfig, ProjectConfig } from '../../contracts/config.ts';
import { normalizeRequirements, readRequirementEvidence } from '../../requirements/normalize.ts';
import { AmbicodeError } from '../../util/errors.ts';
import type { ParsedArgs } from '../args.ts';
import { absoluteEvidencePath } from '../target-option.ts';

export const PREPARE_OPTIONS = {
  values: ['activity', 'project', 'evidence'],
  repeated: ['requirement'],
  flags: ['json'],
  positionals: true,
} as const;

export type { PrepareOutput };

/**
 * The smallest shared preparation a skill needs before it starts navigating
 * code or asking a question (doc 04 P2.1): normalized requirement provenance
 * plus applicable policy for the given activity and paths. It makes no
 * provider, reviewer, or publication call, runs no project command or
 * configured check, and writes nothing — everything below is the same
 * configuration, requirement-normalization and policy-resolver code the
 * `review`/`bundle` commands use, composed for a caller that has not yet
 * decided what (if anything) to execute.
 */
export async function runPrepare(runtime: Runtime, args: ParsedArgs): Promise<PrepareOutput> {
  const workspace = await openWorkspace(runtime);

  const activity = requireActivity(args.value('activity'));
  const paths = await Promise.all(args.positionals.map((value) => toRepositoryRelative(workspace, value)));

  // Requirements first, same order `bundle`/`review` use (doc 02, "Data
  // flow"): an inaccessible or contradictory source must stop the run before
  // policy is even resolved, let alone before any code investigation.
  const evidencePath = absoluteEvidencePath(runtime, args.value('evidence'));
  const requirements = normalizeRequirements({
    urls: args.all('requirement'),
    evidence:
      evidencePath === null ? null : await readRequirementEvidence(runtime.fs, evidencePath),
    configuredServer: workspace.config.requirements.mcpServer,
  });

  const project = resolveProject(workspace.config, args.value('project'), paths);

  const policy = await resolvePolicyFor({ workspace, project, activity, paths });

  return toOutput({ activity, project, paths, requirements, policy });
}

function toOutput(options: {
  activity: Activity;
  project: ProjectConfig;
  paths: readonly string[];
  requirements: ReturnType<typeof normalizeRequirements>;
  policy: ResolvedPolicy;
}): PrepareOutput {
  return PrepareOutputSchema.parse({
    command: 'prepare' as const,
    activity: options.activity,
    projectId: options.project.id,
    paths: [...options.paths],
    requirementMode: options.requirements.mode,
    requirements: options.requirements.sources,
    provenance: options.requirements.provenance,
    notices: options.requirements.notices,
    policy: toPreparePolicy(options.policy),
  });
}

function toPreparePolicy(policy: ResolvedPolicy): PreparePolicy {
  return {
    activity: policy.activity,
    projectId: policy.projectId,
    packs: policy.packs.map((pack) => ({ ...pack })),
    rules: policy.rules.map((rule) => ({
      qualifiedId: rule.qualifiedId,
      packId: rule.packId,
      packReference: rule.packReference,
      authority: rule.authority,
      category: rule.category,
      instruction: rule.instruction,
      checkKind: rule.check.kind,
      checkExplanation: rule.check.explanation,
      checkCommand: rule.check.kind === 'command' ? rule.check.command : null,
    })),
    prompts: policy.prompts.map((prompt) => ({
      packId: prompt.packId,
      packReference: prompt.packReference,
      stage: prompt.stage,
      declaredPath: prompt.declaredPath,
      contentHash: prompt.contentHash,
    })),
    commandDecisions: policy.commandDecisions.map((decision) => ({
      command: decision.command,
      action: decision.action,
      sources: decision.sources.map((source) => ({ ...source })),
    })),
    diagnostics: policy.diagnostics.map((diagnostic) => ({ ...diagnostic })),
  };
}

function requireActivity(value: string | null): Activity {
  if (value === null) {
    throw new AmbicodeError('bad-argument', '"prepare" needs --activity <activity>.', {
      field: '--activity',
      details: [`Activities: ${Activity.options.join(', ')}.`],
    });
  }
  const parsed = Activity.safeParse(value);
  if (!parsed.success) {
    throw new AmbicodeError('bad-argument', `Unknown activity "${value}".`, {
      field: '--activity',
      details: [`Activities: ${Activity.options.join(', ')}.`],
    });
  }
  return parsed.data;
}

/**
 * Resolves the one project this call is about, without ever defaulting to
 * "the first configured project" when the request is genuinely ambiguous
 * (doc 04 P2.1: a monorepository request must not have that decision made for
 * it silently). A single configured project is not ambiguous; neither is an
 * explicit `--project`, nor a set of paths that all resolve to the same
 * project.
 */
function resolveProject(
  config: AmbicodeConfig,
  requestedId: string | null,
  paths: readonly string[],
): ProjectConfig {
  if (requestedId !== null) return projectById(config, requestedId);

  if (config.projects.length === 0) {
    throw new AmbicodeError('unknown-project', 'No project is configured for this repository.', {
      details: ['Run the AMBICODE init skill first.'],
    });
  }
  if (config.projects.length === 1) return config.projects[0] as ProjectConfig;

  if (paths.length > 0) {
    const resolved = new Set(paths.map((value) => projectForPath(config, value)?.id ?? null));
    if (resolved.size === 1) {
      const [only] = resolved;
      if (only !== null && only !== undefined) return projectById(config, only);
    }
  }

  throw new AmbicodeError(
    'ambiguous-project',
    'This repository configures more than one project, and this request does not identify exactly one.',
    {
      field: '--project',
      details: [
        `Configured projects: ${config.projects.map((project) => project.id).join(', ')}.`,
        'Pass --project <id>, or give one or more paths that all fall inside a single project root.',
      ],
    },
  );
}

export function renderPrepare(output: PrepareOutput): string {
  const lines = [
    `activity: ${output.activity}`,
    `project:  ${output.projectId}`,
    `paths:    ${output.paths.join(', ') || '(none supplied — activity-level content only)'}`,
    `requirements: ${output.requirementMode}`,
  ];

  if (output.requirements.length > 0) {
    lines.push(...output.requirements.map((source) => `  ${source.id}  ${source.url}`));
  }
  if (output.notices.length > 0) {
    lines.push('', 'notices');
    lines.push(...output.notices.map((notice) => `  ${notice}`));
  }

  lines.push('', 'packs');
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
    lines.push(`  ${decision.command}: ${decision.action}`);
  }
  if (output.policy.commandDecisions.length === 0) {
    lines.push('  (none declared — an undeclared command is not run)');
  }

  if (output.policy.diagnostics.length > 0) {
    lines.push('', 'diagnostics');
    for (const diagnostic of output.policy.diagnostics) {
      lines.push(`  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
    }
  }
  return lines.join('\n');
}
