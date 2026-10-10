import { openWorkspace } from '#modules/config/workspace';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import { MAX_SNAPSHOT_FILE_BYTES } from '#types/defaults';
import type { ProjectConfig } from '#types/modules/config';
import type { ResolvedRule, StagePayload } from '#types/modules/policy';
import type { Activity, PromptStage } from '#types/primitives';
import { applicablePrepareStages } from './packs/resolve.ts';
import type { Runtime } from '#types/composition';

export const STAGE_LIMITS: Record<PromptStage, number> = { 'before-work': 4096, 'before-report': 1536, 'before-checks': 1536, 'before-review': 2048 };

export const renderRule = (rule: ResolvedRule): string => `${rule.qualifiedId} (${rule.authority}): ${rule.instruction}`;

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
      if (Buffer.byteLength(content) > MAX_SNAPSHOT_FILE_BYTES) {
        lines.push(`${prompt.packReference}: prompt ${prompt.declaredPath} was not delivered (too large).`);
      } else lines.push(content.trim());
    } catch {
      lines.push(`${prompt.packReference}: prompt ${prompt.declaredPath} could not be read.`);
    }
  }
  const carried = input.stage === 'before-work' ? policy.rules : [];
  const show = `policy --activity ${input.activity} --stage ${input.stage} --show`;
  if (carried.length > 0) lines.push('Rules:', ...carried.map(renderRule));

  const limit = STAGE_LIMITS[input.stage];
  let kept = lines;
  let text = kept.join('\n');
  if (!input.show && Buffer.byteLength(text) > limit) {
    const rest = (count: number): string => `${count} more: \`${show}\``;
    while (kept.length > 1 && Buffer.byteLength(`${kept.join('\n')}\n${rest(lines.length - kept.length)}`) > limit) kept = kept.slice(0, -1);
    text = `${kept.join('\n')}\n${rest(lines.length - kept.length)}`;
  }
  const bytes = Buffer.byteLength(text);
  return { stage: input.stage, text, bytes, entry: { stage: input.stage, packs: policy.packs.map((pack) => pack.reference), rules: carried.length, bytes } };
}
