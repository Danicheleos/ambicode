import path from 'node:path';
import { projectById } from '#modules/config/workspace';
import { DRAFTS_DIR, type Diagnostic, type PackWithPrompts, type DraftsCheck } from '#types/modules/policy';
import { pathExclusionReason } from '#util/path-classes';
import { matchesGlob } from '#util/glob';
import { contentHash } from '#util/hash';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import { loadPacksForProject } from '../packs/load.ts';
import { readPackText, validatePack, validatePackSet } from '../packs/validate.ts';
import type { Runtime, Workspace } from '#types/composition';

const MIN_QUOTE_CHARS = 20;

/** A pack-level problem that keeps a draft from being applied (09-T5); a rule-level quote failure does not. */
export const blockingProblem = (check: DraftsCheck, root: string, file: string): Diagnostic | undefined =>
  check.diagnostics.find((diagnostic) => diagnostic.where === path.join(root, file) && ((diagnostic.severity === 'error' && diagnostic.code !== 'pack-quote-missing') || diagnostic.code === 'pack-glob-matches-nothing'));

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Why a file quote is not verified, or null when it is: the quote appears in the file, whitespace collapsed. */
async function quoteProblem(runtime: Runtime, root: string, source: { quote: string; location: string }): Promise<string | null> {
  const absolute = path.resolve(root, source.location.replace(/#.*$/, '').replace(/:\d+(?:-\d+)?$/, ''));
  const text = path.relative(root, absolute).startsWith('..') ? null : await runtime.fs.readText(absolute).catch(() => null);
  if (text === null) return 'file missing';
  return collapse(text).includes(collapse(source.quote)) ? null : 'not in file';
}

async function matchedFiles(runtime: Runtime, projectRoot: string, glob: string): Promise<number> {
  let matched = 0;
  for (const entry of (await runtime.fs.glob(glob, projectRoot).catch(() => [])).slice(0, 20_000)) {
    if (pathExclusionReason(entry) === null && matchesGlob(entry, glob) && (await runtime.fs.lstat(path.join(projectRoot, entry)).catch(() => null))?.isFile()) matched += 1;
  }
  return matched;
}

export async function checkDrafts(runtime: Runtime, workspace: Workspace, options: { project: string | null }): Promise<DraftsCheck> {
  const root = workspace.repositoryRoot;
  const project = options.project !== null ? projectById(workspace.config, options.project) : workspace.config.projects.length === 1 ? workspace.config.projects[0]! : null;
  const diagnostics: Diagnostic[] = [];
  const result: DraftsCheck = { files: [], diagnostics, rulesBySource: {}, notMigrated: [], aggregateHash: '', ok: true, rules: [] };
  const packs: PackWithPrompts[] = [];
  const names = (await runtime.fs.readdir(path.join(root, DRAFTS_DIR)).catch(() => [])).filter((entry) => entry.isFile() && entry.name.endsWith('.yaml')).map((entry) => entry.name).sort();
  for (const name of names) {
    const relative = `${DRAFTS_DIR}/${name}`;
    const filePath = path.join(root, relative);
    const raw = (await readPackText(runtime.fs, filePath)) ?? '';
    const validated = await validatePack(runtime.fs, { raw, filePath, reference: relative, origin: 'project' }, project === null ? { commands: null, projectId: null } : { commands: project.commands, projectId: project.id });
    diagnostics.push(...validated.diagnostics);
    result.files.push({ path: relative, contentHash: contentHash(raw), packId: validated.pack?.pack.id ?? null });
    if (validated.pack === null) continue;
    packs.push(validated.pack);
    const pack = validated.pack.pack;
    const error = (code: string, message: string): number => diagnostics.push({ severity: 'error', code, message: `${relative}: ${message}`, where: filePath });
    for (const rule of pack.rules) {
      const qualified = `${pack.id}/${rule.id}`;
      result.rules.push(qualified);
      if (rule.source === undefined) { error('pack-invalid', `rule "${rule.id}" has no source {quote, location}.`); continue; }
      result.rulesBySource[rule.source.location] = (result.rulesBySource[rule.source.location] ?? 0) + 1;
      if (collapse(rule.source.quote).length < MIN_QUOTE_CHARS) error('pack-invalid', `rule "${rule.id}": source.quote is shorter than ${MIN_QUOTE_CHARS} characters.`);
      // A page's text is not on disk: its quote is the model's word, and the table says so.
      if (rule.source.location.startsWith('https://')) { diagnostics.push({ severity: 'warning', code: 'pack-quote-unchecked', message: `${relative}: rule "${rule.id}" quotes a page; the quote was not checked.`, where: filePath }); continue; }
      const problem = await quoteProblem(runtime, root, rule.source);
      if (problem === null) continue;
      error('pack-quote-missing', `rule "${rule.id}": the quote is not verified (${problem}). Fix the quote or drop the rule.`);
      result.notMigrated.push({ rule: qualified, reason: `pack-quote-missing: ${problem}` });
    }
    for (const glob of project === null ? [] : pack.appliesTo) {
      if ((await matchedFiles(runtime, path.join(root, project!.root), glob)) === 0) diagnostics.push({ severity: 'warning', code: 'pack-glob-matches-nothing', message: `${relative}: appliesTo glob "${glob}" matches no file under project "${project!.id}" today.`, where: filePath });
    }
  }
  const enabled = project === null ? [] : (await loadPacksForProject({ fs: runtime.fs, project, builtinDirectory: builtinPoliciesDirectory(runtime.pluginRoot), repositoryRoot: root })).packs;
  diagnostics.push(...validatePackSet([...enabled, ...packs]).diagnostics.filter((diagnostic) => diagnostic.code === 'pack-duplicate-id'));
  if (names.length === 0) diagnostics.push({ severity: 'error', code: 'drafts-empty', message: `No *.yaml draft under ${DRAFTS_DIR}.`, where: path.join(root, DRAFTS_DIR) });
  result.aggregateHash = contentHash(result.files.map((file) => `${file.path} ${file.contentHash}`).join('\n'));
  result.ok = !diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return result;
}
