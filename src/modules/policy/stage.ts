import { openWorkspace } from '#modules/config/workspace';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import type { ProjectConfig } from '#types/modules/config';
import type { ResolvedRule, StagePayload } from '#types/modules/policy';
import type { Activity } from '#types/primitives';
import type { Runtime } from '#types/composition';

const AUTHORITY_ORDER = ['team', 'observed', 'inherited'] as const;

const renderRule = (rule: ResolvedRule): string => `${rule.qualifiedId}: ${rule.instruction}`;

/** One `Rules (<authority>):` header per authority present, in precedence order; a header is flagged so it never counts as a rule. */
function renderRuleGroups(rules: readonly ResolvedRule[]): { text: string; header: boolean; rule?: ResolvedRule }[] {
  return AUTHORITY_ORDER.flatMap((authority) => {
    const group = rules.filter((rule) => rule.authority === authority);
    return group.length === 0 ? [] : [{ text: `Rules (${authority}):`, header: true }, ...group.map((rule) => ({ text: renderRule(rule), header: false, rule }))];
  });
}

/** The projection of `resolvePolicy` one stage of a route delivers: the rules the activity carries (03-P1 … 03-P3). */
export async function policyStage(input: {
  runtime: Runtime;
  project: ProjectConfig;
  activity: Activity;
  paths: readonly string[];
  stage: 'before-work';
}): Promise<StagePayload> {
  const workspace = await openWorkspace(input.runtime);
  const policy = await resolvePolicyFor({ workspace, project: input.project, activity: input.activity, paths: input.paths });
  const carried = policy.rules;
  const lines = renderRuleGroups(carried);
  const text = lines.map((line) => line.text).join('\n');
  const bytes = Buffer.byteLength(text);
  return { stage: input.stage, text, bytes, entry: { stage: input.stage, packs: policy.packs.map((pack) => pack.reference), rules: carried.length, bytes, activity: input.activity, problems: policy.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').map((diagnostic) => `project "${input.project.id}" policy: ${diagnostic.code}: ${diagnostic.message}`), ids: lines.flatMap((line) => (line.rule === undefined ? [] : [line.rule.qualifiedId])) } };
}
