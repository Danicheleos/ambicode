import path from 'node:path';
import {
  openWorkspace,
  projectForRequest,
  resolvePolicyFor,
  toRepositoryRelative,
  type Runtime,
} from '../../composition/root.ts';
import { Activity, RuleCategory } from '../../contracts/primitives.ts';
import type { ResolvedPolicy, ResolvedPromptRef } from '../../contracts/policy.ts';
import {
  PrepareCompactOutput as PrepareCompactOutputSchema,
  PrepareOutput as PrepareOutputSchema,
  type PrepareCompactOutput,
  type PrepareContextBudget,
  type PrepareOutput,
  type PreparePolicy,
} from '../../contracts/prepare.ts';
import type { ProjectConfig } from '../../contracts/config.ts';
import { MAX_SNAPSHOT_FILE_BYTES, TASKS_DIR } from '../../config/defaults.ts';
import { taskSlugFor } from '../../review/review-name.ts';
import { mintTaskSlug } from '../../task/slug.ts';
import type { FileSystem } from '../../ports/filesystem.ts';
import { applicablePrepareStages } from '../../policy/resolve.ts';
import { configProvenance, packProvenance } from '../../policy/provenance.ts';
import { canonicalUrl, loadRequirementEvidence, normalizeRequirements } from '../../requirements/normalize.ts';
import { readSharedOperatingContract } from '../../policy/shared-contract.ts';
import { byteLength } from '../../snapshot/limits.ts';
import { AmbicodeError } from '../../util/errors.ts';
import { contentHash } from '../../util/hash.ts';
import { formatJsonOutput, type JsonFormat } from '../../util/json-output.ts';
import type { ParsedArgs } from '../args.ts';
import { evidenceSource } from '../target-option.ts';
import { navigationFor } from '../../code-intelligence/navigation.ts';
import {
  locate,
  termsFromRequirements,
  PREPARE_REASONS_PER_CANDIDATE,
  PREPARE_SHORTLIST_LIMIT,
  type LocateShortlist,
} from '../../code-intelligence/locate.ts';
import type { Git } from '../../git/git.ts';

export const PREPARE_OPTIONS = {
  values: ['activity', 'project', 'evidence', 'task-open'],
  repeated: ['requirement', 'term'],
  flags: ['json', 'verbose', 'with-contract'],
  positionals: true,
} as const;

export type { PrepareOutput };

export interface PrepareDetail extends Omit<PrepareOutput, 'contextBudget'> {}

export interface PrepareRun {
  /** Exactly what `--json` prints, and what `contextBudget` measures. */
  data: PrepareOutput | PrepareCompactOutput;
  detail: PrepareDetail;
  /**
   * A field rather than a print-site default: `contextBudget.measuredBytes` is
   * computed against exactly this format, and main.ts must print with the same.
   */
  json: JsonFormat;
  /** Discriminates the union. */
  shape: 'compact' | 'verbose';
}

/**
 * Makes no provider, reviewer or publication call, runs no project command and
 * writes nothing. `--verbose` carries the same resolved policy as the default
 * compact projection, only with more framing.
 */
export async function runPrepare(
  runtime: Runtime,
  args: ParsedArgs,
  options: { shortlistLimit?: number } = {},
): Promise<PrepareRun> {
  const workspace = await openWorkspace(runtime);

  const activity = requireActivity(args.value('activity'));
  const paths = await Promise.all(args.positionals.map((value) => toRepositoryRelative(workspace, value)));

  // Requirements first: an inaccessible or contradictory source must stop the
  // run before policy is even resolved.
  const evidence = evidenceSource(runtime, args.value('evidence'));
  const requirements = normalizeRequirements({
    urls: args.all('requirement'),
    evidence: evidence === null ? null : await loadRequirementEvidence(runtime, evidence),
    configuredServer: workspace.config.requirements.mcpServer,
  });

  const project = projectForRequest(workspace.config, args.value('project'), paths);

  const policy = await resolvePolicyFor({ workspace, project, activity, paths });
  const policies = [{ project, policy }];

  // An unreadable canonical contract is a packaging defect, not a project
  // configuration gap, so it fails the whole preparation.
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

  // Reads git only, builds no index and writes nothing; an empty shortlist
  // stays empty rather than widening to the project.
  const shortlist = await shortlistFor({
    git: workspace.git,
    project,
    statedTerms: args.all('term'),
    requirements: requirements.sources,
    limit: options.shortlistLimit ?? PREPARE_SHORTLIST_LIMIT,
  });

  const task = await taskFor(runtime.fs, workspace.repositoryRoot, args.value('task-open'), args.all('requirement'), requirements.sources);

  const detail = await toDraftOutput({
    fs: runtime.fs,
    task,
    activity,
    project,
    lspRequired: workspace.config.requirements.lsp.length > 0,
    paths,
    requirements,
    policy,
    shortlist,
    sharedOperatingContract,
    // No prompt provenance here: `toDraftOutput` adds it from the prompts it
    // actually delivers.
    policyProvenance: [
      ...(await configProvenance(runtime.fs, workspace)),
      ...packProvenance(policies),
      { kind: 'prompt', reference: sharedOperatingContract.reference, contentHash: sharedOperatingContract.contentHash },
    ],
  });

  // An `error` diagnostic means applicable trusted content was omitted, so it
  // blocks rather than returning a policy that looks complete.
  const blocking = detail.policy.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (blocking.length > 0) {
    throw new AmbicodeError(
      'preparation-blocked',
      'Preparation cannot return a complete policy: applicable content was omitted.',
      {
        details: blocking.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
      },
    );
  }

  const limitBytes = workspace.config.review.maxContextBytes;
  if (args.flag('verbose')) {
    const data = measureAgainstOwnBytes(
      (contextBudget) => PrepareOutputSchema.parse({ ...detail, contextBudget }),
      'pretty',
      limitBytes,
      detail,
    );
    return { data, detail, json: 'pretty', shape: 'verbose' };
  }

  const compact = toCompactOutput(detail, { includeContractContent: args.flag('with-contract') });
  const data = measureAgainstOwnBytes(
    (contextBudget) => PrepareCompactOutputSchema.parse({ ...compact, contextBudget }),
    'compact',
    limitBytes,
    detail,
  );
  return { data, detail, json: 'compact', shape: 'compact' };
}

/**
 * `measuredBytes` is part of the object it measures: re-serialize with the last
 * guess until it stops moving, using the same `formatJsonOutput` and format the
 * CLI prints with, so it equals the real stdout byte count.
 */
function measureAgainstOwnBytes<T>(
  build: (contextBudget: PrepareContextBudget) => T,
  format: JsonFormat,
  limitBytes: number,
  detail: PrepareDetail,
): T {
  let measuredBytes = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = build({ measuredBytes, limitBytes });
    const actualBytes = byteLength(formatJsonOutput(candidate, format));
    if (actualBytes === measuredBytes) {
      if (actualBytes > limitBytes) throwPreparationTooLarge(detail, actualBytes, limitBytes);
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

/**
 * Rules were 5.5KB of a 9.4KB BE payload (58%). Investigate edits nothing and plan writes no code, so
 * neither acts on them; `task` and `review` carry all. Left out with a count and the command that reads them.
 */
const RULE_CATEGORIES_NOT_CARRIED: Partial<Record<Activity, readonly RuleCategory[]>> = {
  investigate: RuleCategory.options,
  plan: ['code-style'],
};

function ruleCarriedFor(activity: Activity, category: RuleCategory): boolean {
  return !(RULE_CATEGORIES_NOT_CARRIED[activity] ?? []).includes(category);
}

/**
 * Decides nothing about what applies; drops per-rule constants, defaults,
 * hook-only metadata, setup guidance and the contract body the hook already delivered.
 */
export function toCompactOutput(
  detail: PrepareDetail,
  options: { includeContractContent: boolean },
): Omit<PrepareCompactOutput, 'contextBudget'> {
  const carried = detail.policy.rules.filter((rule) => ruleCarriedFor(detail.activity, rule.category));
  const omitted = detail.policy.rules.length - carried.length;
  const packs = detail.policy.packs.map((pack) => {
    const rules = carried
      .filter((rule) => rule.packId === pack.id)
      .map((rule) => ({
        id: rule.qualifiedId.startsWith(`${rule.packId}/`)
          ? rule.qualifiedId.slice(rule.packId.length + 1)
          : rule.qualifiedId,
        category: rule.category,
        instruction: rule.instruction,
        check: rule.checkExplanation,
        ...(rule.checkKind === 'none' ? { checkKind: 'none' as const } : {}),
        ...(rule.checkCommand === null ? {} : { checkCommand: rule.checkCommand }),
      }));
    return {
      id: pack.id,
      reference: pack.reference,
      authority: pack.authority,
      ...(pack.replacedReference === undefined ? {} : { replacedReference: pack.replacedReference }),
      ...(rules.length === 0 ? {} : { rules }),
    };
  });

  const commandDecisions = detail.policy.commandDecisions.map((decision) => {
    const [only] = decision.sources;
    if (decision.sources.length === 1 && only !== undefined) {
      return {
        command: decision.command,
        action: decision.action,
        ...(decision.unavailable === true ? { unavailable: true as const } : {}),
        pack: only.packReference,
        ...(only.reason === undefined ? {} : { reason: only.reason }),
      };
    }
    return {
      command: decision.command,
      action: decision.action,
      ...(decision.unavailable === true ? { unavailable: true as const } : {}),
      sources: decision.sources.map((source) => ({
        pack: source.packReference,
        ...(source.action === decision.action ? {} : { action: source.action }),
        ...(source.reason === undefined ? {} : { reason: source.reason }),
      })),
    };
  });

  return {
    command: 'prepare' as const,
    activity: detail.activity,
    projectId: detail.projectId,
    ...(detail.paths.length === 0 ? {} : { paths: detail.paths }),
    requirementMode: detail.requirementMode,
    ...(detail.requirements.length === 0 ? {} : { requirements: detail.requirements }),
    ...(detail.notices.length === 0 ? {} : { notices: detail.notices }),
    ...(detail.task === undefined ? {} : { task: detail.task }),
    navigation: {
      strategy: detail.navigation.strategy,
      ecosystem: detail.navigation.ecosystem,
      evidenceRequirement: detail.navigation.evidenceRequirement,
      readGuidance: detail.navigation.readGuidance,
      ...(detail.navigation.shortlist === undefined ? {} : { shortlist: detail.navigation.shortlist }),
    },
    policy: {
      packs,
      ...(omitted === 0
        ? {}
        : { rulesOmitted: { count: omitted, read: `ambicode policy --activity ${detail.activity} --json [--rule <pack/rule>]...` } }),
      ...(detail.policy.prompts.length === 0 ? {} : { prompts: detail.policy.prompts }),
      ...(commandDecisions.length === 0 ? {} : { commandDecisions }),
      ...(detail.policy.diagnostics.length === 0 ? {} : { diagnostics: detail.policy.diagnostics }),
    },
    sharedOperatingContract: {
      reference: detail.sharedOperatingContract.reference,
      contentHash: detail.sharedOperatingContract.contentHash,
      ...(options.includeContractContent
        ? { content: detail.sharedOperatingContract.content }
        : {}),
    },
    provenance: detail.provenance,
  };
}

function throwPreparationTooLarge(detail: PrepareDetail, measuredBytes: number, limitBytes: number): never {
  const requirementBytes = detail.requirements.reduce((total, source) => total + byteLength(source.content), 0);
  const ruleBytes = detail.policy.rules.reduce((total, rule) => total + byteLength(rule.instruction), 0);
  const promptBytes = detail.policy.prompts.reduce((total, prompt) => total + byteLength(prompt.content), 0);
  const noticeBytes = detail.notices.reduce((total, notice) => total + byteLength(notice), 0);
  const diagnosticBytes = detail.policy.diagnostics.reduce((total, diagnostic) => total + byteLength(diagnostic.message), 0);
  const sharedContractBytes = byteLength(detail.sharedOperatingContract.content);

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

async function shortlistFor(options: {
  git: Git;
  project: ProjectConfig;
  statedTerms: readonly string[];
  requirements: readonly { title: string; content: string }[];
  limit: number;
}): Promise<PrepareDetail['navigation']['shortlist']> {
  const stated = options.statedTerms.filter((term) => term.trim() !== '');
  const derived = stated.length > 0 ? [] : termsFromRequirements(options.requirements);
  const terms = stated.length > 0 ? stated : derived;
  if (terms.length === 0) return undefined;

  const found: LocateShortlist = await locate({
    git: options.git,
    project: options.project,
    terms,
    limit: options.limit,
  });
  // Every term was shorter than the minimum; `ambicode locate` reports that in
  // full, since a `prepare` payload is not the place to explain it.
  if (found.terms.length === 0) return undefined;

  const limitations =
    derived.length === 0
      ? found.limitations
      : [
          'Terms were derived from the requirement text by word frequency, not stated by the caller; pass --term to narrow them.',
          ...found.limitations,
        ];
  return {
    terms: found.terms,
    candidates: found.candidates.map((candidate) => ({
      ...candidate,
      reasons: candidate.reasons.slice(0, PREPARE_REASONS_PER_CANDIDATE),
    })),
    ...(limitations.length === 0 ? {} : { limitations }),
  };
}

/**
 * Absent unless the caller asked with `--task-open`. A requirement's id wins over the text, in the order the
 * caller gave the URLs, as `review` names its directory: the ticket, not its Confluence page.
 */
async function taskFor(
  fs: FileSystem,
  repositoryRoot: string,
  text: string | null,
  urls: readonly string[],
  sources: readonly { id: string; url: string }[],
): Promise<PrepareOutput['task']> {
  if (text === null) return undefined;
  const named = urls
    .map((url) => sources.find((source) => canonicalUrl(source.url) === canonicalUrl(url))?.id)
    .filter((id): id is string => id !== undefined);
  const slug = taskSlugFor({ requirementIds: named.length > 0 ? named : sources.map((source) => source.id), task: named.length > 0 || sources.length > 0 ? null : mintTaskSlug(text) });
  if (slug === null) {
    throw new AmbicodeError('bad-argument', '"--task-open" needs a ticket id or the request in words; it got nothing to name a task from.', { field: 'task-open' });
  }
  const directory = `${TASKS_DIR}/${slug}`;
  return { slug, directory, existing: await fs.exists(path.join(repositoryRoot, directory)) };
}

async function toDraftOutput(options: {
  task: PrepareOutput['task'];
  fs: FileSystem;
  activity: Activity;
  project: ProjectConfig;
  lspRequired: boolean;
  paths: readonly string[];
  requirements: ReturnType<typeof normalizeRequirements>;
  policy: ResolvedPolicy;
  shortlist: PrepareDetail['navigation']['shortlist'];
  sharedOperatingContract: PrepareOutput['sharedOperatingContract'];
  policyProvenance: PrepareOutput['provenance'];
}): Promise<PrepareDetail> {
  const preparePolicy = await toPreparePolicy(options.fs, options.policy, options.project.commands);

  // Only prompts actually delivered (stage-filtered, content-resolved): provenance
  // must never claim content that a filter or failed resolution withheld.
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
    ...(options.task === undefined ? {} : { task: options.task }),
    navigation: {
      ...navigationFor(options.project.ecosystem, options.lspRequired),
      ...(options.shortlist === undefined ? {} : { shortlist: options.shortlist }),
    },
    policy: preparePolicy,
    sharedOperatingContract: options.sharedOperatingContract,
  };
}

async function toPreparePolicy(
  fs: FileSystem,
  policy: ResolvedPolicy,
  commands: ProjectConfig['commands'],
): Promise<PreparePolicy> {
  const stages = new Set(applicablePrepareStages(policy.activity));
  const diagnostics = [...policy.diagnostics.map((diagnostic) => ({ ...diagnostic }))];

  const prompts: PreparePolicy['prompts'] = [];
  for (const prompt of policy.prompts) {
    if (!stages.has(prompt.stage)) continue; // Not applicable to this activity.
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
      ...(commands[decision.command] === null ? { unavailable: true as const } : {}),
      sources: decision.sources.map((source) => ({ ...source })),
    })),
    diagnostics,
  };
}

/**
 * Bounded by the snapshot-file limit and must hash to the resolver's `contentHash`.
 * Either failure is a diagnostic, not a throw, so one bad prompt does not fail
 * every other rule and prompt.
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
 * Renders from everything resolved whichever shape `--json` would emit; the
 * budget it reports is the emitted payload's.
 */
export function renderPrepare(run: PrepareRun): string {
  const output = run.detail;
  const lines = [
    `activity: ${output.activity}`,
    `project:  ${output.projectId}`,
    `paths:    ${output.paths.join(', ') || '(none supplied — activity-level content only)'}`,
    `requirements: ${output.requirementMode}`,
    `navigation: ${output.navigation.strategy} (${output.navigation.plugin}; status observed by the current session)`,
    `shared operating contract: ${output.sharedOperatingContract.reference} [${byteLength(output.sharedOperatingContract.content)} bytes] — delivered once per session by the AMBICODE hook; --with-contract inlines it`,
  ];

  if (output.requirements.length > 0) {
    lines.push(...output.requirements.map((source) => `  ${source.id}  ${source.url}`));
  }
  if (output.task !== undefined) lines.push(`task:     ${output.task.slug} (${output.task.directory}${output.task.existing ? ', already exists' : ''})`);
  lines.push(`  evidence: ${output.navigation.evidenceRequirement}`);
  lines.push(`  reading: ${output.navigation.readGuidance}`);

  const shortlist = output.navigation.shortlist;
  if (shortlist !== undefined) {
    lines.push('', `boundary shortlist for ${shortlist.terms.join(', ')} — a hypothesis, confirm each candidate`);
    for (const candidate of shortlist.candidates) {
      lines.push(`  ${candidate.path}  [${candidate.score}] ${candidate.reasons.join('; ')}`);
    }
    if (shortlist.candidates.length === 0) lines.push('  (none — nothing matched well enough to start from)');
    for (const limitation of shortlist.limitations ?? []) lines.push(`  ! ${limitation}`);
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
    lines.push(
      `  ${decision.command}: ${decision.action}${decision.unavailable === true ? ' (unavailable: null in config, never runs)' : ''}`,
    );
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
    `context budget: ${run.data.contextBudget.measuredBytes}/${run.data.contextBudget.limitBytes} bytes (review.maxContextBytes, ${run.shape} --json shape)`,
  );
  return lines.join('\n');
}
