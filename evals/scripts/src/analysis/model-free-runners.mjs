// Runners that read what is already on disk or plan what a run would do: none of them starts a model.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CURATED_CASES, ROOT } from '../shared/bench-paths.mjs';
import { LEDGER_DIRECTORY, tally } from './ledger-metrics.mjs';

export const DEFAULT_RECORDINGS = path.join(ROOT, 'eval-replay', 'core.json');

function ledgerFiles(directory) {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...ledgerFiles(full));
    else if (entry.name === 'ledger.jsonl') out.push(full);
  }
  return out;
}

/** The map entries' tuning hashes, overrides and decisions across ledgers: what the search tuning did in a run. */
export function tuningSummary(ledgers) {
  const maps = ledgers.flatMap((ledger) => ledger.entries).filter((entry) => entry?.kind === 'map');
  const tuned = maps.filter((entry) => entry.tuning);
  const decided = maps.filter((entry) => entry.decisions);
  const sum = (key) => decided.reduce((n, entry) => n + (Number(entry.decisions[key]) || 0), 0);
  return {
    maps: maps.length,
    tuning: tuned.length ? Object.fromEntries([...new Set(tuned.map((e) => e.tuning.hash))].map((hash) => [hash, { maps: tuned.filter((e) => e.tuning.hash === hash).length, overrides: [...new Set(tuned.filter((e) => e.tuning.hash === hash).flatMap((e) => e.tuning.overrides ?? []))] }])) : null,
    decisions: decided.length
      ? { maps: decided.length, sequenceFiles: sum('sequenceFiles'), pass2Downweighted: sum('pass2Downweighted'), harvestFiles: sum('harvestFiles'), proseRetry: decided.filter((e) => e.decisions.proseRetry === true).length, feature: tally(decided.map((e) => e.decisions.feature)) }
      : null,
  };
}

/** `tuning-summary <traces-dir>`: the ledgers a run harvested under `<dir>/ledgers`, or a directory of ledgers. */
export function tuningSummaryOf(tracesDir) {
  const root = existsSync(path.join(tracesDir, LEDGER_DIRECTORY)) ? path.join(tracesDir, LEDGER_DIRECTORY) : tracesDir;
  if (!existsSync(root)) throw new Error(`no ledgers at ${root}`);
  return tuningSummary(ledgerFiles(root).map((file) => ({ file, entries: readLines(file) })));
}

function readLines(file) {
  const entries = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch { /* an unreadable line is not a map */ }
  }
  return entries;
}

/** What a replay of the recorded reviewer answers would feed: per case, the findings recorded, and the curated review cases with none. */
export function replaySummary(recordings, caseNames = []) {
  const list = Array.isArray(recordings?.recordings) ? recordings.recordings : [];
  const byCase = {};
  for (const recording of list) {
    const findings = Array.isArray(recording?.output?.findings) ? recording.output.findings.length : null;
    const slot = (byCase[recording?.case ?? 'unnamed'] ??= { recordings: 0, findings: 0, unreadable: 0 });
    slot.recordings += 1;
    if (findings === null) slot.unreadable += 1;
    else slot.findings += findings;
  }
  return { schemaVersion: recordings?.schemaVersion ?? null, recordings: list.length, cases: byCase, withoutRecording: caseNames.filter((name) => !(name in byCase)) };
}

/** The curated review cases' names, from the generated case directory. */
export function reviewCaseNames(casesDir = CURATED_CASES) {
  return existsSync(casesDir) ? readdirSync(casesDir, { withFileTypes: true }).filter((e) => e.isDirectory() && /review/.test(e.name)).map((e) => e.name).sort() : [];
}

/** The arguments of a dry run: a runner never starts a model, so the run flag is always `--dry-run`. */
export function dryRunArgs(base, rest) {
  const has = (flag) => rest.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
  return [...base, '--dry-run', ...(has('--model') ? [] : ['--model', 'claude-sonnet-5-5']), ...(has('--max-cost-usd') ? [] : ['--max-cost-usd', '1']), ...rest.filter((arg) => arg !== '--dry-run')];
}
