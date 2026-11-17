// $0 check of a real-cases file before any model run: the regex, file and diff graders against the real change and against an untouched parent.
//   <bench env vars> node evals/scripts/real-cases-check.mjs [--cases <file>] [--case <name>]
// Workspaces come from `git archive` (the bench is only read); the reference diff is `git diff parent commit`. LLM and trace graders are listed, not run.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeOne } from './diff-graders.mjs';
import { LOCAL_FILE, loadRealCases } from './real-cases.mjs';

const git = (bench, ...args) => execFileSync('git', ['-C', bench, ...args], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

/** Extracts `git archive <sha>` of the bench into a new temp directory, minus the case's `remove` paths; returns the directory and its file count. */
export function materialize(bench, sha, remove = []) {
  const dir = mkdtempSync(path.join(tmpdir(), 'real-check-'));
  execFileSync('sh', ['-c', 'git -C "$1" archive --format=tar "$2" | tar xf - -C "$3"', 'sh', bench, sha, dir]);
  for (const file of remove) rmSync(path.join(dir, file), { force: true });
  const files = execFileSync('find', [dir, '-type', 'f'], { encoding: 'utf8' }).split('\n').filter(Boolean).length;
  return { dir, files };
}

const fileText = (dir, file) => (existsSync(path.join(dir, file)) ? readFileSync(path.join(dir, file), 'utf8') : '');

/** Verdict of one non-model grader on a workspace and its diff: true or false; null for kinds that need a model or a trace. */
export function verdict(grader, dir, diff) {
  if (grader.kind === 'diff') return gradeOne(grader, diff).passed;
  if (grader.kind === 'file') return new RegExp(grader.pattern).test(fileText(dir, grader.file)) === ((grader.match ?? 'contains') === 'contains');
  return null;
}

/** One row per grader: reference verdict (after-workspace and the real diff) and empty verdict (parent workspace, empty diff). */
export function checkCase(real, bench) {
  const before = materialize(bench, real.parent, real.remove);
  const after = materialize(bench, real.commit, real.remove);
  try {
    const diff = git(bench, 'diff', real.parent, real.commit);
    const rows = real.graders.map((g) => ({ name: g.name, kind: g.kind, weight: g.weight ?? 1, guard: Boolean(g.guard), reference: verdict(g, after.dir, diff), empty: verdict(g, before.dir, '') }));
    return { rows, files: { before: before.files, after: after.files } };
  } finally {
    rmSync(before.dir, { recursive: true, force: true });
    rmSync(after.dir, { recursive: true, force: true });
  }
}

/** The rows that break the contract: a checked grader that fails on the reference, or a measuring (non-guard) one that passes on nothing. */
export const problemsOf = (rows) => rows.filter((r) => r.reference === false || (r.reference !== null && !r.guard && r.empty === true));

const show = (v) => (v === null ? 'n/a' : v ? 'PASS' : 'FAIL');

function main(argv, env) {
  let file = LOCAL_FILE;
  let only = null;
  for (let at = 0; at < argv.length; at += 1) {
    if (argv[at] === '--cases') file = path.resolve(argv[++at]);
    else if (argv[at] === '--case') only = argv[++at];
    else throw new Error(`unknown argument ${argv[at]}`);
  }
  const { repos, cases } = loadRealCases(file);
  let bad = 0;
  for (const real of cases.filter((c) => only === null || c.name === only)) {
    const bench = env[repos[real.repo]?.bench];
    if (!bench) throw new Error(`env ${repos[real.repo]?.bench} (the ${real.repo} checkout) is required`);
    const { rows, files } = checkCase(real, path.resolve(bench));
    console.log(`\n${real.name}  (workspace files: parent ${files.before}, change ${files.after})`);
    console.log('grader | kind | weight | guard | reference | empty');
    for (const r of rows) console.log(`${r.name} | ${r.kind} | ${r.weight} | ${r.guard ? 'guard' : '-'} | ${show(r.reference)} | ${show(r.empty)}`);
    const problems = problemsOf(rows);
    bad += problems.length;
    for (const r of problems) console.log(`PROBLEM: ${r.name}`);
  }
  return bad === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2), process.env); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
