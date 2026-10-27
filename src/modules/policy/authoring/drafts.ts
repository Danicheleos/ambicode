import path from 'node:path';
import { projectById } from '#modules/config/workspace';
import { DRAFTS_DIR, type Diagnostic, type LoadedPack, type DraftsCheck } from '#types/modules/policy';
import { pathExclusionReason } from '#util/path-classes';
import { matchesGlob } from '#util/glob';
import { contentHash } from '#util/hash';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import { packConstraints } from '../packs/builtin.ts';
import { loadPacksForProject } from '../packs/load.ts';
import { readPackText, validatePack, validatePackSet } from '../packs/validate.ts';
import type { Runtime, Workspace } from '#types/composition';

const MIN_QUOTE_CHARS = 20;

/** A problem that keeps a draft from being applied (09-T5). A red check now reaches the table, so an unverified quote must not go live. */
export const blockingProblem = (check: DraftsCheck, root: string, file: string): Diagnostic | undefined =>
  check.diagnostics.find((diagnostic) => diagnostic.where === path.join(root, file) && (diagnostic.severity === 'error' || diagnostic.code === 'pack-glob-matches-nothing'));

/** Files Claude Code loads into every session itself. Mirrors `autoLoaded` in skills/rules/scripts/sources.mjs. */
const autoLoaded = (location: string): boolean => /(^|\/)(CLAUDE|CLAUDE\.local)\.md$/.test(location) || location.startsWith('.claude/rules/');

// Measured on 7,000+ rule pairs (inseer-frontend: 55 drafts, 34 live rules; 47 shipped rules): every pair judged a different
// requirement scored at most 0.23; the two judged the same requirement in other words scored 0.29 and 0.50. 0.25 sits in that gap.
// Word overlap cannot decide intent, so a hit is a warning for the drafter and the user to read, never a block.
const SIMILAR_AT = 0.25;

const words = (text: string): Set<string> => new Set(text.toLowerCase().replace(/`/g, '').split(/[^a-z0-9]+/).filter((word) => word.length > 3));

const overlap = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared || 1);
};

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Wording that differs only in case, spacing or a final stop is the same instruction. */
const normalized = (text: string): string => collapse(text).toLowerCase().replace(/[.!?;:,\s]+$/, '');

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
  const packs: LoadedPack[] = [];
  const enabled = project === null ? [] : (await loadPacksForProject({ fs: runtime.fs, project, builtinDirectory: builtinPoliciesDirectory(runtime.pluginRoot), repositoryRoot: root })).packs;
  const constraints = await packConstraints(runtime.fs, builtinPoliciesDirectory(runtime.pluginRoot), project);
  const seen: { id: string; words: Set<string> }[] = [];
  const names = (await runtime.fs.readdir(path.join(root, DRAFTS_DIR)).catch(() => [])).filter((entry) => entry.isFile() && entry.name.endsWith('.yaml')).map((entry) => entry.name).sort();
  for (const name of names) {
    const relative = `${DRAFTS_DIR}/${name}`;
    const filePath = path.join(root, relative);
    const raw = (await readPackText(runtime.fs, filePath)) ?? '';
    const validated = await validatePack(runtime.fs, { raw, filePath, reference: relative, origin: 'project' }, constraints);
    diagnostics.push(...validated.diagnostics);
    result.files.push({ path: relative, contentHash: contentHash(raw), packId: validated.pack?.pack.id ?? null });
    if (validated.pack === null) continue;
    packs.push(validated.pack);
    const pack = validated.pack.pack;
    const error = (code: string, message: string): number => diagnostics.push({ severity: 'error', code, message: `${relative}: ${message}`, where: filePath });
    // A draft that replaces a built-in takes its place, so that pack's rules are no longer in force to overlap.
    const inForce = enabled.filter((candidate) => candidate.reference !== pack.replaces).flatMap((candidate) => candidate.pack.rules.map((rule) => ({ pack: candidate.pack.id, rule, instruction: normalized(rule.instruction), words: words(rule.instruction) })));
    for (const rule of pack.rules) {
      const covered = inForce.find((entry) => entry.rule.id === rule.id || entry.instruction === normalized(rule.instruction));
      if (covered !== undefined) error('pack-rule-duplicate', `rule "${rule.id}" repeats ${covered.pack}/${covered.rule.id}, which is already in force. Drop it, or use "replaces" to supersede the whole pack.`);
      const qualified = `${pack.id}/${rule.id}`;
      const mine = words(rule.instruction);
      const closest = [...inForce.map((entry) => ({ id: `${entry.pack}/${entry.rule.id}`, words: entry.words, where: 'in force' })), ...seen.map((entry) => ({ ...entry, where: 'another draft' }))]
        .map((entry) => ({ ...entry, score: overlap(mine, entry.words) })).filter((entry) => entry.score >= SIMILAR_AT).sort((a, b) => b.score - a.score)[0];
      if (covered === undefined && closest !== undefined) diagnostics.push({ severity: 'warning', code: 'pack-rule-similar', message: `${relative}: rule "${qualified}" reads like ${closest.id} (${closest.where}, word overlap ${closest.score.toFixed(2)}). If it states the same requirement, drop it or merge it into that rule.`, where: filePath });
      seen.push({ id: qualified, words: mine });
      result.rules.push(qualified);
      if (rule.source === undefined) { error('pack-invalid', `rule "${rule.id}" has no source {quote, location}.`); continue; }
      result.rulesBySource[rule.source.location] = (result.rulesBySource[rule.source.location] ?? 0) + 1;
      if (autoLoaded(rule.source.location.replace(/#.*$/, '').replace(/:\d+(?:-\d+)?$/, ''))) error('pack-source-autoloaded', `rule "${rule.id}" quotes ${rule.source.location}, which Claude Code already loads into every session. Drop the rule; a draft states what the model does not already read.`);
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
  diagnostics.push(...validatePackSet([...enabled, ...packs]).diagnostics.filter((diagnostic) => diagnostic.code === 'pack-duplicate-id'));
  if (names.length === 0) diagnostics.push({ severity: 'error', code: 'drafts-empty', message: `No *.yaml draft under ${DRAFTS_DIR}.`, where: path.join(root, DRAFTS_DIR) });
  result.aggregateHash = contentHash(result.files.map((file) => `${file.path} ${file.contentHash}`).join('\n'));
  result.ok = !diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return result;
}
