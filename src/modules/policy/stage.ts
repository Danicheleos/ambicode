import path from 'node:path';
import { openWorkspace } from '#modules/config/workspace';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import { MAX_SNAPSHOT_FILE_BYTES } from '#types/defaults';
import type { ProjectConfig } from '#types/modules/config';
import type { ResolvedRule, StagePayload } from '#types/modules/policy';
import type { Activity, PromptStage } from '#types/primitives';
import { applicablePrepareStages } from './packs/resolve.ts';
import type { Runtime } from '#types/composition';

export const STAGE_LIMITS: Record<Exclude<PromptStage, 'before-review'>, number> = { 'before-work': 4096, 'before-report': 1536, 'before-checks': 1536 };

const AUTHORITY_ORDER = ['team', 'observed', 'inherited'] as const;

export const renderRule = (rule: ResolvedRule): string => `${rule.qualifiedId}: ${rule.instruction}`;

/** One `Rules (<authority>):` header per authority present, in precedence order; a header is flagged so a cut never counts it as a rule. */
export function renderRuleGroups(rules: readonly ResolvedRule[]): { text: string; header: boolean; rule?: ResolvedRule }[] {
  return AUTHORITY_ORDER.flatMap((authority) => {
    const group = rules.filter((rule) => rule.authority === authority);
    return group.length === 0 ? [] : [{ text: `Rules (${authority}):`, header: true }, ...group.map((rule) => ({ text: renderRule(rule), header: false, rule }))];
  });
}

/** The projection of `resolvePolicy` one stage of a route delivers: that stage's prompts, then the rules the activity carries (03-P1 … 03-P3). */
export async function policyStage(input: {
  runtime: Runtime;
  project: ProjectConfig;
  activity: Activity;
  paths: readonly string[];
  stage: 'before-work' | 'before-checks' | 'before-report';
}): Promise<StagePayload> {
  const workspace = await openWorkspace(input.runtime);
  const policy = await resolvePolicyFor({ workspace, project: input.project, activity: input.activity, paths: input.paths });
  const lines: { text: string; header: boolean; rule?: ResolvedRule }[] = [];
  const push = (text: string): void => void lines.push({ text, header: false });
  const stages = new Set(applicablePrepareStages(input.activity));
  for (const prompt of policy.prompts.filter((candidate) => candidate.stage === input.stage && stages.has(candidate.stage))) {
    try {
      const content = await input.runtime.fs.readText(prompt.absolutePath);
      if (Buffer.byteLength(content) > MAX_SNAPSHOT_FILE_BYTES) {
        push(`${prompt.packReference}: prompt ${prompt.declaredPath} was not delivered (too large).`);
      } else push(content.trim());
    } catch {
      push(`${prompt.packReference}: prompt ${prompt.declaredPath} could not be read.`);
    }
  }
  const carried = input.stage === 'before-work' ? policy.rules : [];
  lines.push(...renderRuleGroups(carried));

  const limit = STAGE_LIMITS[input.stage];
  const join = (items: typeof lines): string => items.map((line) => line.text).join('\n');
  let kept = lines;
  let text = join(kept);
  // Review rules go to brief.md for the reviewer subagent, which must see every rule rather than a pointer.
  const capped = input.activity !== 'review';
  if (capped && Buffer.byteLength(text) > limit) {
    // A header with every rule below it cut would dangle, and counting it would overstate the omitted rules.
    const trim = (items: typeof lines): typeof lines => {
      let end = items.length;
      while (end > 0 && items[end - 1]!.header) end--;
      return items.slice(0, end);
    };
    // Bare ids by file: a model that can Read the pack file needs no command to fetch the rest.
    const rest = (items: typeof lines): string => {
      const omitted = lines.filter((line) => line.rule !== undefined && !items.includes(line));
      const byFile = new Map<string, string[]>();
      for (const { rule } of omitted) {
        const file = path.relative(workspace.repositoryRoot, rule!.packFile);
        const key = file.startsWith('..') ? rule!.packFile : file.split(path.sep).join('/');
        byFile.set(key, [...(byFile.get(key) ?? []), rule!.qualifiedId]);
      }
      return `${join(items)}\n${omitted.length} more, ${[...byFile].map(([file, ids]) => `in ${file}: ${ids.join(', ')}`).join('; ')}`;
    };
    kept = trim(kept);
    while (kept.length > 1 && Buffer.byteLength(rest(kept)) > limit) kept = trim(kept.slice(0, -1));
    text = rest(kept);
  }
  const bytes = Buffer.byteLength(text);
  return { stage: input.stage, text, bytes, entry: { stage: input.stage, packs: policy.packs.map((pack) => pack.reference), rules: carried.length, bytes } };
}
