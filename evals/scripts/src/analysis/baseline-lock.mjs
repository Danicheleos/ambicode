// The bare reference, pinned once: score, gate, report and select read it through `lockedBaseline`, so a plugin
// iteration never pays for another bare run, and no report compares against whichever naked run happens to be newest.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BASELINE_LOCK_FILE, CORE_PRESET, NAKED_PLUGIN } from '../shared/bench-paths.mjs';
import { bareArmOf, bareMeansByCase, createAnalysis, withBaseline } from './bench-score.mjs';

const LOCK_VERSION = 1;
const METRICS = ['recall', 'precision', 'costUsd', 'turns'];
const RELOCK = '`evals:bench lock <naked eval.json>`';
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const truthHash = (meta) => (Array.isArray(meta?.truth) ? sha256(JSON.stringify([...meta.truth].sort())) : null);

/** Records `resultFile` as the bare reference: its bytes' hash, model, Claude Code version, and per case the prompt and truth hashes and bare means. */
export function writeBaselineLock(resultFile, { lockFile = BASELINE_LOCK_FILE, analysis = createAnalysis() } = {}) {
  const source = path.resolve(resultFile);
  const bytes = readFileSync(source);
  const results = JSON.parse(bytes.toString('utf8'));
  if (results.partial) throw new Error(`${source} is a partial run and cannot be the bare reference`);
  const prompts = new Map((results.cases ?? []).map((c) => [c.name, c.promptMarkdown ?? '']));
  const means = bareMeansByCase(results, METRICS, analysis);
  const lock = {
    version: LOCK_VERSION,
    source,
    sha256: sha256(bytes),
    model: results.suite?.modelOverride ?? null,
    claudeVersion: results.claudeVersion ?? null,
    plugin: results.suite?.plugins?.[0]?.name ?? null,
    arm: bareArmOf(results),
    startedAt: results.startedAt ?? null,
    cases: Object.fromEntries([...means].sort(([a], [b]) => a.localeCompare(b)).map(([name, row]) => [name, { prompt: sha256(prompts.get(name) ?? ''), truth: truthHash(analysis.meta({ name })), ...row }])),
  };
  writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

export function readBaselineLock({ lockFile = BASELINE_LOCK_FILE } = {}) {
  if (!existsSync(lockFile)) return null;
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  if (lock.version !== LOCK_VERSION) throw new Error(`${lockFile}: lock version ${lock.version}, this code reads ${LOCK_VERSION}; write it again with ${RELOCK}`);
  return lock;
}

/**
 * The locked baseline's result, after checking its bytes still hash to the lock; null when nothing is locked. A moved
 * or changed source is refused: a different file is a different reference, and choosing one is a decision, not a fallback.
 */
export function lockedBaseline({ lockFile = BASELINE_LOCK_FILE } = {}) {
  const lock = readBaselineLock({ lockFile });
  if (lock === null) return null;
  if (!existsSync(lock.source)) throw new Error(`locked baseline ${lock.source} is missing; restore it or lock another with ${RELOCK}`);
  const bytes = readFileSync(lock.source);
  const actual = sha256(bytes);
  if (actual !== lock.sha256) throw new Error(`locked baseline ${lock.source} changed (${actual}, locked ${lock.sha256}); lock it again only if the change is intended`);
  return { file: lock.source, results: JSON.parse(bytes.toString('utf8')), lock };
}

/** A run with no bare arm of its own: not the naked baseline itself, and no case carrying a `without` arm. */
export const needsBaseline = (results) =>
  results.suite?.plugins?.[0]?.name !== NAKED_PLUGIN && !(results.cases ?? []).some((c) => c.arms?.without);

/**
 * The one baseline resolver: an explicit `--baseline` file wins, else the lock. Null only when the run needs none or
 * nothing is locked; an incompatible baseline throws through `withBaseline`, never falls back to another run.
 */
export function resolveBaseline(results, { baselinePath, lockFile = BASELINE_LOCK_FILE, analysis = createAnalysis() } = {}) {
  if (baselinePath !== undefined && baselinePath !== null) return { file: path.resolve(baselinePath), results: JSON.parse(readFileSync(baselinePath, 'utf8')) };
  if (!needsBaseline(results)) return null;
  // The lock pins the core suite's bare means; a run of another preset is compared only against a `--baseline` it names.
  if ((results.cases ?? []).length && results.cases.every((c) => { const preset = analysis.meta(c)?.preset; return preset && preset !== CORE_PRESET; })) return null;
  const locked = lockedBaseline({ lockFile });
  if (locked !== null) refuseChangedTruth(locked.lock, results, analysis);
  return locked;
}

/** Bare means scored against other truth are not this case's bare means: a case whose truth changed since the lock is refused. */
function refuseChangedTruth(lock, results, analysis) {
  for (const { name } of results.cases ?? []) {
    const locked = lock.cases?.[name]?.truth;
    const now = truthHash(analysis.meta({ name }));
    // No truth here (null) scores nothing, so it has nothing to disagree with.
    if (locked !== undefined && locked !== null && now !== null && now !== locked) throw new Error(`locked baseline refused: ${name}'s truth changed since it was locked; run a bare baseline for it and lock again with ${RELOCK}`);
  }
}

/** `results` with the resolved baseline's bare arm attached as `without`; unchanged when none resolves. */
export function attachBaseline(results, baselinePath, { lockFile = BASELINE_LOCK_FILE, arm, analysis } = {}) {
  const baseline = resolveBaseline(results, { baselinePath, lockFile, ...(analysis ? { analysis } : {}) });
  return baseline ? withBaseline(results, baseline.results, { baselinePath: baseline.file, ...(arm ? { arm } : {}) }) : results;
}

/** `select`'s discrimination input from a lock: per-case bare recall and precision. Empty without a lock. */
export function bareRates(lock) {
  if (lock === null) return {};
  const pick = (metric) => new Map(Object.entries(lock.cases).filter(([, c]) => typeof c[metric] === 'number').map(([name, c]) => [name, c[metric]]));
  return { bare: pick('recall'), barePrecision: pick('precision') };
}
