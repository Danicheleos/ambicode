// Scores one task-eval run (naked or route arm, no third): the withheld test on the run's patch, the red-before-green
// ledger proof, weakened assertions, cost and turns. Code only; the hidden test is the success criterion.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ledgerMetrics } from './ledger-metrics.mjs';

export const ARMS = ['naked', 'route'];
const ASSERTION = /\b(assert\w*|expect|should|verify|toBe\w*|toEqual|toThrow\w*)\b/;

const normal = (line) => line.trim().replace(/\s+/g, ' ');
export const assertionLines = (text) => new Set(String(text ?? '').split('\n').map(normal).filter((l) => l && ASSERTION.test(l) && !/^(\/\/|\*|#)/.test(l)));

/** Assertion lines in both the base and merged test but absent from the run's version of it. */
export function weakenedAssertions({ base, merged, run }) {
  if (run === null || run === undefined) return [];
  const kept = assertionLines(run);
  const shared = [...assertionLines(base)].filter((line) => assertionLines(merged).has(line));
  return shared.filter((line) => !kept.has(line));
}

/** The text the run's patch gives a test file: its added lines (the scaffold withholds the file); null when untouched. */
export function runVersionOf(patch, file) {
  const section = patch.split(/^diff --git /m).find((chunk) => chunk.startsWith(`a/${file} b/${file}`));
  if (section === undefined) return null;
  return section.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
}

/** The review verdict of a run: 'incomplete' when the sandbox reviewer never ran or errored, never a hidden-test failure. */
export function verification(entries) {
  const reviews = entries.filter((e) => e?.kind === 'review');
  const failed = reviews.filter((e) => e.reviewerRan === false || e.status === 'error');
  if (!failed.length) return { incomplete: false, reviewerError: false, costUsd: 0, turns: 0 };
  const sum = (key) => failed.reduce((n, e) => n + (Number(e[key]) || 0), 0);
  return { incomplete: true, reviewerError: true, costUsd: sum('costUsd'), turns: sum('turns') };
}

/** Replays `patch` (null: none) on a fresh base scaffold, adds the withheld test files, runs the test command. */
export function scaffoldRunner({ spawn = spawnSync } = {}) {
  return ({ caseDir, patch }) => {
    const truth = JSON.parse(readFileSync(path.join(caseDir, 'truth.json'), 'utf8'));
    const work = mkdtempSync(path.join(tmpdir(), 'task-replay-'));
    try {
      const sh = spawn('sh', [path.join(caseDir, 'scaffold.sh')], { cwd: work, encoding: 'utf8' });
      if (sh.status !== 0) return { exit: null, error: 'scaffold failed' };
      const repo = path.join(work, 'repo');
      if (patch) {
        writeFileSync(path.join(work, 'run.patch'), patch);
        if (spawn('git', ['apply', '--whitespace=nowarn', path.join(work, 'run.patch')], { cwd: repo, encoding: 'utf8' }).status !== 0) return { exit: null, error: 'patch does not apply' };
      }
      cpSync(path.join(caseDir, 'hidden', 'files'), repo, { recursive: true });
      const [command, ...args] = truth.testCommand;
      return { exit: spawn(command, [...args, ...truth.testFiles], { cwd: repo, encoding: 'utf8' }).status };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  };
}

/** `run`: {arm, patch, entries (ledger lines), costUsd, turns}. `runner` is injectable. */
export function scoreTaskRun(caseDir, run, { runner = scaffoldRunner() } = {}) {
  if (!ARMS.includes(run.arm)) throw new Error(`task arms are ${ARMS.join(' and ')}, not ${run.arm}`);
  const truth = JSON.parse(readFileSync(path.join(caseDir, 'truth.json'), 'utf8'));
  const hidden = runner({ caseDir, patch: run.patch });
  const weakened = truth.testFiles.flatMap((file) => {
    const read = (dir) => (existsSync(path.join(caseDir, 'hidden', dir, file)) ? readFileSync(path.join(caseDir, 'hidden', dir, file), 'utf8') : null);
    return weakenedAssertions({ base: read('base'), merged: read('files'), run: runVersionOf(run.patch, file) });
  });
  const review = verification(run.entries);
  const proof = run.arm === 'route' ? ledgerMetrics([{ entries: run.entries }])?.checkRedGreen?.proven ?? false : null;
  return {
    arm: run.arm,
    hiddenPass: hidden.exit === 0,
    hiddenError: hidden.error ?? null,
    redBeforeGreen: proof,
    weakened,
    verificationIncomplete: review.incomplete,
    reviewerError: review.reviewerError,
    costUsd: (run.costUsd ?? 0) + review.costUsd,
    turns: (run.turns ?? 0) + review.turns,
  };
}
