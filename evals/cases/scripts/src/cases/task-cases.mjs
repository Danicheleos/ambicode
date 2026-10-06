// Task cases: the ticket of a real defect fix, implemented from the base commit, graded by the merged fix's own test
// held out of the scaffold. The prompt is the ticket text only. Cases go to evals/cases/evals-task/cases (gitignored, NDA).
// Commands: --test-command "<argv>" [--setup "<argv>"] [--limit <n>] [--sides BE,FE] [--benchmarks <absolute dir>]
// [--unit "<argv with {files}>" --unit-adapter <id>]: the unit command written into the case's own config copy.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { BENCHMARKS, ROOT } from '../shared/bench-paths.mjs';
import { scaffoldRunner } from '../analysis/task-score.mjs';
import { baseOf, sideRelFrom, writeBaseScaffold } from './base-scaffold.mjs';
import { casePrompt, parseTicket, peekGraders } from './bench-cases.mjs';
import { TASK_EVAL_DIR } from '../harness/run-options.mjs';
import { TASK_COMMAND, writePluginPrompt } from '../harness/prompt-transport.mjs';

export const TASK_CASES = path.join(ROOT, TASK_EVAL_DIR, 'cases');
export const isTestFile = (file) => /\.(spec|test)\.[a-z]+$|(^|\/)(tests?|__tests__)\//.test(file);

/** `[{file, section, added, deleted}]` per file of a git patch. */
export function patchFiles(patch) {
  return patch.split(/^diff --git /m).slice(1).map((chunk) => ({
    file: /^a\/(\S+) b\//.exec(chunk)?.[1],
    section: `diff --git ${chunk}`,
    added: /^new file mode/m.test(chunk),
    deleted: /^deleted file mode/m.test(chunk),
  })).filter((f) => f.file);
}

/** The text of a file after its patch section, applied to `baseText` (null for a new file). */
export function applySection(baseText, { file, section }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'task-apply-'));
  try {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    if (baseText !== null) writeFileSync(path.join(dir, file), baseText);
    writeFileSync(path.join(dir, 'p.patch'), section);
    const run = spawnSync('git', ['apply', '--unsafe-paths', '--directory=.', 'p.patch'], { cwd: dir, encoding: 'utf8' });
    return run.status === 0 ? readFileSync(path.join(dir, file), 'utf8') : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const gitShow = (cache, base, file) => {
  const run = spawnSync('git', ['-C', cache, 'show', `${base}:${file}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return run.status === 0 ? run.stdout : null;
};

/** The held-out files of one change: merged and base test texts, and the patch without its test files; null when it names no test. */
export function splitChange(patch, readBase) {
  const files = patchFiles(patch);
  const tests = files.filter((f) => isTestFile(f.file) && !f.deleted);
  if (!tests.length) return null;
  const merged = {};
  const base = {};
  for (const t of tests) {
    const before = t.added ? null : readBase(t.file);
    const after = applySection(before, t);
    if (after === null) return null;
    merged[t.file] = after;
    if (before !== null) base[t.file] = before;
  }
  return { merged, base, impl: files.filter((f) => !isTestFile(f.file)).map((f) => f.section).join('') };
}

export const taskPrompt = (name, side, text) =>
  casePrompt({ name, side, kind: 'task', description: 'Implement a real defect ticket in a real codebase.' }, `${text}\n\n\`repo/\` is the repository. Change into it with \`cd repo\` before running anything, and run every command from there.\n`)
    .replace(/^allowed_tools: .*$/m, 'allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]')
    .replace('max_turns: 40', 'max_turns: 80')
    .replace('timeout_seconds: 900', 'timeout_seconds: 1800');

/** The side's config with every project's unit command and check set to `unit` ({argv, adapter}). */
export function caseConfig(sideConfig, unit) {
  const document = parseDocument(sideConfig);
  for (const project of document.get('projects')?.items ?? []) {
    project.setIn(['commands', 'unit'], document.createNode({ argv: unit.argv }));
    project.setIn(['checks', 'unit'], document.createNode({ command: 'unit', adapter: unit.adapter }));
  }
  return document.toString();
}

/** Selects tickets in stable id order; `check({caseDir, patch})` runs the hidden test on a fresh scaffold. Returns counts. */
export function generate({ benchmarks, out, limit = 10, testCommand, setup = null, sides = ['BE', 'FE'], unit = null, check }) {
  const counts = { candidates: 0, written: 0, noTest: 0, checkFailed: 0 };
  const tickets = [];
  for (const side of sides) {
    const reviews = path.join(benchmarks, side, 'reviews');
    if (existsSync(reviews)) for (const e of readdirSync(reviews, { withFileTypes: true })) if (e.isDirectory()) tickets.push({ side, id: e.name });
  }
  tickets.sort((a, b) => a.id.localeCompare(b.id) || a.side.localeCompare(b.side));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const { side, id } of tickets) {
    if (counts.written === limit) break;
    const asset = path.join(benchmarks, side, 'assets', `${id}.md`);
    const reviews = path.join(benchmarks, side, 'reviews', id);
    const version = readdirSync(reviews, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(path.join(reviews, e.name, 'change.patch'))).map((e) => e.name).sort()[0];
    if (!existsSync(asset) || !version) continue;
    const parsed = parseTicket(readFileSync(asset, 'utf8'));
    if (parsed.error || !/\b(bug|defect|fix|error|fail)/i.test(parsed.text)) continue;
    counts.candidates += 1;
    const dir = path.join(reviews, version);
    const { base, root } = baseOf(dir);
    const split = splitChange(readFileSync(path.join(dir, 'change.patch'), 'utf8'), (f) => gitShow(path.join(benchmarks, side, '.git-cache'), base, f));
    if (!split) { counts.noTest += 1; continue; }
    const caseDir = path.join(out, `${side.toLowerCase()}-task-${id.toLowerCase()}`);
    const name = path.basename(caseDir);
    mkdirSync(path.join(caseDir, 'graders'), { recursive: true });
    for (const [file, text] of Object.entries(split.merged)) put(path.join(caseDir, 'hidden', 'files', file), text);
    for (const [file, text] of Object.entries(split.base)) put(path.join(caseDir, 'hidden', 'base', file), text);
    writeFileSync(path.join(caseDir, 'hidden', 'impl.patch'), split.impl);
    writeFileSync(path.join(caseDir, 'truth.json'), JSON.stringify({ kind: 'task', side, ticket: id, root, testFiles: Object.keys(split.merged), testCommand }, null, 2));
    writeFileSync(path.join(caseDir, 'case.yaml'), `schema_version: "1.1"\nname: ${name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
    writeFileSync(path.join(caseDir, 'prompt.md'), taskPrompt(name, side, parsed.text));
    for (const [file, body] of Object.entries(peekGraders())) writeFileSync(path.join(caseDir, 'graders', file), body);
    if (unit) writeFileSync(path.join(caseDir, 'config.yaml'), caseConfig(readFileSync(path.join(benchmarks, side, '.ambicode', 'config.yaml'), 'utf8'), unit));
    // The whole tree: the hidden test needs the manifests, lock file and runner config outside the code root.
    writeBaseScaffold(caseDir, { sideRel: sideRelFrom(caseDir, benchmarks, side), base, root, withhold: Object.keys(split.merged), setup: setup && { argv: setup }, wholeTree: true, config: unit ? 'config.yaml' : null });
    writePluginPrompt(caseDir, TASK_COMMAND);
    if (check({ caseDir, patch: null }).exit === 0 || check({ caseDir, patch: split.impl }).exit !== 0) {
      rmSync(caseDir, { recursive: true, force: true });
      counts.checkFailed += 1;
      continue;
    }
    counts.written += 1;
  }
  return counts;
}

function put(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function main(argv) {
  const option = (flag, fallback) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : fallback);
  const testCommand = option('--test-command')?.split(/\s+/).filter(Boolean);
  if (!testCommand?.length) throw new Error('--test-command "<argv>" is required: the hidden test file path is appended to it');
  const benchmarks = option('--benchmarks', BENCHMARKS);
  if (!path.isAbsolute(benchmarks)) throw new Error(`--benchmarks must be an absolute directory, got ${benchmarks}`);
  const setup = option('--setup')?.split(/\s+/).filter(Boolean) ?? null;
  const unitArgv = option('--unit')?.split(/\s+/).filter(Boolean);
  if (unitArgv && !option('--unit-adapter')) throw new Error('--unit needs --unit-adapter <id>');
  const unit = unitArgv ? { argv: unitArgv, adapter: option('--unit-adapter') } : null;
  const sides = option('--sides', 'BE,FE').split(',');
  const counts = generate({ benchmarks, out: TASK_CASES, limit: Number(option('--limit', '10')), testCommand, setup, sides, unit, check: scaffoldRunner() });
  console.log(`task cases: ${counts.candidates} candidates, ${counts.written} written, ${counts.noTest} without a named test, ${counts.checkFailed} skipped (hidden test not fail-at-base and pass-at-merged)`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
