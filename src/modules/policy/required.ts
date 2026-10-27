import { openWorkspace } from '#modules/config/workspace';
import { resolvePolicyFor } from '#modules/policy/resolve-for';
import type { ProjectConfig } from '#types/modules/config';
import type { Runtime } from '#types/composition';

const CHANGES_START = /^[\s>-]*(\*{1,2}Changes\b|Changes:)/i;
const CHANGES_END = /^[\s>-]*(\*{1,2}(Goal|Checks)\b|(Goal|Checks):)/i;
const ANCHORED_PATH = /(?<![\w./-])((?:[\w@.-]+\/)*[\w@.-]+\.[A-Za-z0-9]+):\d+/g;

/** The files a plan.md changes: the `path:line` anchors under its `*Changes*` bullets, which is where the draft step has the model put them. */
export function changesPaths(plan: string): string[] {
  const found = new Set<string>();
  let inChanges = false;
  for (const line of plan.split('\n')) {
    if (/^#{1,6}\s/.test(line) || CHANGES_END.test(line)) inChanges = false;
    if (CHANGES_START.test(line)) inChanges = true;
    if (inChanges) for (const match of line.matchAll(ANCHORED_PATH)) found.add(match[1]!);
  }
  return [...found];
}

/**
 * The delivered plan rules the plan's own Changes paths reach: the same resolve task and review use (pack `appliesTo` on the paths).
 * Delivery covers the packs the map's files match; this is the subset the plan must cite.
 */
export async function requiredPlanRules(input: { runtime: Runtime; project: ProjectConfig; paths: readonly string[]; delivered: readonly string[] }): Promise<string[]> {
  if (input.paths.length === 0 || input.delivered.length === 0) return [];
  const workspace = await openWorkspace(input.runtime);
  const policy = await resolvePolicyFor({ workspace, project: input.project, activity: 'plan', paths: input.paths });
  const delivered = new Set(input.delivered);
  return policy.rules.map((rule) => rule.qualifiedId).filter((id) => delivered.has(id));
}
