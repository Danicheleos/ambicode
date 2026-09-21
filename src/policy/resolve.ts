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

  // Tracked so a load-time diagnostic about a pack's *content* (an unknown
  // command reference, an unreadable prompt file) can be told apart from one
  // about a pack that is simply not applicable to this activity/paths (doc 04
  // P2.4 correction B6/B7): a pack whose YAML never parsed has unknown
  // applicability and its diagnostic keeps blocking regardless, but a pack
  // that parsed fine and applies to some *other* activity, stage, project or
  // path must not block a request it was never relevant to.
  const consideredFilePaths = new Set(packs.map((loaded) => loaded.filePath));
  const applicableFilePaths = new Set<string>();

  for (const loaded of packs) {
    const pack = loaded.pack;
    if (!pack.activities.includes(activity)) continue;

    // With no paths, a pack contributes its activity-level content once; with
    // paths, it contributes only when it actually matches one (doc 05).
    const matchedPaths = pathsSupplied
      ? projectRelativePaths.filter((value) => matchesAnyGlob(value, pack.appliesTo))
      : [];
    if (pathsSupplied && matchedPaths.length === 0) continue;

    applicableFilePaths.add(loaded.filePath);
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
        remindOnEdit: rule.remindOnEdit,
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
    diagnostics: scopeDiagnostics(diagnostics, consideredFilePaths, applicableFilePaths),
  };
}

/**
 * A content-level diagnostic about a specific pack file (an unknown command
 * reference, an unreadable prompt) whose relevance depends on whether that
 * pack actually applies here. Structural diagnostics about the pack's own
 * validity (unparsable, duplicate id, replaces an unused built-in, ...) are
 * not in this set: those always block, because they are configuration
 * defects independent of any one activity/path request (doc 04 P2.4
 * correction B6).
 */
const PACK_SCOPED_DIAGNOSTIC_CODES: ReadonlySet<string> = new Set([
  'pack-unknown-command',
  'prompt-unreadable',
  'path-escape',
  'path-missing',
  'remind-on-edit-broad-pack',
]);

/**
 * Downgrades a pack-scoped diagnostic from `error` to `notice` when the pack
 * it belongs to parsed successfully but does not apply to this activity or
 * these paths (doc 04 P2.4 correction B6/B7): an error in an *applicable*
 * rule, prompt, or command decision still blocks; the same error in a valid
 * pack that simply does not match this request must not. A diagnostic whose
 * pack never parsed at all (`consideredFilePaths` does not know it) keeps
 * blocking, because its applicability genuinely cannot be established. The
 * diagnostic stays visible either way — only its severity, and therefore
 * whether it can block preparation, changes.
 */
function scopeDiagnostics(
  diagnostics: readonly Diagnostic[],
  consideredFilePaths: ReadonlySet<string>,
  applicableFilePaths: ReadonlySet<string>,
): Diagnostic[] {
  return diagnostics.map((diagnostic) => {
    if (diagnostic.severity !== 'error') return diagnostic;
    if (!PACK_SCOPED_DIAGNOSTIC_CODES.has(diagnostic.code)) return diagnostic;
    if (diagnostic.where === undefined) return diagnostic;
    const parsedSuccessfully = consideredFilePaths.has(diagnostic.where);
    const applicable = applicableFilePaths.has(diagnostic.where);
    if (parsedSuccessfully && !applicable) {
      return { ...diagnostic, severity: 'notice' };
    }
    return diagnostic;
  });
}

/**
 * Which prompt stages `ambicode prepare` surfaces per activity (doc 04 P2.2
 * correction D; doc 04 P2.3 adds `task`). `review` composes its own reviewer
 * prompt directly from `ResolvedPolicy.prompts` (`src/review/prompt.ts`) and
 * never calls `prepare`, so it is not listed here. `investigate` and `plan`
 * read their activity's `before-work` guidance before analysis and
 * `before-report` guidance before presenting their result. `task` additionally
 * reads `before-checks` guidance before it runs checks/review, since — unlike
 * investigate/plan — it actually performs an implementation and check cycle;
 * `before-review` remains owned exclusively by the isolated reviewer prompt
 * and is never applicable content for any `prepare` caller, regardless of
 * which activities a pack itself declares.
 */
export const PREPARE_PROMPT_STAGES: Readonly<Partial<Record<Activity, readonly PromptStage[]>>> = {
  investigate: ['before-work', 'before-report'],
  plan: ['before-work', 'before-report'],
  task: ['before-work', 'before-checks', 'before-report'],
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
