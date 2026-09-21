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
import { configProvenance, packProvenance } from '../../policy/provenance.ts';
import { normalizeRequirements, readRequirementEvidence } from '../../requirements/normalize.ts';
import { readSharedOperatingContract } from '../../policy/shared-contract.ts';
import { byteLength } from '../../snapshot/limits.ts';
import { AmbicodeError } from '../../util/errors.ts';
import { contentHash } from '../../util/hash.ts';
import { formatJsonOutput } from '../../util/json-output.ts';
import type { ParsedArgs } from '../args.ts';
import { absoluteEvidencePath } from '../target-option.ts';
import { navigationFor } from '../../code-intelligence/navigation.ts';

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

  // Read once, here, so every authoring skill receives it through this one
  // boundary rather than locating and reading it independently (doc 04 P2.4
  // correction A4). An unreadable canonical contract is a packaging defect,
  // not a per-project configuration gap, so it fails the whole preparation
  // rather than becoming a silent omission.
  let sharedOperatingContract;
  try {
    sharedOperatingContract = await readSharedOperatingContract(runtime.fs, runtime.pluginRoot);
  } catch (cause) {
    throw new AmbicodeError(
      'shared-contract-unreadable',
      'The canonical shared operating contract could not be read from this installation.',
      { details: [cause instanceof Error ? cause.message : String(cause)] },
    );
  }

  const draft = await toDraftOutput({
    fs: runtime.fs,
    activity,
    project,
    paths,
    requirements,
    policy,
    sharedOperatingContract,
    // Config and pack provenance alongside requirement provenance, the same
    // composition `review`/`bundle` use for packs (doc 04 P2.2 correction D).
    // Prompt provenance is deliberately *not* included here: unlike a pack —
    // which is fully applicable once matched — a resolved prompt may still be
    // filtered by stage or fail content resolution, and provenance must never
    // claim content that was not actually delivered (doc 04 P2.3 correction
    // B). `toDraftOutput` adds prompt provenance itself, from the
    // stage-filtered, content-resolved prompts it actually returns. The shared
    // contract's own provenance entry is added the same way, immediately below.
    policyProvenance: [
      ...(await configProvenance(runtime.fs, workspace)),
      ...packProvenance(policies),
      { kind: 'prompt', reference: sharedOperatingContract.reference, contentHash: sharedOperatingContract.contentHash },
    ],
  });

  // Blocking, not silently success-shaped (doc 04 P2.3 correction B): an
  // `error` diagnostic means applicable trusted content — a pack, a rule, or
  // a prompt this activity should have received — was omitted, not merely
  // noted. `prepare` never hands back a policy that looks complete while
  // quietly missing something applicable.
  const blocking = draft.policy.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (blocking.length > 0) {
    throw new AmbicodeError(
      'preparation-blocked',
      'Preparation cannot return a complete policy: applicable content was omitted.',
      {
        details: blocking.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
      },
    );
  }

  return finalizePrepareOutput(draft, workspace.config.review.maxContextBytes);
}

interface PrepareDraftOutput extends Omit<PrepareOutput, 'contextBudget'> {}

/**
 * Resolves the self-referential `contextBudget.measuredBytes` field to a
 * stable value and returns the exact `PrepareOutput` the `--json` path will
 * print (doc 04 P2.4 correction B1/B2): `measuredBytes` is itself part of
 * the object it measures, so it is computed by serializing a candidate with
 * the previous guess, re-measuring, and repeating until the value stops
 * moving — which happens immediately unless `measuredBytes`'s own digit
 * count changes between guesses, in which case one further pass converges
 * it. Serialization uses the one canonical `formatJsonOutput` the CLI's
 * `--json` dispatch also uses (`src/cli/main.ts`), so a test can assert
 * `Buffer.byteLength(actualCliStdout) === parsed.contextBudget.measuredBytes`
 * against the real bundled CLI, not an approximation of what it prints.
 */
function finalizePrepareOutput(draft: PrepareDraftOutput, limitBytes: number): PrepareOutput {
  let measuredBytes = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = PrepareOutputSchema.parse({
      ...draft,
      contextBudget: { measuredBytes, limitBytes },
    });
    const actualBytes = byteLength(formatJsonOutput(candidate));
    if (actualBytes === measuredBytes) {
      if (actualBytes > limitBytes) throwPreparationTooLarge(draft, actualBytes, limitBytes);
      return candidate;
    }
    measuredBytes = actualBytes;
  }
  throw new AmbicodeError(
    'internal',
    'Could not compute a stable measured byte count for this preparation output.',
    { details: [`last measured value: ${measuredBytes} bytes`] },
  );
}

function throwPreparationTooLarge(draft: PrepareDraftOutput, measuredBytes: number, limitBytes: number): never {
  const requirementBytes = draft.requirements.reduce((total, source) => total + byteLength(source.content), 0);
  const ruleBytes = draft.policy.rules.reduce((total, rule) => total + byteLength(rule.instruction), 0);
  const promptBytes = draft.policy.prompts.reduce((total, prompt) => total + byteLength(prompt.content), 0);
  const noticeBytes = draft.notices.reduce((total, notice) => total + byteLength(notice), 0);
  const diagnosticBytes = draft.policy.diagnostics.reduce((total, diagnostic) => total + byteLength(diagnostic.message), 0);
  const sharedContractBytes = byteLength(draft.sharedOperatingContract.content);

  throw new AmbicodeError(
    'preparation-too-large',
    'This preparation exceeds the configured aggregate context budget, so it was not returned.',
    {
      field: 'review',
      details: [
        `measured: ${measuredBytes} bytes, limit ${limitBytes} (review.maxContextBytes)`,
        'measured components:',
        `  shared operating contract: ${sharedContractBytes} bytes`,
        `  requirement content: ${requirementBytes} bytes`,
        `  rule instructions: ${ruleBytes} bytes`,
        `  prompt content: ${promptBytes} bytes`,
        `  notices: ${noticeBytes} bytes`,
        `  diagnostics: ${diagnosticBytes} bytes`,
        'Supply fewer or smaller requirements, narrow the applicable paths/project, or raise review.maxContextBytes in .ambicode/config.yaml deliberately.',
        'AMBICODE does not truncate applicable content to fit and then report on the whole.',
      ],
    },
  );
}

async function toDraftOutput(options: {
  fs: FileSystem;
  activity: Activity;
  project: ProjectConfig;
  paths: readonly string[];
  requirements: ReturnType<typeof normalizeRequirements>;
  policy: ResolvedPolicy;
  sharedOperatingContract: PrepareOutput['sharedOperatingContract'];
  policyProvenance: PrepareOutput['provenance'];
}): Promise<PrepareDraftOutput> {
  const preparePolicy = await toPreparePolicy(options.fs, options.policy);

  // Prompt provenance only for what `preparePolicy.prompts` actually
  // delivers — stage-filtered and content-resolved — never for a prompt this
  // activity's pack declared but that was filtered out or failed content
  // resolution (doc 04 P2.3 correction B).
  const promptProvenance: PrepareOutput['provenance'] = preparePolicy.prompts.map((prompt) => ({
    kind: 'prompt' as const,
    reference: `${prompt.packReference}:${prompt.declaredPath}@${prompt.stage}`,
    contentHash: prompt.contentHash,
  }));

  return {
    command: 'prepare' as const,
    activity: options.activity,
    projectId: options.project.id,
    paths: [...options.paths],
    requirementMode: options.requirements.mode,
    requirements: options.requirements.sources,
    provenance: [...options.policyProvenance, ...promptProvenance, ...options.requirements.provenance].sort((a, b) =>
      `${a.kind}${a.reference}`.localeCompare(`${b.kind}${b.reference}`),
    ),
    notices: options.requirements.notices,
    policy: preparePolicy,
    navigation: navigationFor(options.project.ecosystem),
    sharedOperatingContract: options.sharedOperatingContract,
  };
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
      remindOnEdit: rule.remindOnEdit,
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
    `navigation: ${output.navigation.strategy} (${output.navigation.plugin}; status observed by the current session)`,
    `shared operating contract: ${output.sharedOperatingContract.reference} [${byteLength(output.sharedOperatingContract.content)} bytes] — use --json to read its content`,
  ];

  if (output.requirements.length > 0) {
    lines.push(...output.requirements.map((source) => `  ${source.id}  ${source.url}`));
  }
  lines.push(`  evidence: ${output.navigation.evidenceRequirement}`);
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

  lines.push(
    '',
    `context budget: ${output.contextBudget.measuredBytes}/${output.contextBudget.limitBytes} bytes (review.maxContextBytes)`,
  );
  return lines.join('\n');
}
