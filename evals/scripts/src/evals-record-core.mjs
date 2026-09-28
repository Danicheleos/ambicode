// Records the isolated reviewer's answer for every curated review case, as the operator,
// because `claude plugin eval`'s sandbox hides the login: the sweep then replays it through
// EVAL_AMBICODE_REVIEWER_REPLAY, so the with arm measures the pipeline's reviewer instead of
// the agent's hand review. Keyed on the snapshot id a fresh scaffold produces (deterministic:
// fixed commit dates, exact base files), the same one the sandbox's scaffold produces.
// Usage: node evals-record-core.mjs [case...] [-j N] [--exclude <glob>]...
// `--exclude` is passed to both `bundle` and `review`, for a change the snapshot refuses
// (`snapshot-too-large`); the id is patch-derived, so any spelling that removes the same
// files replays.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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

async function main(argv) {
  const jIndex = argv.indexOf('-j');
  const concurrency = jIndex >= 0 ? Number(argv[jIndex + 1]) : 2;
  const excludes = argv.flatMap((arg, i) => (arg === '--exclude' && argv[i + 1] ? [argv[i + 1]] : []));
  const consumed = new Set(argv.flatMap((arg, i) => (arg === '-j' || arg === '--exclude' ? [i, i + 1] : [])));
  const only = argv.filter((_, i) => !consumed.has(i));
  const cases = await reviewCases(only);
  if (cases.length === 0) throw new Error(`no curated review case under ${CASES}; run evals:select first`);
  const existing = existsSync(RECORDINGS) ? JSON.parse(await readFile(RECORDINGS, 'utf8')) : { schemaVersion: 1, recordings: [] };
  const kept = new Map(existing.recordings.map((r) => [r.snapshotId, r]));
  const outcomes = await pool(cases, concurrency, async (evalCase) => {
    try {
      const done = await recordCase(evalCase, excludes);
      kept.set(done.recording.snapshotId, done.recording);
      process.stderr.write(`${evalCase.name}: ok, ${done.findings} finding(s), ${done.rejections} rejection(s), $${done.costUsd?.toFixed(2) ?? '?'}, ${Math.round(done.wallMs / 1000)} s\n`);
      return { case: evalCase.name, ok: true, ...done, recording: undefined };
    } catch (error) {
      process.stderr.write(`${evalCase.name}: REFUSED — ${error.message}\n`);
      return { case: evalCase.name, ok: false, detail: error.message };
    }
  });
  const document = { schemaVersion: 1, recordings: [...kept.values()].sort((a, b) => a.case.localeCompare(b.case) || a.snapshotId.localeCompare(b.snapshotId)) };
  await writeFile(RECORDINGS, `${JSON.stringify(document, null, 2)}\n`);
  const refused = outcomes.filter((o) => !o.ok);
  process.stderr.write(`wrote ${document.recordings.length} recording(s) to ${RECORDINGS}; refused ${refused.length}\n`);
  return refused.length > 0 ? 1 : 0;
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
