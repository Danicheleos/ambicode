// The bare reference, pinned once: score, gate, report and select read it through `lockedBaseline`, so a plugin
// iteration never pays for another bare run, and no report compares against whichever naked run happens to be newest.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BASELINE_LOCK_FILE, CORE_PRESET, NAKED_PLUGIN } from '../shared/bench-paths.mjs';
import { PRESET_SKILLS } from '../cases/preset-cases.mjs';
import { bareArmOf, bareMeansByCase, createAnalysis, withBaseline } from './bench-score.mjs';

const LOCK_VERSION = 2;
// toolCalls, peakContext and the two read counts come from the run's trace, so locking needs the traces beside the result.
const METRICS = ['recall', 'precision', 'costUsd', 'turns', 'toolCalls', 'peakContext', 'readCalls', 'bashReads'];
const RELOCK = '`evals:bench lock <naked eval.json>`';
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
// Preset cases are named `<ticket>-<skill>`; a name outside that shape has no skill to record.
const skillOf = (name) => (Object.hasOwn(PRESET_SKILLS, name.split('-').at(-1)) ? name.split('-').at(-1) : null);
const truthHash = (meta) => (Array.isArray(meta?.truth) ? sha256(JSON.stringify([...meta.truth].sort())) : null);

/**
 * Records `resultFile` as the bare reference for the cases it ran. A lock already on disk is kept: the new run's cases
 * replace the same-named ones, every other case keeps its earlier source, so each skill's baseline is locked on its own.
 * One lock is one model, Claude Code version and arm; another is refused, because withBaseline would refuse the mix later.
 */
export function writeBaselineLock(resultFile, { lockFile = BASELINE_LOCK_FILE, tracesDir = null, analysis = createAnalysis({ tracesDir }) } = {}) {
  const source = path.resolve(resultFile);
  const bytes = readFileSync(source);
  const results = JSON.parse(bytes.toString('utf8'));
  if (results.partial) throw new Error(`${source} is a partial run and cannot be the bare reference`);
  const prompts = new Map((results.cases ?? []).map((c) => [c.name, c.promptMarkdown ?? '']));
  const means = bareMeansByCase(results, METRICS, analysis);
  const model = results.suite?.modelOverride ?? null;
  const claudeVersion = results.claudeVersion ?? null;
  const arm = bareArmOf(results);
  const previous = readBaselineLock({ lockFile });
  if (previous !== null) {
    const differs = [['model', previous.model, model], ['Claude Code version', previous.claudeVersion, claudeVersion], ['arm', previous.arm, arm]].find(([, was, now]) => was !== now);
    if (differs) throw new Error(`${source} cannot join the lock: its ${differs[0]} is ${differs[2]}, the lock's is ${differs[1]}; lock it into another file or lock every skill again`);
  }
  const fresh = Object.fromEntries([...means].sort(([a], [b]) => a.localeCompare(b)).map(([name, row]) => [name, { skill: skillOf(name), prompt: sha256(prompts.get(name) ?? ''), truth: truthHash(analysis.meta({ name })), ...row }]));
  const kept = (previous?.sources ?? [])
    .map((entry) => ({ ...entry, cases: entry.cases.filter((name) => !(name in fresh)) }))
    .filter((entry) => entry.cases.length > 0);
  const cases = { ...Object.fromEntries(Object.entries(previous?.cases ?? {}).filter(([name]) => kept.some((entry) => entry.cases.includes(name)))), ...fresh };
  const lock = {
    version: LOCK_VERSION,
    model,
    claudeVersion,
    arm,
    sources: [...kept, { source, sha256: sha256(bytes), plugin: results.suite?.plugins?.[0]?.name ?? null, startedAt: results.startedAt ?? null, skills: [...new Set(Object.values(fresh).map((c) => c.skill).filter(Boolean))].sort(), cases: Object.keys(fresh) }],
    cases: Object.fromEntries(Object.entries(cases).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

export function readBaselineLock({ lockFile = BASELINE_LOCK_FILE } = {}) {
  if (!existsSync(lockFile)) return null;
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  // Version 1 locked one source for every case; it reads as that one source.
  if (lock.version === 1) {
    const { source, sha256: hash, plugin, startedAt, ...rest } = lock;
    return { ...rest, version: LOCK_VERSION, sources: [{ source, sha256: hash, plugin, startedAt, skills: [...new Set(Object.keys(lock.cases).map(skillOf).filter(Boolean))].sort(), cases: Object.keys(lock.cases) }] };
  }
  if (lock.version !== LOCK_VERSION) throw new Error(`${lockFile}: lock version ${lock.version}, this code reads ${LOCK_VERSION}; write it again with ${RELOCK}`);
  return lock;
}

/**
 * The locked baseline's result, after checking every source's bytes still hash to the lock; null when nothing is locked.
 * The sources' cases are joined into one result, each case taken from the source that locked it. A moved or changed source
 * is refused: a different file is a different reference, and choosing one is a decision, not a fallback.
 */
export function lockedBaseline({ lockFile = BASELINE_LOCK_FILE } = {}) {
  const lock = readBaselineLock({ lockFile });
  if (lock === null) return null;
  const loaded = lock.sources.map((entry) => {
    if (!existsSync(entry.source)) throw new Error(`locked baseline ${entry.source} is missing; restore it or lock another with ${RELOCK}`);
    const bytes = readFileSync(entry.source);
    const actual = sha256(bytes);
    if (actual !== entry.sha256) throw new Error(`locked baseline ${entry.source} changed (${actual}, locked ${entry.sha256}); lock it again only if the change is intended`);
    const results = JSON.parse(bytes.toString('utf8'));
    return { entry, results: { ...results, cases: (results.cases ?? []).filter((c) => entry.cases.includes(c.name)) } };
  });
  const results = { ...loaded[0].results, cases: loaded.flatMap((l) => l.results.cases) };
  return { file: lock.sources.map((entry) => entry.source).join(' + '), results, lock };
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
