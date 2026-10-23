// Navigator cases: ordinary eval cases rendered from NDA assets (a bench repository, ticket text and truth paths) that are
// not in git. `node evals/scripts/navigator-cases.mjs` writes evals/cases/navigator/ (plugin arm) and evals/bare/navigator/
// (bare arm), both gitignored. Assets: NAV_BENCH (repository; the plugin arm copies its .ambicode/context), NAV_CASES
// (<id>/prompt.md with a <ticket> block + truth.json), NAV_CONTEXT (context directory the plugin arm copies; default: the bench's .ambicode/context).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { finalTextOf, foundPaths } from './metrics.mjs';

const EVALS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.dirname(EVALS);

// Base-commit date order of the fe-angular bench cases; it numbers the case directories.
export const NAVIGATOR_ORDER = ['438', '6141', '5948', '6292', '5967', '5164', '6404', '3571', '6406', '6086'];
export const NAVIGATOR_TAG = 'navigator';
export const isNavigatorCase = (name) => /^fe-vs-\d+-navigator$/.test(name);
export const navigatorCaseName = (id) => `fe-vs-${id}-navigator`;

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
export function navTruth(full) {
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
// Written into truth.json (`ancestorShare`) and into the folder graders; the viewer reads it from there.
export const ANCESTOR_SHARE = 0.3;

// The step graders carry this weight so the case score stays within 1e-4 of recall: score = (hits + w * steps passed) / (N + w * steps).
export const STEP_WEIGHT = 0.0001;
// Measured on past runs: navigator 5 to 11 turns and 11 to 29 s, bare 6 to 28 turns and 24 to 62 s. Both arms get the bare ceiling.
const LIMITS = { max_turns: 40, timeout_seconds: 300 };
const INSTRUCTION = 'Do not change anything. Return the repository files this change would need to change or read as a ```files block at the end of your answer, one repository-relative path per line.';
// Plugin arm: the session only relays the navigator, so the score is the navigator's. The harness has no main-agent option,
// and its tool lists bind subagents too (probed 2026-10-19: disallowing Read also denied it to the subagent), so read tools
// stay; Bash is not granted. Before this the session searched on its own after the navigator (git ls-files, grep) in 9 of 9 runs.
const RELAY = 'Answer only through the ambicode:navigator agent. Call it once, in the foreground, with the request text unchanged. Then end your answer with its paths copied unchanged into the ```files block, one path per line, without its descriptions. Do not read, search or list the repository yourself, and do not add, drop or edit paths.';

const y = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sq = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const regex = (name, pattern, { flags = '', weight = 1, arm = null, target = 'last_message' } = {}) => ({
  name,
  text: `---\ntype: regex\npattern: ${y(pattern)}\n${flags === '' ? '' : `flags: ${flags}\n`}match: contains\ntarget: ${target}\nweight: ${weight}${arm === null ? '' : `\narm: ${arm}`}\n---\n`,
});
const tool = (name, toolName, inputMatch) => ({
  name,
  text: `---\ntype: tool_used\ntool: ${toolName}\ninput_match: ${y(inputMatch)}\nmin: 1\nweight: ${STEP_WEIGHT}\narm: with-only\n---\n`,
});

/** Lines of the first ```files block only, so a path counts when the contract holds; a path named in prose does not. */
const gitFiles = (bench) => {
  try { return execFileSync('git', ['ls-files'], { cwd: bench, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean); } catch { return []; }
};

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
const accepted = (share) => share !== undefined && share.total > 0 && share.relevant / share.total >= ANCESTOR_SHARE;

/** A folder is covered by a line that is the folder or anything under it, or (ancestors with share >= ANCESTOR_SHARE only) an ancestor directory or a file directly in one: scoreFolders' relation. */
const inBlockFolder = (folder, ancestors) => {
  const parts = folder.replace(/\/$/, '').split('/');
  // A bare single-segment line is not a path to the scorer (foundPaths), so it needs its trailing `/`.
  const alternatives = [`${escapeRegex(parts.join('/'))}${parts.length === 1 ? '/\\S*' : '(?:/\\S*)?'}`];
  for (let depth = 1; depth < parts.length; depth += 1) {
    if (!accepted(ancestors[parts.slice(0, depth).join('/')])) continue;
    const ancestor = escapeRegex(parts.slice(0, depth).join('/'));
    alternatives.push(depth === 1 ? `${ancestor}/` : `${ancestor}/?`, `${ancestor}/[^/\\s]+\\.[A-Za-z0-9]+`);
  }
  // Anchored at the start of the text and unable to skip a ```files fence, so only the first block is read.
  return `(?<![\\s\\S])(?:(?!\`\`\`files)[\\s\\S])*\`\`\`files\\r?\\n(?:(?!\`\`\`)[\\s\\S])*?^(?:\\./)?(?:${alternatives.join('|')})[ \\t]*\\r?$`;
};

const ratio = (a, b) => (b === 0 ? null : Number((a / b).toFixed(3)));

/**
 * The folder rule from a case's truth.json (`relevant`, `allowed`, `ancestors`, `ancestorShare`) on the paths an answer names; the
 * recall graders implement the same rule as regexes. A path ending in `/` is that folder, any other path its directory. A truth
 * folder is covered by an answer folder equal to or under it, or above it when `ancestors` accepts it; an answer folder is
 * correct when related the same way to a folder of `relevant` or `allowed`. `found` null: no list, as in metrics.mjs.
 */
export function scoreNavigator(truth, found) {
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

export const navigatorMetrics = (truth, traceText) => scoreNavigator(truth, foundPaths(finalTextOf(traceText), 'files-block'));

/** truth.json of the rendered plugin-arm case with this name, or null. */
export function navigatorTruth(name, evalsDir = EVALS) {
  const root = path.join(evalsDir, 'cases', 'navigator');
  if (!isNavigatorCase(name) || !existsSync(root)) return null;
  for (const entry of readdirSync(root)) {
    const file = path.join(root, entry, 'truth.json');
    if (!existsSync(file)) continue;
    const truth = JSON.parse(readFileSync(file, 'utf8'));
    if (truth.name === name) return truth;
  }
  return null;
}

const slug = (folder) => path.basename(folder).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The unique folders of the nav truth: a `/` item is that folder, any other path its directory (a top-level file has none). */
export const truthFolders = (nav) => [...new Set(nav.map((item) => (item.endsWith('/') ? item.slice(0, -1) : path.posix.dirname(item))))].filter((folder) => folder !== '.');

/** One case's grader files: recall over the truth folders (one grader per folder) and the contract. The plugin arm adds the two steps. */
function graders(nav, plugin, ancestors) {
  const out = [
    regex('files-block', '```files\\r?\\n(?:[^`\\n]+\\r?\\n)+```', { weight: STEP_WEIGHT }),
    ...truthFolders(nav).map((folder, index) => regex(`recall-${String(index + 1).padStart(2, '0')}-${slug(folder)}`, inBlockFolder(folder, ancestors), { flags: 'm' })),
  ];
  if (plugin) out.push(tool('navigator-called', 'Agent', 'ambicode:navigator'));
  return out;
}

function scaffold({ bench, context }, plugin) {
  const link = plugin
    ? `# Plugin arm only: the tar copy above drops .ambicode/, and the navigator reads context/index.md from it, and config.yaml.
mkdir -p .ambicode
[ ! -f ${sq(path.join(bench, '.ambicode', 'config.yaml'))} ] || cp ${sq(path.join(bench, '.ambicode', 'config.yaml'))} .ambicode/config.yaml
[ ! -d ${sq(context)} ] || cp -R ${sq(context)} .ambicode/context
`
    : '';
  return `#!/bin/sh
# The session directory becomes a fresh git repository holding a copy of the bench, with no .ambicode/ of its own.
set -e
(cd ${sq(bench)} && tar cf - --exclude=./.git --exclude=./.ambicode .) | tar xf -
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.invalid commit -q -m bench
${link}`;
}

function caseFiles(full, id, nav, sources, plugin, ticket, order, ancestors) {
  const name = navigatorCaseName(id);
  const files = new Map();
  const root = `${plugin ? 'cases' : 'bare'}/navigator/${String(order + 1).padStart(2, '0')}-${name}`;
  files.set(`${root}/case.yaml`, `schema_version: "1.1"\nname: ${name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
  files.set(`${root}/scaffold.sh`, scaffold(sources, plugin));
  const tools = plugin ? ['Agent'] : ['Read', 'Grep', 'Glob'];
  files.set(`${root}/prompt.md`, [
    '---',
    `name: ${name}`,
    `description: ${y('Find the files of a real ticket in a real codebase.')}`,
    `tags: ["${NAVIGATOR_TAG}"]`,
    'runs: 1',
    `max_turns: ${LIMITS.max_turns}`,
    `timeout_seconds: ${LIMITS.timeout_seconds}`,
    `allowed_tools: [${tools.join(', ')}]`,
    ...(plugin ? [`append_system_prompt: ${y(RELAY)}`] : []),
    '---',
    '',
    `${ticket}\n\n${INSTRUCTION}`,
    '',
  ].join('\n'));
  for (const grader of graders(nav, plugin, ancestors)) files.set(`${root}/graders/${grader.name}.md`, grader.text);
  // Read by the plugin-master viewer to score precision and F1; the full truth minus the nav files is allowed, not wrong.
  if (plugin) files.set(`${root}/truth.json`, `${JSON.stringify({ name, source: 'files-block', level: 'folder', ancestorShare: ANCESTOR_SHARE, relevant: nav, allowed: full.filter((file) => !nav.includes(file)), ancestors }, null, 2)}\n`);
  return files;
}

const ticketOf = (promptMd) => /<ticket>\n([\s\S]*?)\n<\/ticket>/.exec(promptMd)?.[1] ?? null;

/** Every file of both navigator trees keyed by its path below evals/, in the order the cases must run. */
export function renderNavigator(sources) {
  const files = new Map();
  NAVIGATOR_ORDER.forEach((id, order) => {
    const dir = path.join(sources.casesDir, `fe-vs-${id}-investigate`);
    const ticket = ticketOf(readFileSync(path.join(dir, 'prompt.md'), 'utf8'));
    const full = JSON.parse(readFileSync(path.join(dir, 'truth.json'), 'utf8')).truth;
    const nav = navTruth(full);
    if (ticket === null || nav.length === 0) throw new Error(`fe-vs-${id}-investigate: no <ticket> block or no navigation truth`);
    const ancestors = ancestorShares(nav, sources.files ?? gitFiles(sources.bench));
    for (const plugin of [true, false]) for (const [file, text] of caseFiles(full, id, nav, sources, plugin, ticket, order, ancestors)) files.set(file, text);
  });
  return files;
}

/** The asset paths, or null when this machine has no bench and cases (the NDA assets are not in git). */
export function navigatorSources(env = process.env) {
  const bench = path.resolve(env.NAV_BENCH ?? path.join(REPO, '..', 'ambicode-evals-assets', 'bench', 'fe-angular'));
  const casesDir = path.resolve(env.NAV_CASES ?? path.join(REPO, 'archive', 'evals', 'common', 'core', 'cases'));
  const complete = existsSync(path.join(bench, '.git')) && NAVIGATOR_ORDER.every((id) => existsSync(path.join(casesDir, `fe-vs-${id}-investigate`, 'truth.json')));
  if (!complete) return null;
  return { bench, casesDir, context: path.resolve(env.NAV_CONTEXT ?? path.join(bench, '.ambicode', 'context')) };
}

/** Rewrites both navigator trees; without the assets it says so in one line and leaves whatever exists untouched. */
export function writeNavigator(evalsDir = EVALS, env = process.env) {
  const sources = navigatorSources(env);
  if (sources === null) {
    console.log('navigator cases skipped: NAV_BENCH or NAV_CASES not found (NDA assets are not on this machine); existing cases are kept');
    return 0;
  }
  for (const tree of ['cases', 'bare']) rmSync(path.join(evalsDir, tree, 'navigator'), { recursive: true, force: true });
  const files = renderNavigator(sources);
  for (const [relative, text] of files) {
    const file = path.join(evalsDir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text, relative.endsWith('.sh') ? { mode: 0o755 } : undefined);
  }
  console.log(`${NAVIGATOR_ORDER.length} navigator cases, ${files.size} files`);
  return NAVIGATOR_ORDER.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeNavigator();
}
