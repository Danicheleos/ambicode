import { openWorkspace, resolvePolicyFor } from '#composition/root';
import { MAX_SNAPSHOT_FILE_BYTES } from '#types/defaults';
import type { ProjectConfig } from '#types/config';
import type { ResolvedRule, StagePayload } from '#types/policy';
import { Activity, RuleCategory, type PromptStage } from '#types/primitives';
import { contentHash } from '#util/hash';
import { applicablePrepareStages } from './packs/resolve.ts';
import type { Runtime } from '#types/composition';

export const STAGE_LIMITS: Record<PromptStage, number> = { 'before-work': 4096, 'before-report': 1536, 'before-checks': 1536, 'before-review': 2048 };

/**
 * Investigate edits nothing and plan writes no code, so neither acts on those rules; `task` and `review` carry all.
 * Left out with a count and the command that reads them (D9).
 */
export const RULE_CATEGORIES_NOT_CARRIED: Partial<Record<Activity, readonly RuleCategory[]>> = {
  investigate: RuleCategory.options,
  plan: ['code-style'],
};

export const ruleCarriedFor = (activity: Activity, category: RuleCategory): boolean => !(RULE_CATEGORIES_NOT_CARRIED[activity] ?? []).includes(category);

/** Task's code-style rules go before work when there are at most this many, else before the checks (07-G4). */
export const CODE_STYLE_BEFORE_WORK = 8;

function stageRules(activity: Activity, stage: PromptStage, rules: readonly ResolvedRule[]): readonly ResolvedRule[] {
  const style = rules.filter((rule) => rule.category === 'code-style');
  const late = activity === 'task' && style.length > CODE_STYLE_BEFORE_WORK;
  if (stage === 'before-checks') return late ? style : [];
  return late && stage === 'before-work' ? rules.filter((rule) => rule.category !== 'code-style') : rules;
}

const render = (rule: ResolvedRule): string => `${rule.qualifiedId} (${rule.authority}): ${rule.instruction}`;

/** The projection of `resolvePolicy` one stage of a route delivers: that stage's prompts, then the rules the activity carries (03-P1 … 03-P3). */
export async function policyStage(input: {
  runtime: Runtime;
  project: ProjectConfig;
  activity: Activity;
  paths: readonly string[];
  stage: 'before-work' | 'before-checks' | 'before-report';
  show: boolean;
}): Promise<StagePayload> {
  const workspace = await openWorkspace(input.runtime);
  const policy = await resolvePolicyFor({ workspace, project: input.project, activity: input.activity, paths: input.paths });
  const lines: string[] = [];
  const stages = new Set(applicablePrepareStages(input.activity));
  for (const prompt of policy.prompts.filter((candidate) => candidate.stage === input.stage && stages.has(candidate.stage))) {
    try {
      const content = await input.runtime.fs.readText(prompt.absolutePath);
      if (Buffer.byteLength(content) > MAX_SNAPSHOT_FILE_BYTES || contentHash(content) !== prompt.contentHash) {
        lines.push(`${prompt.packReference}: prompt ${prompt.declaredPath} was not delivered (too large or changed on disk).`);
      } else lines.push(content.trim());
    } catch {
      lines.push(`${prompt.packReference}: prompt ${prompt.declaredPath} could not be read.`);
    }
  }
  const carried = stageRules(input.activity, input.stage, policy.rules.filter((rule) => ruleCarriedFor(input.activity, rule.category)));
  const omitted = policy.rules.filter((rule) => !ruleCarriedFor(input.activity, rule.category)).length;
  const show = `policy --activity ${input.activity} --stage ${input.stage} --show`;
  if (carried.length > 0) lines.push('Rules:', ...carried.map(render));
  if (omitted > 0) lines.push(`rulesOmitted: ${omitted} (read them: ${show})`);

  const limit = STAGE_LIMITS[input.stage];
  let kept = lines;
  let text = kept.join('\n');
  if (!input.show && Buffer.byteLength(text) > limit) {
    const rest = (count: number): string => `${count} more: \`${show}\``;
    while (kept.length > 1 && Buffer.byteLength(`${kept.join('\n')}\n${rest(lines.length - kept.length)}`) > limit) kept = kept.slice(0, -1);
    text = `${kept.join('\n')}\n${rest(lines.length - kept.length)}`;
  }
  const bytes = Buffer.byteLength(text);
  return { stage: input.stage, text, bytes, entry: { stage: input.stage, packs: policy.packs.map((pack) => pack.reference), rules: carried.length, omitted, bytes } };
}
