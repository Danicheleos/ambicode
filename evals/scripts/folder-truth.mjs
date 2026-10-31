// Truth helpers of the ten fe-angular bench tickets, shared by the map bench (map-cases.mjs, map-bench.mjs, map-funnel.mjs,
// map-k12-cases.mjs): the navigation truth, the folder rule and its scorer. No eval case is rendered from here.
import path from 'node:path';

// Base-commit date order of the fe-angular bench cases; it numbers the map cases.
export const CASE_ORDER = ['438', '6141', '5948', '6292', '5967', '5164', '6404', '3571', '6406', '6086'];
// Data, not code: translations and fixtures are found by reading siblings, not by navigating.
// Copied from archive/evals/nav/score.mjs, which is gitignored.
const DATA = [
  /(^|\/)(i18n|locales?|translations?|lang)\//i,
  /(^|\/)(mocks?|fixtures?)\//i,
  /\.fixtures?\.[^/]+$/i,
];
// Companion (non-logic) files of a component: styles, markup templates, tests, mocks, stories. Never truth files, and an
// answer naming one is scored by its folder like any other file.
const COMPANION = [
  /\.(s?css|less|sass|html?)$/i,
  /\.(spec|test|stories|mocks?)\.[^/]+$/i,
  /(^|\/)__mocks__\//,
];
export const isCompanion = (file) => COMPANION.some((re) => re.test(file));
const isData = (file) => DATA.some((re) => re.test(file));
const isNonNav = (file) => isCompanion(file) || isData(file);

/** Nav truth: logic files, plus the directory (trailing `/`) of companion files whose directory holds no logic truth file; a template-only change still points at where it lives (case 6141 shrank 56 to 5 without this). */
export function folderTruth(full) {
  const logic = full.filter((file) => !isNonNav(file));
  const logicDirs = new Set(logic.map((file) => `${path.posix.dirname(file)}/`));
  const items = new Set();
  for (const file of full) {
    if (!isNonNav(file)) items.add(file);
    else if (isCompanion(file) && !isData(file) && !logicDirs.has(`${path.posix.dirname(file)}/`)) items.add(`${path.posix.dirname(file)}/`);
  }
  return [...items];
}

// Share of the source folders under an ancestor folder that must be covered for an answer naming the ancestor to count. The user's choice, not measured: at 0.5 the broad plugin answers on 6141 (shares 6/19 to 9/36) all failed (2026-10-19).
// Written into the map cases' truth.json (`ancestorShare`).
export const ANCESTOR_SHARE = 0.3;

/**
 * For every proper ancestor of a truth folder: `total` source folders under it (itself included; directories directly holding a
 * logic file of the bench) and how many the nav truth `relevant` covers (the folder of a relevant file, or a relevant directory item or below it).
 */
export function ancestorShares(nav, benchFiles) {
  const dirItems = nav.filter((item) => item.endsWith('/')).map((item) => item.slice(0, -1));
  const fileDirs = new Set(nav.filter((item) => !item.endsWith('/')).map((item) => path.posix.dirname(item)));
  const covered = (folder) => fileDirs.has(folder) || dirItems.some((dir) => folder === dir || folder.startsWith(`${dir}/`));
  const sourceFolders = [...new Set(benchFiles.filter((file) => !isNonNav(file)).map((file) => path.posix.dirname(file)))];
  const out = {};
  for (const folder of truthFolders(nav)) {
    const parts = folder.split('/');
    for (let depth = 1; depth < parts.length; depth += 1) {
      const ancestor = parts.slice(0, depth).join('/');
      if (out[ancestor] !== undefined) continue;
      const under = sourceFolders.filter((dir) => dir === ancestor || dir.startsWith(`${ancestor}/`));
      out[ancestor] = { relevant: under.filter(covered).length, total: under.length };
    }
  }
  return out;
}
const ratio = (a, b) => (b === 0 ? null : Number((a / b).toFixed(3)));

/**
 * The folder rule from a case's truth.json (`relevant`, `allowed`, `ancestors`, `ancestorShare`) on the paths an answer names. A path ending in `/` is that folder, any other path its directory. A truth
 * folder is covered by an answer folder equal to or under it, or above it when `ancestors` accepts it; an answer folder is
 * correct when related the same way to a folder of `relevant` or `allowed`. `found` null: no list, as in metrics.mjs.
 */
export function scoreFolders(truth, found) {
  const folders = (items) => truthFolders(items);
  const targets = folders(truth.relevant);
  if (found === null) return { recall: 0, precision: null, f1: 0, missed: targets, extra: [], contract: false };
  const share = truth.ancestorShare ?? ANCESTOR_SHARE;
  const accept = (folder) => {
    const one = truth.ancestors?.[folder];
    return one !== undefined && one.total > 0 && one.relevant / one.total >= share;
  };
  const related = (a, f) => a === f || a.startsWith(`${f}/`) || (f.startsWith(`${a}/`) && accept(a));
  const answer = folders(found);
  const ok = folders([...truth.relevant, ...(truth.allowed ?? [])]);
  const missed = targets.filter((f) => !answer.some((a) => related(a, f)));
  const extra = answer.filter((a) => !ok.some((f) => related(a, f)));
  const recall = ratio(targets.length - missed.length, targets.length);
  const precision = ratio(answer.length - extra.length, answer.length);
  const f1 = recall === null || precision === null || recall + precision === 0 ? (recall === 0 || precision === 0 ? 0 : null) : Number(((2 * recall * precision) / (recall + precision)).toFixed(3));
  return { recall, precision, f1, missed, extra, contract: true };
}

/** The unique folders of the nav truth: a `/` item is that folder, any other path its directory (a top-level file has none). */
export const truthFolders = (nav) => [...new Set(nav.map((item) => (item.endsWith('/') ? item.slice(0, -1) : path.posix.dirname(item))))].filter((folder) => folder !== '.');

/** The <ticket> block of a source prompt.md, or null. */
export const ticketOf = (promptMd) => /<ticket>\n([\s\S]*?)\n<\/ticket>/.exec(promptMd)?.[1] ?? null;
