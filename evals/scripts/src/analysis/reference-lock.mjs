// The plugin's own frozen reference per case: the drift gate compares a run with its own best, so three equally weak
// runs pass it; these floors compare each case with saved plugin runs instead. Only sources are pinned, never numbers:
// the floors are rescored from the pinned results, so a scorer fix moves reference and run together.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CASES_ROOT, REFERENCE_LOCK_FILE } from '../shared/bench-paths.mjs';
import { createAnalysis, score } from './bench-score.mjs';

const VERSION = 1;
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const truthHash = (meta) => (Array.isArray(meta?.truth) ? sha256(JSON.stringify([...meta.truth].sort())) : null);
/** Traces beside the result and in the iteration above `results/`, as the gate looks for them. */
export const tracesOf = (file) => [path.join(path.dirname(path.resolve(file)), 'traces'), path.join(path.dirname(path.dirname(path.resolve(file))), 'traces')];

/** Pins `resultFile`'s plugin arm as the reference for its cases (or `only` of them); other pinned cases keep their source. */
export function writeReferenceLock(resultFile, { lockFile = REFERENCE_LOCK_FILE, only = null, cases = CASES_ROOT } = {}) {
  const analysis = createAnalysis({ cases });
  const source = path.resolve(resultFile);
  const bytes = readFileSync(source);
  const results = JSON.parse(bytes.toString('utf8'));
  if (results.partial) throw new Error(`${source} is a partial run and cannot be a reference`);
  const names = (results.cases ?? []).map((c) => c.name).filter((name) => only === null || only.includes(name));
  const missing = (only ?? []).filter((name) => !names.includes(name));
  if (missing.length) throw new Error(`${source} has no case ${missing.join(', ')}`);
  const previous = readReferenceLock({ lockFile });
  const prompts = new Map((results.cases ?? []).map((c) => [c.name, c.pluginPromptMarkdown ?? c.promptMarkdown ?? '']));
  const fresh = Object.fromEntries(names.map((name) => [name, { source, sha256: sha256(bytes), prompt: sha256(prompts.get(name)), truth: truthHash(analysis.meta({ name })), model: results.suite?.modelOverride ?? null }]));
  const lock = { version: VERSION, cases: Object.fromEntries(Object.entries({ ...(previous?.cases ?? {}), ...fresh }).sort(([a], [b]) => a.localeCompare(b))) };
  writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

export function readReferenceLock({ lockFile = REFERENCE_LOCK_FILE } = {}) {
  if (!existsSync(lockFile)) return null;
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  if (lock.version !== VERSION) throw new Error(`${lockFile}: reference version ${lock.version}, this code reads ${VERSION}`);
  return lock;
}

/**
 * Per pinned case, the reference's mean and worst run of recall and F1, rescored now. A changed or missing source, or a
 * truth changed since pinning, is refused: another file or another truth is another reference.
 */
export function referenceFloors({ lockFile = REFERENCE_LOCK_FILE, cases = CASES_ROOT } = {}) {
  const analysis = createAnalysis({ cases });
  const lock = readReferenceLock({ lockFile });
  if (lock === null) return null;
  const bySource = new Map();
  for (const [name, entry] of Object.entries(lock.cases)) (bySource.get(entry.source) ?? bySource.set(entry.source, []).get(entry.source)).push([name, entry]);
  const floors = new Map();
  for (const [source, entries] of bySource) {
    if (!existsSync(source)) throw new Error(`reference ${source} is missing; restore it or pin another`);
    const bytes = readFileSync(source);
    const results = JSON.parse(bytes.toString('utf8'));
    for (const [name, entry] of entries) {
      if (sha256(bytes) !== entry.sha256) throw new Error(`reference ${source} changed since ${name} was pinned`);
      const now = truthHash(analysis.meta({ name }));
      if (entry.truth !== null && now !== null && now !== entry.truth) throw new Error(`reference refused: ${name}'s truth changed since it was pinned`);
    }
    const wanted = new Set(entries.map(([name]) => name));
    const runs = score({ ...results, cases: (results.cases ?? []).filter((c) => wanted.has(c.name)) }, { cases, tracesDir: tracesOf(source) }).runs.filter((r) => r.arm === 'with' && !r.absent);
    for (const name of wanted) {
      const rows = runs.filter((r) => r.case === name);
      const stat = (metric) => {
        const xs = rows.map((r) => r[metric]).filter((x) => typeof x === 'number');
        return xs.length ? { mean: xs.reduce((a, b) => a + b, 0) / xs.length, worst: Math.min(...xs) } : null;
      };
      floors.set(name, { source, runs: rows.length, recall: stat('recall'), f1: stat('f1') });
    }
  }
  return floors;
}
