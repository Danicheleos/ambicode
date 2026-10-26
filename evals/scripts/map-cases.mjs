// Map bench cases: the ticket truths of the bench cases, corrected against the bench checkout.
//   NAV_BENCH=<repo> node evals/scripts/map-cases.mjs [--bench <repo>] [--sources <dir>] [--out bench/map]
// The ticket truths come from each ticket's merge request, so they name files the bench HEAD cannot hold: files the MR created
// (absent before it), files removed since, and directories that held only markup, styles or assets. A search can never find those;
// they are dropped and listed in truth.json (`dropped`, `bench`) so the correction stays auditable. Sources: env MAP_SOURCES.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCESTOR_SHARE, CASE_ORDER, ancestorShares, folderTruth, ticketOf } from './folder-truth.mjs';
import { promptOf } from './map-bench.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_SOURCES = '/Users/KillBill/Documents/projects/mine/ai/eval-archive/navigator-case-sources';
const NON_CODE = new Set(['html', 'htm', 'scss', 'css', 'less', 'sass', 'json', 'md', 'png', 'jpg', 'jpeg', 'svg', 'gif', 'yaml', 'yml', 'csv', 'xml', 'txt']);
const DESCRIPTION = 'Scope of a real ticket in a real codebase (map bench).';

const isCode = (file) => !NON_CODE.has(path.posix.extname(file).slice(1).toLowerCase());

/**
 * Drops the targets a search over `benchFiles` cannot reach. `source` is the merge request's truth: `{ truth, missingFromSnapshot }`.
 * A directory item means the MR changed only companion files (markup, styles) of a component whose code sits in that folder at HEAD, so
 * it is judged by the tracked files under it, not by the MR's files: none -> `created` (the MR added one of its files) or `removed`;
 * all non-code -> `nonCode`; else kept. A file item: untracked -> `created` / `removed`; tracked with a non-code extension -> `nonCode`
 * (3571 names helpPages/<lang>/modules.md and a png, which no code search ranks).
 */
export function correctTruth({ relevant, allowed = [], source, benchFiles }) {
  const tracked = new Set(benchFiles);
  const created = new Set(source.missingFromSnapshot ?? []);
  const underDir = (dir, files) => files.filter((file) => file.startsWith(dir));
  const kept = [];
  const dropped = [];
  for (const item of relevant) {
    let reason = null;
    if (!item.endsWith('/')) {
      if (!tracked.has(item)) reason = created.has(item) ? 'created' : 'removed';
      else if (!isCode(item)) reason = 'nonCode';
    } else {
      const here = underDir(item, benchFiles);
      if (here.length === 0) reason = underDir(item, [...created]).length > 0 ? 'created' : 'removed';
      else if (!here.some(isCode)) reason = 'nonCode';
    }
    if (reason === null) kept.push(item);
    else dropped.push({ item, reason });
  }
  const exists = (item) => (item.endsWith('/') ? underDir(item, benchFiles).length > 0 : tracked.has(item));
  return { relevant: kept, allowed: allowed.filter(exists), dropped };
}

/** The map case's prompt.md: the ticket text of the source prompt, no instruction line. */
export function renderPrompt(id, sourcePrompt) {
  return `---\nname: fe-vs-${id}-map\ndescription: '${DESCRIPTION}'\ntags: ["map"]\n---\n\n${ticketOf(sourcePrompt) ?? promptOf(sourcePrompt)}\n`;
}

/** One map case's files: truth.json (corrected, with `dropped` and `bench`) and prompt.md. */
export function buildCase({ id, sourcePrompt, source, benchFiles, head, branch }) {
  const nav = folderTruth(source.truth);
  const { relevant, allowed, dropped } = correctTruth({ relevant: nav, allowed: source.truth.filter((file) => !nav.includes(file)), source, benchFiles });
  const truth = {
    name: `fe-vs-${id}-map`, source: 'files-block', level: 'folder', ancestorShare: ANCESTOR_SHARE,
    relevant, allowed, ancestors: ancestorShares(relevant, benchFiles), dropped, bench: { head, branch, files: benchFiles.length },
  };
  return { truth, prompt: renderPrompt(id, sourcePrompt), before: nav.length };
}

/** Rewrites `out` from the source cases in CASE_ORDER (their numbering); returns one row per case. A case without its source is an error, not a skip. */
export function generate({ sourcesDir, outDir, benchFiles, head, branch }) {
  const rows = [];
  rmSync(outDir, { recursive: true, force: true });
  CASE_ORDER.forEach((id, order) => {
    const dirSource = path.join(sourcesDir, `fe-vs-${id}-investigate`);
    const sourceFile = path.join(dirSource, 'truth.json');
    if (!existsSync(sourceFile)) throw new Error(`fe-vs-${id}: source truth missing: ${sourceFile}`);
    const built = buildCase({ id, benchFiles, head, branch, source: JSON.parse(readFileSync(sourceFile, 'utf8')), sourcePrompt: readFileSync(path.join(dirSource, 'prompt.md'), 'utf8') });
    const dir = path.join(outDir, `${String(order + 1).padStart(2, '0')}-fe-vs-${id}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'truth.json'), `${JSON.stringify(built.truth, null, 2)}\n`);
    writeFileSync(path.join(dir, 'prompt.md'), built.prompt);
    rows.push({ dir: path.basename(dir), before: built.before, after: built.truth.relevant.length, dropped: built.truth.dropped });
  });
  return rows;
}

function parseArgs(argv, env) {
  const out = { bench: env.NAV_BENCH ?? null, sources: env.MAP_SOURCES ?? DEFAULT_SOURCES, out: path.join(REPO, 'bench', 'map') };
  for (let at = 0; at < argv.length; at += 1) {
    const [flag, inline] = argv[at].split('=');
    const value = () => inline ?? argv[++at];
    if (flag === '--bench') out.bench = value();
    else if (flag === '--sources') out.sources = value();
    else if (flag === '--out') out.out = value();
    else throw new Error(`unknown argument ${argv[at]}`);
  }
  if (out.bench === null) throw new Error('--bench <repo> or env NAV_BENCH is required');
  return out;
}

function main() {
  const options = parseArgs(process.argv.slice(2), process.env);
  const git = (...args) => execFileSync('git', args, { cwd: options.bench, encoding: 'utf8', maxBuffer: 1 << 28 });
  const benchFiles = git('ls-files').split('\n').filter(Boolean);
  const head = git('rev-parse', 'HEAD').trim();
  const branch = git('branch', '--show-current').trim();
  const rows = generate({ sourcesDir: options.sources, outDir: options.out, benchFiles, head, branch });
  console.log(`bench head ${head}, branch ${branch || '(detached)'}, ${benchFiles.length} files`);
  for (const row of rows) {
    console.log(`${row.dir}: relevant ${row.before} -> ${row.after}, dropped ${row.dropped.length}`);
    for (const { item, reason } of row.dropped) console.log(`    ${reason.padEnd(7)} ${item}`);
  }
  const reasons = {};
  for (const row of rows) for (const { reason } of row.dropped) reasons[reason] = (reasons[reason] ?? 0) + 1;
  console.log(`total relevant ${rows.reduce((sum, row) => sum + row.before, 0)} -> ${rows.reduce((sum, row) => sum + row.after, 0)}; dropped ${JSON.stringify(reasons)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
