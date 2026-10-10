import type { ProjectConfig } from '#types/modules/config';
import {
  COMMAND_ACTION_PRECEDENCE,
  type Activity,
  type CommandAction,
  type PromptStage,
} from '#types/primitives';
import type {
  Diagnostic,
  ResolvedCommandDecision,
  ResolvedPolicy,
  ResolvedPromptRef,
  ResolvedRule,
} from '#types/modules/policy';
import { matchesAnyGlob } from '#util/glob';
import { normalizeRelative, toProjectRelative } from '#util/paths';
import type { PackWithPrompts } from './load.ts';

interface ResolveOptions {
  activity: Activity;
  project: ProjectConfig;
  packs: readonly PackWithPrompts[];
  paths: readonly string[];
  diagnostics?: readonly Diagnostic[];
}

export function resolvePolicy(options: ResolveOptions): ResolvedPolicy {
  const { activity, project, packs } = options;
  const projectRoot = normalizeRelative(project.root);

  const pathsSupplied = options.paths.length > 0;
  const projectRelativePaths = options.paths
    .map((value) => toProjectRelative(projectRoot, value))
    .filter((value): value is string => value !== null);

  const packEntries: ResolvedPolicy['packs'] = [];
  const rules: ResolvedRule[] = [];
  const prompts: ResolvedPromptRef[] = [];
  const decisionsByCommand = new Map<string, ResolvedCommandDecision>();

  for (const loaded of packs) {
    const pack = loaded.pack;
    if (!pack.activities.includes(activity)) continue;

    // With no paths, a pack contributes its activity-level content once; with
    // paths, only when it actually matches one.
    const matchedPaths = pathsSupplied
      ? projectRelativePaths.filter((value) => matchesAnyGlob(value, pack.appliesTo))
      : [];
    if (pathsSupplied && matchedPaths.length === 0) continue;

    packEntries.push({
      id: pack.id,
      reference: loaded.reference,
      authority: pack.authority,
      sourceLocation: pack.source.location,
      matchedPaths,
    });

    for (const rule of pack.rules) {
      rules.push({
        qualifiedId: `${pack.id}/${rule.id}`,
        packId: pack.id,
        packReference: loaded.reference,
        authority: pack.authority,
        sourceLocation: pack.source.location,
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

  // Sorting is presentation, never precedence.
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
    diagnostics: [...(options.diagnostics ?? [])],
  };
}

/**
 * `review` builds its own prompt and never calls `prepare`. `before-review`
 * belongs only to the isolated reviewer prompt; `task` alone adds `before-checks`
 * because it runs checks.
 */
const PREPARE_PROMPT_STAGES: Readonly<Partial<Record<Activity, readonly PromptStage[]>>> = {
  investigate: ['before-work', 'before-report'],
  plan: ['before-work', 'before-report'],
  task: ['before-work', 'before-checks', 'before-report'],
};

export function applicablePrepareStages(activity: Activity): readonly PromptStage[] {
  return PREPARE_PROMPT_STAGES[activity] ?? [];
}

function strongerAction(a: CommandAction, b: CommandAction): CommandAction {
  return COMMAND_ACTION_PRECEDENCE[a] >= COMMAND_ACTION_PRECEDENCE[b] ? a : b;
}

/** Absence is not permission: a command no pack mentions is never executed. */
export function decisionFor(policy: ResolvedPolicy, commandId: string): {
  action: CommandAction | 'undeclared';
  sources: ResolvedCommandDecision['sources'];
} {
  const decision = policy.commandDecisions.find((candidate) => candidate.command === commandId);
  return decision === undefined
    ? { action: 'undeclared', sources: [] }
    : { action: decision.action, sources: decision.sources };
}

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
