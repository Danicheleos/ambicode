import type { ProjectConfig } from '../contracts/config.ts';
import {
  COMMAND_ACTION_PRECEDENCE,
  type Activity,
  type CommandAction,
  type PromptStage,
} from '../contracts/primitives.ts';
import type {
  Diagnostic,
  ResolvedCommandDecision,
  ResolvedPolicy,
  ResolvedPromptRef,
  ResolvedRule,
} from '../contracts/policy.ts';
import { matchesAnyGlob } from '../util/glob.ts';
import { normalizeRelative } from '../util/paths.ts';
import type { PackWithPrompts } from './load.ts';

export interface ResolveOptions {
  activity: Activity;
  project: ProjectConfig;
  packs: readonly PackWithPrompts[];
  /** Repository-relative paths under review; empty resolves activity-level content only. */
  paths: readonly string[];
  diagnostics?: readonly Diagnostic[];
}

/**
 * The one resolver. Skills, checks, the reviewer prompt, and the page all read
 * its output rather than re-deriving scope (D14).
 */
export function resolvePolicy(options: ResolveOptions): ResolvedPolicy {
  const { activity, project, packs } = options;
  const diagnostics: Diagnostic[] = [...(options.diagnostics ?? [])];
  const projectRoot = normalizeRelative(project.root);

  // "No paths supplied" and "paths supplied, none of them in this project" are
  // different questions. Collapsing them would widen an out-of-scope request
  // into the whole activity-level checklist.
  const pathsSupplied = options.paths.length > 0;
  const projectRelativePaths = options.paths
    .map((value) => toProjectRelative(projectRoot, value))
    .filter((value): value is string => value !== null);

  if (pathsSupplied && projectRelativePaths.length === 0) {
    return {
      activity,
      projectId: project.id,
      packs: [],
      rules: [],
      prompts: [],
      commandDecisions: [],
      diagnostics: [
        ...diagnostics,
        {
          severity: 'notice',
          code: 'paths-outside-project',
          message: `None of the supplied paths are inside project "${project.id}" (root "${project.root}"), so no policy from it applies.`,
        },
      ],
    };
  }

  const packEntries: ResolvedPolicy['packs'] = [];
  const rules: ResolvedRule[] = [];
  const prompts: ResolvedPromptRef[] = [];
  const decisionsByCommand = new Map<string, ResolvedCommandDecision>();

  for (const loaded of packs) {
    const pack = loaded.pack;
    if (!pack.activities.includes(activity)) continue;

    // With no paths, a pack contributes its activity-level content once; with
    // paths, it contributes only when it actually matches one (doc 05).
    const matchedPaths = pathsSupplied
      ? projectRelativePaths.filter((value) => matchesAnyGlob(value, pack.appliesTo))
      : [];
    if (pathsSupplied && matchedPaths.length === 0) continue;

    packEntries.push({
      id: pack.id,
      reference: loaded.reference,
      origin: loaded.origin,
      authority: pack.authority,
      sourceLocation: pack.source.location,
      ...(pack.source.externalVersion === undefined
        ? {}
        : { sourceExternalVersion: pack.source.externalVersion }),
      contentHash: loaded.contentHash,
      ...(loaded.replacedReference === undefined
        ? {}
        : { replacedReference: loaded.replacedReference }),
      matchedPaths,
    });

    for (const rule of pack.rules) {
      rules.push({
        qualifiedId: `${pack.id}/${rule.id}`,
        packId: pack.id,
        packReference: loaded.reference,
        authority: pack.authority,
        sourceLocation: pack.source.location,
        ...(pack.source.externalVersion === undefined
          ? {}
          : { sourceExternalVersion: pack.source.externalVersion }),
        category: rule.category,
        instruction: rule.instruction,
        check: rule.check,
      });
    }

    prompts.push(...loaded.resolvedPrompts);

    for (const decision of pack.commandPolicy) {
      const existing = decisionsByCommand.get(decision.command);
      const source = {
        packId: pack.id,
        packReference: loaded.reference,
        action: decision.action,
        ...(decision.reason === undefined ? {} : { reason: decision.reason }),
      };
      if (existing === undefined) {
        decisionsByCommand.set(decision.command, {
          command: decision.command,
          action: decision.action,
          sources: [source],
        });
      } else {
        existing.sources.push(source);
        existing.action = strongerAction(existing.action, decision.action);
      }
    }
  }

  // Sorting is presentation, never precedence (doc 05).
  packEntries.sort((a, b) => a.id.localeCompare(b.id));
  rules.sort((a, b) => a.qualifiedId.localeCompare(b.qualifiedId));
  prompts.sort(
    (a, b) => a.stage.localeCompare(b.stage) || a.packId.localeCompare(b.packId) || a.declaredPath.localeCompare(b.declaredPath),
  );
  const commandDecisions = [...decisionsByCommand.values()].sort((a, b) =>
    a.command.localeCompare(b.command),
  );
  for (const decision of commandDecisions) {
    decision.sources.sort((a, b) => a.packId.localeCompare(b.packId));
  }

  return {
    activity,
    projectId: project.id,
    packs: packEntries,
    rules: dedupeBy(rules, (rule) => rule.qualifiedId),
    prompts: dedupeBy(prompts, (prompt) => `${prompt.stage}::${prompt.absolutePath}`),
    commandDecisions,
    diagnostics,
  };
}

/**
 * Which prompt stages `ambicode prepare` surfaces per activity (doc 04 P2.2
 * correction D). `review`/`task` compose their own reviewer prompt directly
 * from `ResolvedPolicy.prompts` (`src/review/prompt.ts`) and never call
 * `prepare`, so only `investigate` and `plan` are listed: both read their
 * activity's `before-work` guidance before analysis and `before-report`
 * guidance before presenting their result. Reviewer-only stages
 * (`before-checks`, `before-review`) are never applicable content for either,
 * regardless of which activities a pack itself declares.
 */
export const PREPARE_PROMPT_STAGES: Readonly<Partial<Record<Activity, readonly PromptStage[]>>> = {
  investigate: ['before-work', 'before-report'],
  plan: ['before-work', 'before-report'],
};

/** The stages `ambicode prepare` includes prompt content for; empty for an activity it does not serve (doc 04 P2.2 correction D). */
export function applicablePrepareStages(activity: Activity): readonly PromptStage[] {
  return PREPARE_PROMPT_STAGES[activity] ?? [];
}

export function strongerAction(a: CommandAction, b: CommandAction): CommandAction {
  return COMMAND_ACTION_PRECEDENCE[a] >= COMMAND_ACTION_PRECEDENCE[b] ? a : b;
}

/**
 * The decision for a command no pack mentions. Absence is not permission, so a
 * catalog command is never executed because nothing forbade it (doc 05).
 */
export function decisionFor(policy: ResolvedPolicy, commandId: string): {
  action: CommandAction | 'undeclared';
  sources: ResolvedCommandDecision['sources'];
} {
  const decision = policy.commandDecisions.find((candidate) => candidate.command === commandId);
  return decision === undefined
    ? { action: 'undeclared', sources: [] }
    : { action: decision.action, sources: decision.sources };
}

/** Explains a refusal with the pack that caused it and how to change it (doc 05). */
export function explainRefusal(policy: ResolvedPolicy, commandId: string): string {
  const { action, sources } = decisionFor(policy, commandId);
  if (action === 'forbid') {
    const forbidding = sources.filter((source) => source.action === 'forbid');
    const reasons = forbidding
      .map((source) => `${source.packReference}${source.reason === undefined ? '' : `: ${source.reason}`}`)
      .join('; ');
    return `Command "${commandId}" is forbidden by ${reasons}. Change that pack's commandPolicy deliberately if this is no longer the project's policy.`;
  }
  if (action === 'propose') {
    return `Command "${commandId}" is proposed, not run automatically. Approve this specific run, or change the owning pack's commandPolicy.`;
  }
  return `Command "${commandId}" is not declared by any enabled pack for this activity, so AMBICODE does not run it. Add a "run" decision to a pack that applies here.`;
}

function toProjectRelative(projectRoot: string, repositoryRelativePath: string): string | null {
  const value = normalizeRelative(repositoryRelativePath);
  if (projectRoot === '') return value;
  if (value === projectRoot) return '';
  return value.startsWith(`${projectRoot}/`) ? value.slice(projectRoot.length + 1) : null;
}

function dedupeBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const identity = key(item);
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(item);
  }
  return result;
}
