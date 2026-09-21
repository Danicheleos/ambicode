import {
  openWorkspace,
  projectById,
  projectForPath,
  resolvePolicyFor,
  toRepositoryRelative,
  type Runtime,
} from '../../composition/root.ts';
import { Activity } from '../../contracts/primitives.ts';
import type { ResolvedPolicy, ResolvedPromptRef } from '../../contracts/policy.ts';
import { PrepareOutput as PrepareOutputSchema, type PrepareOutput, type PreparePolicy } from '../../contracts/prepare.ts';
import type { AmbicodeConfig, ProjectConfig } from '../../contracts/config.ts';
import { MAX_SNAPSHOT_FILE_BYTES } from '../../config/defaults.ts';
import type { FileSystem } from '../../ports/filesystem.ts';
import { applicablePrepareStages } from '../../policy/resolve.ts';
import { configProvenance, policyProvenance } from '../../policy/provenance.ts';
import { normalizeRequirements, readRequirementEvidence } from '../../requirements/normalize.ts';
import { byteLength } from '../../snapshot/limits.ts';
import { AmbicodeError } from '../../util/errors.ts';
import { contentHash } from '../../util/hash.ts';
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
  const policies = [{ project, policy }];

  return toOutput({
    fs: runtime.fs,
    activity,
    project,
    paths,
    requirements,
    policy,
    // Config/pack/prompt provenance alongside requirement provenance, the
    // same composition `review`/`bundle` use (doc 04 P2.2 correction D): a
    // caller applying this policy needs to know what produced it, not only
    // what requirement evidence went in.
    policyProvenance: [...(await configProvenance(runtime.fs, workspace)), ...policyProvenance(policies)],
  });
}

async function toOutput(options: {
  fs: FileSystem;
  activity: Activity;
  project: ProjectConfig;
  paths: readonly string[];
  requirements: ReturnType<typeof normalizeRequirements>;
  policy: ResolvedPolicy;
  policyProvenance: PrepareOutput['provenance'];
}): Promise<PrepareOutput> {
  return PrepareOutputSchema.parse({
    command: 'prepare' as const,
    activity: options.activity,
    projectId: options.project.id,
    paths: [...options.paths],
    requirementMode: options.requirements.mode,
    requirements: options.requirements.sources,
    provenance: [...options.policyProvenance, ...options.requirements.provenance].sort((a, b) =>
      `${a.kind}${a.reference}`.localeCompare(`${b.kind}${b.reference}`),
    ),
    notices: options.requirements.notices,
    policy: await toPreparePolicy(options.fs, options.policy),
  });
}

async function toPreparePolicy(fs: FileSystem, policy: ResolvedPolicy): Promise<PreparePolicy> {
  const stages = new Set(applicablePrepareStages(policy.activity));
  const diagnostics = [...policy.diagnostics.map((diagnostic) => ({ ...diagnostic }))];

  const prompts: PreparePolicy['prompts'] = [];
  for (const prompt of policy.prompts) {
    if (!stages.has(prompt.stage)) continue; // Not applicable to this activity (doc 04 P2.2 correction D).
    const resolved = await resolvePreparePrompt(fs, prompt, diagnostics);
    if (resolved !== null) prompts.push(resolved);
  }

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
    prompts,
    commandDecisions: policy.commandDecisions.map((decision) => ({
      command: decision.command,
      action: decision.action,
      sources: decision.sources.map((source) => ({ ...source })),
    })),
    diagnostics,
  };
}

/**
 * Reads one prompt's bounded, hash-verified content (doc 04 P2.2 correction
 * D): bounded by the same configured limit a snapshot file uses — no second,
 * unbounded prompt-loading path — and the freshly read bytes must hash to
 * the same `contentHash` the resolver already recorded, so a caller applying
 * this content is never handed something that silently drifted from what was
 * resolved. Either failure is a diagnostic on the output, not a thrown error:
 * one oversized or unexpectedly-changed pack prompt should not fail every
 * other applicable rule and prompt this call would otherwise report.
 */
async function resolvePreparePrompt(
  fs: FileSystem,
  prompt: ResolvedPromptRef,
  diagnostics: PreparePolicy['diagnostics'],
): Promise<PreparePolicy['prompts'][number] | null> {
  let content: string;
  try {
    content = await fs.readText(prompt.absolutePath);
  } catch (cause) {
    diagnostics.push({
      severity: 'error',
      code: 'prompt-unreadable',
      message: `${prompt.packReference}: prompt "${prompt.declaredPath}" could not be read: ${cause instanceof Error ? cause.message : String(cause)}`,
      where: prompt.absolutePath,
    });
    return null;
  }

  if (byteLength(content) > MAX_SNAPSHOT_FILE_BYTES) {
    diagnostics.push({
      severity: 'error',
      code: 'prompt-too-large',
      message: `${prompt.packReference}: prompt "${prompt.declaredPath}" (${byteLength(content)} bytes) exceeds the ${MAX_SNAPSHOT_FILE_BYTES}-byte content limit, so its content was not included.`,
      where: prompt.absolutePath,
    });
    return null;
  }

  const actualHash = contentHash(content);
  if (actualHash !== prompt.contentHash) {
    diagnostics.push({
      severity: 'error',
      code: 'prompt-content-changed',
      message: `${prompt.packReference}: prompt "${prompt.declaredPath}" changed on disk between policy resolution and content delivery.`,
      where: prompt.absolutePath,
    });
    return null;
  }

  return {
    packId: prompt.packId,
    packReference: prompt.packReference,
    authority: prompt.authority,
    stage: prompt.stage,
    declaredPath: prompt.declaredPath,
    contentHash: prompt.contentHash,
    content,
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

  lines.push('', `prompts (${output.policy.prompts.length})`);
  for (const prompt of output.policy.prompts) {
    lines.push(`  ${prompt.stage}: ${prompt.packId} -> ${prompt.declaredPath} [${prompt.authority}, ${byteLength(prompt.content)} bytes]`);
  }
  if (output.policy.prompts.length === 0) lines.push('  (none apply)');

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
