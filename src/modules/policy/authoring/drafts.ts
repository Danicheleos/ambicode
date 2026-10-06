import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { projectById } from '#modules/config/workspace';
import type { ProjectConfig } from '#types/modules/config';
import { PolicyPack, DRAFTS_DIR, type Diagnostic, type PackWithPrompts, type DraftsCheck } from '#types/modules/policy';
import { pathExclusionReason } from '#util/path-classes';
import { matchesGlob } from '#util/glob';
import { contentHash } from '#util/hash';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import { loadPacksForProject } from '../packs/load.ts';
import { readPackText, validatePack, validatePackSet } from '../packs/validate.ts';
import type { Runtime, Workspace } from '#types/composition';
import type { TaskDir } from '#types/modules/evidence';

/** Highest similarity between two built-in rules, measured over all pairs: 0.522 (angular-style and express-style configured-style). */
export const DUPLICATE_SIMILARITY = 0.55;
const MIN_QUOTE_CHARS = 20;

/** A pack-level problem that keeps a draft from being applied (09-T5); a rule-level quote failure does not. */
export const blockingProblem = (check: DraftsCheck, root: string, file: string): Diagnostic | undefined =>
  check.diagnostics.find((diagnostic) => diagnostic.where === path.join(root, file) && ((diagnostic.severity === 'error' && diagnostic.code !== 'pack-quote-missing') || diagnostic.code === 'pack-glob-matches-nothing'));

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** 1 − Levenshtein distance / longer length, over lowercased, whitespace-collapsed text. */
export function similarity(a: string, b: string): number {
  const [x, y] = [collapse(a).toLowerCase(), collapse(b).toLowerCase()];
  const longer = Math.max(x.length, y.length);
  if (longer === 0) return 1;
  let previous = Array.from({ length: y.length + 1 }, (_, index) => index);
  for (let row = 1; row <= x.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= y.length; column += 1) {
      current[column] = Math.min(previous[column]! + 1, current[column - 1]! + 1, previous[column - 1]! + (x[row - 1] === y[column - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[y.length]! / longer;
}

export async function builtinRules(runtime: Runtime): Promise<{ name: string; instruction: string }[]> {
  const directory = builtinPoliciesDirectory(runtime.pluginRoot);
  const rules: { name: string; instruction: string }[] = [];
  for (const entry of (await runtime.fs.readdir(directory).catch(() => [])).filter((item) => item.name.endsWith('.yaml')).sort((a, b) => a.name.localeCompare(b.name))) {
    const pack = PolicyPack.safeParse(parseYaml((await readPackText(runtime.fs, path.join(directory, entry.name))) ?? ''));
    if (pack.success) for (const rule of pack.data.rules) rules.push({ name: `${pack.data.id}/${rule.id}`, instruction: rule.instruction });
  }
  return rules;
}

async function capturedContents(runtime: Runtime, taskDir: TaskDir | null, url: string): Promise<string[]> {
  if (taskDir === null) return [];
  const found: string[] = [];
  for (const entry of await runtime.fs.readdir(taskDir.requirements).catch(() => [])) {
    if (!entry.name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(await runtime.fs.readText(path.join(taskDir.requirements, entry.name))) as { url?: unknown; content?: unknown };
      if (parsed.url === url && typeof parsed.content === 'string') found.push(parsed.content);
    } catch {
      // An unreadable capture proves nothing.
    }
  }
  return found;
}

/** The reason a quote is not verified, or null when it is (09-Q3). */
async function quoteProblem(runtime: Runtime, root: string, taskDir: TaskDir | null, source: { quote: string; location: string }): Promise<string | null> {
  const quote = collapse(source.quote);
  if (source.location.startsWith('https://')) {
    const captured = await capturedContents(runtime, taskDir, source.location);
    if (captured.length === 0) return 'source not captured';
    return captured.some((content) => collapse(content).includes(quote)) ? null : 'not in file';
  }
  const relative = source.location.replace(/#.*$/, '').replace(/:\d+(?:-\d+)?$/, '');
  const absolute = path.resolve(root, relative);
  if (path.relative(root, absolute).startsWith('..')) return 'file missing';
  const text = await runtime.fs.readText(absolute).catch(() => null);
  if (text === null) return 'file missing';
  return collapse(text).includes(quote) ? null : 'not in file';
}

async function matchedFiles(runtime: Runtime, projectRoot: string, glob: string): Promise<number> {
  let matched = 0;
  for (const entry of (await runtime.fs.glob(glob, projectRoot).catch(() => [])).slice(0, 20_000)) {
    if (pathExclusionReason(entry) !== null || !matchesGlob(entry, glob)) continue;
    if ((await runtime.fs.lstat(path.join(projectRoot, entry)).catch(() => null))?.isFile()) matched += 1;
  }
  return matched;
}

export async function checkDrafts(runtime: Runtime, workspace: Workspace, options: { project: string | null; taskDir: TaskDir | null }): Promise<DraftsCheck> {
  const root = workspace.repositoryRoot;
  const project: ProjectConfig | null = options.project !== null ? projectById(workspace.config, options.project) : workspace.config.projects.length === 1 ? workspace.config.projects[0]! : null;
  const constraints = project === null ? { commands: null, projectId: null } : { commands: project.commands, projectId: project.id };
  const builtins = await builtinRules(runtime);
  const diagnostics: Diagnostic[] = [];
  const result: DraftsCheck = { files: [], diagnostics, rulesBySource: {}, notMigrated: [], aggregateHash: '', ok: true, rules: [] };
  const draftPacks = new Map<string, PackWithPrompts>();

  const names = (await runtime.fs.readdir(path.join(root, DRAFTS_DIR)).catch(() => [])).filter((entry) => entry.isFile() && entry.name.endsWith('.yaml')).map((entry) => entry.name).sort();
  for (const name of names) {
    const relative = `${DRAFTS_DIR}/${name}`;
    const filePath = path.join(root, relative);
    const raw = (await readPackText(runtime.fs, filePath)) ?? '';
    const validated = await validatePack(runtime.fs, { raw, filePath, reference: relative, origin: 'project' }, constraints);
    diagnostics.push(...validated.diagnostics);
    result.files.push({ path: relative, contentHash: contentHash(raw), packId: validated.pack?.pack.id ?? null });
    if (validated.pack === null) continue;
    if (!draftPacks.has(validated.pack.pack.id)) draftPacks.set(validated.pack.pack.id, validated.pack);
    const pack = validated.pack.pack;
    const error = (code: string, message: string): number => diagnostics.push({ severity: 'error', code, message: `${relative}: ${message}`, where: filePath });

    for (const rule of pack.rules) {
      const qualified = `${pack.id}/${rule.id}`;
      result.rules.push(qualified);
      if (rule.source === undefined) {
        error('pack-invalid', `rule "${rule.id}" has no source {quote, location}.`);
        continue;
      }
      result.rulesBySource[rule.source.location] = (result.rulesBySource[rule.source.location] ?? 0) + 1;
      if (collapse(rule.source.quote).length < MIN_QUOTE_CHARS) error('pack-invalid', `rule "${rule.id}": source.quote is shorter than ${MIN_QUOTE_CHARS} characters.`);
      const problem = await quoteProblem(runtime, root, options.taskDir, rule.source);
      if (problem !== null) {
        error('pack-quote-missing', `rule "${rule.id}": the quote is not verified (${problem}). Fix the quote or drop the rule.`);
        result.notMigrated.push({ rule: qualified, reason: `pack-quote-missing: ${problem}` });
      }
      const twin = builtins.map((builtin) => ({ builtin, score: similarity(rule.instruction, builtin.instruction) })).filter((hit) => hit.score >= DUPLICATE_SIMILARITY).sort((a, b) => b.score - a.score)[0];
      if (twin !== undefined) {
        diagnostics.push({ severity: 'warning', code: 'pack-duplicates-builtin', message: `${relative}: rule "${rule.id}" repeats built-in ${twin.builtin.name} (similarity ${twin.score.toFixed(2)}).`, where: filePath });
      }
    }
    if (project !== null) {
      for (const glob of pack.appliesTo) {
        if ((await matchedFiles(runtime, path.join(root, project.root), glob)) > 0) continue;
        diagnostics.push({ severity: 'warning', code: 'pack-glob-matches-nothing', message: `${relative}: appliesTo glob "${glob}" matches no file under project "${project.id}" today.`, where: filePath });
      }
    }
  }
  const byPackId = new Map<string, string[]>();
  for (const file of result.files) {
    if (file.packId === null) continue;
    byPackId.set(file.packId, [...(byPackId.get(file.packId) ?? []), file.path]);
  }
  for (const [packId, files] of byPackId) {
    if (files.length < 2) continue;
    diagnostics.push({ severity: 'error', code: 'pack-duplicate-id', message: `pack id "${packId}" is used by more than one draft: ${files.join(', ')}.`, where: path.join(root, files[0]!) });
  }
  if (project !== null) {
    const enabled = await loadPacksForProject({ fs: runtime.fs, project, builtinDirectory: builtinPoliciesDirectory(runtime.pluginRoot), repositoryRoot: root });
    const prospective = validatePackSet([...enabled.packs, ...draftPacks.values()]);
    diagnostics.push(...prospective.diagnostics.filter((diagnostic) => diagnostic.code === 'pack-duplicate-id'));
  }
  if (names.length === 0) diagnostics.push({ severity: 'error', code: 'drafts-empty', message: `No *.yaml draft under ${DRAFTS_DIR}.`, where: path.join(root, DRAFTS_DIR) });
  result.aggregateHash = contentHash(result.files.map((file) => `${file.path} ${file.contentHash}`).join('\n'));
  result.ok = !diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return result;
}
