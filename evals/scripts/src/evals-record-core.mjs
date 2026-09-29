// Records the isolated reviewer's answer for every curated review case, as the operator,
// because `claude plugin eval`'s sandbox hides the login: the sweep then replays it through
// EVAL_AMBICODE_REVIEWER_REPLAY, so the with arm measures the pipeline's reviewer instead of
// the agent's hand review. Keyed on the snapshot id a fresh scaffold produces (deterministic:
// fixed commit dates, exact base files), the same one the sandbox's scaffold produces.
// Usage: node evals-record-core.mjs [case...] [-j N] [--exclude <glob>]... [--runs N] [--keep-runs <dir>]
// `--exclude` is passed to both `bundle` and `review`, for a change the snapshot refuses
// (`snapshot-too-large`); the id is patch-derived, so any spelling that removes the same
// files replays.
// `--runs N` records each case N times; the recordings file gets the highest run index that
// succeeded. `--keep-runs <dir>` writes every run, a stability summary and a usage sidecar;
// the runs hold the reviewer's output, so <dir> must sit under a `scratch` directory.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVIEWER_RECORDINGS } from './evals-bench.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CASES = path.join(ROOT, 'evals', 'evals-core', 'cases');
const AMBICODE = path.join(ROOT, 'scripts', 'ambicode.mjs');
// Gitignored (NDA content), outside the curated suite's denyRead, and never named in any
// agent command, so the no-peek graders cannot trip on it. `evals-bench.mjs run` points
// EVAL_AMBICODE_REVIEWER_REPLAY here when the file exists.
export const RECORDINGS = path.join(ROOT, 'benchmarks', REVIEWER_RECORDINGS);

const BUNDLE_ONLY_OMISSION = 'No model review was run: this command produces the evidence bundle only.';
// The FE config allows a 900 s reviewer; the review's checks are all null here.
const AMBICODE_TIMEOUT_MS = 1000 * 1000;
const MEDIUM_PLUS = new Set(['medium', 'high']);

async function reviewCases(only) {
  const cases = [];
  for (const entry of await readdir(CASES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(CASES, entry.name);
    const truth = JSON.parse(await readFile(path.join(directory, 'truth.json'), 'utf8').catch(() => '{}'));
    if (truth.kind !== 'review') continue;
    if (only.length > 0 && !only.includes(entry.name)) continue;
    cases.push({ name: entry.name, directory });
  }
  const unknown = only.filter((name) => !cases.some((c) => c.name === name));
  if (unknown.length > 0) throw new Error(`not a curated review case: ${unknown.join(', ')}`);
  return cases;
}

function firstLines(text, count = 3) {
  return text.trim().split('\n').slice(0, count).join(' ').slice(0, 500);
}

async function withScaffold(evalCase, use) {
  const directory = await mkdtemp(path.join(tmpdir(), `ambicode-record-${evalCase.name}-`));
  try {
    const scaffold = spawnSync('sh', [path.join(evalCase.directory, 'scaffold.sh')], { cwd: directory, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (scaffold.status !== 0) throw new Error(`scaffold failed: ${firstLines(scaffold.stderr || scaffold.stdout || `exit ${scaffold.status}`)}`);
    return await use(directory);
  } finally {
    // git's background maintenance can still be writing under .git while the tree is
    // removed (seen: ENOTEMPTY on .git/objects); a leftover temp dir is not a failed record.
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }).catch((error) => {
      process.stderr.write(`${evalCase.name}: could not remove ${directory}: ${error.message}\n`);
    });
  }
}

function ambicodeJson(directory, command, excludes = []) {
  const child = spawnSync(process.execPath, [AMBICODE, command, '--json', ...excludes.flatMap((glob) => ['--exclude', glob])], {
    cwd: path.join(directory, 'repo'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: AMBICODE_TIMEOUT_MS,
  });
  let output = null;
  try {
    output = JSON.parse(child.stdout);
  } catch {
    // Reported below with the process's own diagnostic.
  }
  if (output?.command !== command) {
    throw new Error(`${command} failed: ${child.error?.message ?? (firstLines(child.stderr ?? '') || `exit ${child.status}`)}`);
  }
  return output;
}

/** `ReviewerOutput` fields only; a validated finding adds `id` and `evidence`. */
function reviewerFinding({ id, evidence, ...finding }) {
  return finding;
}

async function recordCase(evalCase, excludes) {
  const started = Date.now();
  // Two scaffolds: a `bundle` leaves `.ambicode/reviews/` behind as untracked files, which a
  // later `review` in the same tree would snapshot as additions under a different id.
  const bundle = (await withScaffold(evalCase, (d) => ambicodeJson(d, 'bundle', excludes))).result;
  const review = (await withScaffold(evalCase, (d) => ambicodeJson(d, 'review', excludes))).result;
  if (review.target.snapshotId !== bundle.target.snapshotId) {
    throw new Error(`snapshot ids differ between scaffolds: ${bundle.target.snapshotId} vs ${review.target.snapshotId}`);
  }
  if (review.reviewer.status !== 'ok') {
    throw new Error(`reviewer ${review.reviewer.status}: ${review.reviewer.detail ?? review.statusReason ?? 'no detail'}`);
  }
  if (!bundle.omissions.at(-1)?.startsWith(BUNDLE_ONLY_OMISSION)) throw new Error("the bundle's last omission is not its evidence-only notice");
  const before = bundle.omissions.slice(0, -1);
  return {
    recording: {
      snapshotId: review.target.snapshotId,
      case: evalCase.name,
      model: review.reviewer.model,
      recordedFrom: `evals-record-core ${review.createdAt} plugin ${review.pluginVersion}${excludes.length ? ` --exclude ${excludes.join(' ')}` : ''}`,
      output: { findings: review.findings.map(reviewerFinding), coverageNotes: review.omissions.slice(before.length) },
    },
    findings: review.findings.length,
    findingList: review.findings,
    usage: review.reviewer.usage ?? null,
    rejections: review.reviewer.rejections.length,
    costUsd: review.reviewer.usage?.costUsd ?? null,
    wallMs: Date.now() - started,
  };
}

async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

export function parseOptions(argv) {
  const value = (flag) => {
    const index = argv.indexOf(flag);
    if (index < 0) return undefined;
    if (argv[index + 1] === undefined) throw new Error(`${flag} needs a value`);
    return argv[index + 1];
  };
  const jIndex = argv.indexOf('-j');
  const concurrency = jIndex >= 0 ? Number(argv[jIndex + 1]) : 2;
  const excludes = argv.flatMap((arg, i) => (arg === '--exclude' && argv[i + 1] ? [argv[i + 1]] : []));
  const runsText = value('--runs') ?? '1';
  if (!/^[1-9]\d*$/.test(runsText)) throw new Error(`--runs needs a positive integer, got ${runsText}`);
  const flags = new Set(['-j', '--exclude', '--runs', '--keep-runs']);
  const consumed = new Set(argv.flatMap((arg, i) => (flags.has(arg) ? [i, i + 1] : [])));
  const only = argv.filter((_, i) => !consumed.has(i));
  return { concurrency, excludes, runs: Number(runsText), keepRuns: value('--keep-runs') ?? null, only };
}

// Exit 128 (a path outside the repository) reads as not ignored, so it is refused.
function gitIgnores(file) {
  return spawnSync('git', ['check-ignore', '-q', file], { cwd: ROOT }).status === 0;
}

/** The runs embed the reviewer's output on NDA code, so only a gitignored `scratch` tree may hold them. */
export function keepRunsDirectory(directory, isIgnored = gitIgnores) {
  const resolved = path.resolve(directory);
  if (!resolved.split(path.sep).includes('scratch')) throw new Error(`--keep-runs ${directory}: refused, no path segment is "scratch"`);
  if (!isIgnored(path.join(resolved, 'x'))) throw new Error(`--keep-runs ${directory}: refused, git does not ignore it`);
  return resolved;
}

/** The sidecars are rebuilt from one invocation, so a second call into the same directory would drop the first call's cases. */
export function assertFreshKeepDirectory(directory) {
  for (const sidecar of ['summary.json', 'usage.json']) {
    if (existsSync(path.join(directory, sidecar))) throw new Error(`--keep-runs ${directory}: ${sidecar} already exists; use a new directory`);
  }
}

const findingKey = (finding) => finding.location.newPath ?? finding.location.oldPath;

function mediumPlus(findings) {
  return findings.filter((finding) => MEDIUM_PLUS.has(finding.risk));
}

/** Share of medium-and-above file paths that recur in at least two runs; null when there is none. */
export function stability(runFindings) {
  const seen = new Map();
  for (const findings of runFindings) {
    for (const key of new Set(mediumPlus(findings).map(findingKey))) seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  if (seen.size === 0) return null;
  return [...seen.values()].filter((runs) => runs >= 2).length / seen.size;
}

const succeeded = (runs) => runs.filter((run) => run.ok).sort((a, b) => a.run - b.run);

/** The highest successful run index, so the recordings file does not depend on completion order. */
export function chooseRecording(runs) {
  return succeeded(runs).at(-1)?.recording ?? null;
}

/** `cases` is `[{case, runs: [{run, ok, findings, detail}]}]`; a case with no successful run is `refused`. */
export function buildSummary(cases) {
  const summary = { schemaVersion: 1, cases: [], refused: [] };
  for (const { case: name, runs } of cases) {
    const failedRuns = runs.filter((run) => !run.ok).map(({ run, detail }) => ({ run, detail }));
    const good = succeeded(runs);
    if (good.length === 0) {
      summary.refused.push({ case: name, failedRuns });
      continue;
    }
    summary.cases.push({
      case: name,
      k: good.length,
      runs: good.map((run) => run.run),
      counts: good.map((run) => run.findings.length),
      mediumPlusCounts: good.map((run) => mediumPlus(run.findings).length),
      stability: good.length >= 2 ? stability(good.map((run) => run.findings)) : null,
      failedRuns,
    });
  }
  return summary;
}

/** `cases` as for `buildSummary`; a field the envelope lacked stays null, and a failed run has no entry. */
export function buildUsage(cases) {
  return {
    schemaVersion: 1,
    cases: cases.map(({ case: name, runs }) => ({
      case: name,
      runs: succeeded(runs).map(({ run, usage }) => ({
        run,
        turns: usage?.turns ?? null,
        apiDurationMs: usage?.apiDurationMs ?? null,
        outputTokens: usage?.outputTokens ?? null,
        costUsd: usage?.costUsd ?? null,
      })),
    })),
  };
}

async function main(argv) {
  const { concurrency, excludes, runs, keepRuns, only } = parseOptions(argv);
  const keepDirectory = keepRuns === null ? null : keepRunsDirectory(keepRuns);
  if (keepDirectory !== null) assertFreshKeepDirectory(keepDirectory);
  const cases = await reviewCases(only);
  if (cases.length === 0) throw new Error(`no curated review case under ${CASES}; run evals:select first`);
  if (keepDirectory !== null) await mkdir(keepDirectory, { recursive: true });
  const existing = existsSync(RECORDINGS) ? JSON.parse(await readFile(RECORDINGS, 'utf8')) : { schemaVersion: 1, recordings: [] };
  const kept = new Map(existing.recordings.map((r) => [r.snapshotId, r]));
  const jobs = cases.flatMap((evalCase) => Array.from({ length: runs }, (_, index) => ({ evalCase, run: index + 1 })));
  const outcomes = await pool(jobs, concurrency, async ({ evalCase, run }) => {
    const label = runs > 1 ? `${evalCase.name} run ${run}/${runs}` : evalCase.name;
    try {
      const done = await recordCase(evalCase, excludes);
      if (keepDirectory !== null) {
        const { recording, findingList, usage, costUsd, wallMs } = done;
        await mkdir(path.join(keepDirectory, evalCase.name), { recursive: true });
        await writeFile(
          path.join(keepDirectory, evalCase.name, `run-${run}.json`),
          `${JSON.stringify({ case: evalCase.name, snapshotId: recording.snapshotId, run, recording, findings: findingList, usage, costUsd, wallMs }, null, 2)}\n`,
        );
      }
      process.stderr.write(`${label}: ok, ${done.findings} finding(s), ${done.rejections} rejection(s), $${done.costUsd?.toFixed(2) ?? '?'}, ${Math.round(done.wallMs / 1000)} s\n`);
      return { case: evalCase.name, run, ok: true, recording: done.recording, findings: done.findingList, usage: done.usage };
    } catch (error) {
      process.stderr.write(`${label}: REFUSED — ${error.message}\n`);
      return { case: evalCase.name, run, ok: false, detail: error.message };
    }
  });
  const perCase = cases.map((evalCase) => ({ case: evalCase.name, runs: outcomes.filter((o) => o.case === evalCase.name) }));
  for (const { runs: caseRuns } of perCase) {
    const recording = chooseRecording(caseRuns);
    if (recording !== null) kept.set(recording.snapshotId, recording);
  }
  const document = { schemaVersion: 1, recordings: [...kept.values()].sort((a, b) => a.case.localeCompare(b.case) || a.snapshotId.localeCompare(b.snapshotId)) };
  await writeFile(RECORDINGS, `${JSON.stringify(document, null, 2)}\n`);
  const refused = perCase.filter(({ runs: caseRuns }) => succeeded(caseRuns).length === 0);
  const failedRuns = outcomes.filter((o) => !o.ok).length;
  process.stderr.write(`wrote ${document.recordings.length} recording(s) to ${RECORDINGS}; refused ${refused.length}${runs > 1 ? `; failed run(s) ${failedRuns}` : ''}\n`);
  if (keepDirectory !== null) {
    await writeFile(path.join(keepDirectory, 'summary.json'), `${JSON.stringify(buildSummary(perCase), null, 2)}\n`);
    await writeFile(path.join(keepDirectory, 'usage.json'), `${JSON.stringify(buildUsage(perCase), null, 2)}\n`);
  }
  return failedRuns > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
