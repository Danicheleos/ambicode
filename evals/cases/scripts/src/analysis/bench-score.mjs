// Scoring and baseline identity; analysis caches exist only for one score or walkthrough.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BENCHMARKS, CASES_DIRECTORY, CASES_ROOT, CURATED_CASES, IMPACT_CASES_DIRECTORY, NAKED_PLUGIN, projectCasesDir, REUSE_CASES_DIRECTORY, REUSE_EXPORTS_FILE } from '../shared/bench-paths.mjs';
import { ledgerMetrics, ledgersOf, MCP_SPAWNS_UNMEASURED, tally } from './ledger-metrics.mjs';
import { PROMPT, WITH_PROMPT } from '../harness/prompt-transport.mjs';
import { scoreReuse } from './reuse-score.mjs';
import { infrastructureError } from '../harness/run-validity.mjs';
import { metricsOfTrace, readTrace } from './trace-analysis.mjs';

function fileSection(message) {
  const lines = message.split('\n');
  let start = -1;
  let level = 0;
  lines.forEach((line, i) => {
    const heading = /^(#{1,6})\s*\**\s*files\b/i.exec(line);
    if (heading) {
      start = i;
      level = heading[1].length;
    }
  });
  if (start < 0) return { text: message, sectioned: false };
  const end = lines.findIndex((line, i) => i > start && new RegExp(`^#{1,${level}}\\s`).test(line));
  return { text: lines.slice(start + 1, end < 0 ? undefined : end).join('\n'), sectioned: true };
}

/**
 * `./`, `repo/` and absolute prefixes are dropped. A path missing the code root (`controllers/x.ts` for
 * `src/controllers/x.ts`) or more leading directories matches when exactly one true path ends that way.
 */
export function namedFiles(message, truth, root) {
  const { text, sectioned } = fileSection(message);
  const named = new Set();
  for (const match of text.matchAll(/(?:^|[\s`'"(\[*|])(\/?(?:[\w@.+-]+\/)+[\w@.+-]+\.[A-Za-z0-9]+)/g)) {
    let p = match[1].replace(/^(?:.*\/)?repo\//, '').replace(/^\.\//, '');
    if (!truth.includes(p) && !p.startsWith(`${root}/`)) {
      const candidates = truth.filter((t) => t === `${root}/${p}`);
      const ending = truth.filter((t) => t.endsWith(`/${p}`));
      if (candidates.length === 1) p = candidates[0];
      else if (ending.length === 1) p = ending[0];
    }
    named.add(p);
  }
  return { named: [...named], sectioned };
}

export function scoreAnswer(message, truth, root) {
  const { named, sectioned } = namedFiles(message, truth, root);
  const correct = named.filter((p) => truth.includes(p)).length;
  const precision = named.length ? correct / named.length : 0;
  const recall = correct / truth.length;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { named: named.length, correct, truth: truth.length, precision, recall, f1, hit: correct > 0 ? 1 : 0, sectioned };
}

const EVIDENCE_GRADER = 'names-a-true-file';

const subdirectories = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
/** Every `<benchmarks>/<project>/cases/<name>/truth.json` (the full sets) a case of that name could have. */
const fullSetTruths = (benchmarks, name) => subdirectories(benchmarks).map((project) => path.join(benchmarks, project, CASES_DIRECTORY, name, 'truth.json'));
/** Every `cases/<project>/<impact|reuse>/<name>/truth.json` a case of that name could have. */
const projectTruths = (cases, name) =>
  subdirectories(cases).flatMap((project) => [IMPACT_CASES_DIRECTORY, REUSE_CASES_DIRECTORY].map((kind) => path.join(cases, project, kind, name, 'truth.json')));

export function createAnalysis({ benchmarks = BENCHMARKS, cases = CASES_ROOT, tracesDir = null } = {}) {
  const metadata = new Map();
  const traces = new Map();
  const exports = new Map();
  return {
    tracesDir,
    meta(evalCase) {
      if (!metadata.has(evalCase.name)) {
        const file = [...fullSetTruths(benchmarks, evalCase.name), ...projectTruths(cases, evalCase.name), path.join(CURATED_CASES, evalCase.name, 'truth.json')].find(existsSync);
        metadata.set(evalCase.name, file ? JSON.parse(readFileSync(file, 'utf8')) : null);
      }
      return metadata.get(evalCase.name);
    },
    trace(run) {
      if (!traces.has(run.tracePath)) traces.set(run.tracePath, readTrace(run, tracesDir));
      return traces.get(run.tracePath);
    },
    exports(side) {
      if (!exports.has(side)) exports.set(side, JSON.parse(readFileSync(path.join(projectCasesDir(REUSE_CASES_DIRECTORY, side, cases), REUSE_EXPORTS_FILE), 'utf8')));
      return exports.get(side);
    },
  };
}

/**
 * The no-plugin arm depends on the model, the Claude Code version and the prompt, not on the plugin, so
 * one run of it serves every later plugin-only run. Anything that could make it stale is refused.
 */
/**
 * `arm` picks the cached arm that stands in as `without`: `with` compares against another plugin's arm (the
 * LSP-only control). Unset, it is `with` for a baseline run on the naked plugin, `without` otherwise.
 * `promptMarkdown` is the naked prompt even for a run that served prompt.with.md (`recordServedPrompts`).
 */
export function withBaseline(results, baseline, { baselinePath, arm = baseline.suite?.plugins?.[0]?.name === NAKED_PLUGIN ? 'with' : 'without' }) {
  const refuse = (why) => {
    throw new Error(`baseline ${baselinePath} refused: ${why}`);
  };
  if (baseline.partial) refuse('it is a partial run');
  const model = results.suite?.modelOverride ?? null;
  if ((baseline.suite?.modelOverride ?? null) !== model) refuse(`its model is ${baseline.suite?.modelOverride ?? 'unpinned'}, this run's is ${model ?? 'unpinned'}`);
  if (baseline.claudeVersion !== results.claudeVersion) refuse(`it ran on Claude Code version ${baseline.claudeVersion}, this run on ${results.claudeVersion}`);
  const cases = (results.cases ?? []).map((evalCase) => {
    if (evalCase.arms?.without) refuse(`${evalCase.name} has its own without arm`);
    const cached = (baseline.cases ?? []).find((c) => c.name === evalCase.name);
    if (!cached) refuse(`it has no case ${evalCase.name}`);
    if (cached.promptMarkdown !== evalCase.promptMarkdown) refuse(`${evalCase.name}'s prompt differs from the one it ran`);
    if (!cached.arms?.[arm]?.length) refuse(`${evalCase.name} has no ${arm} arm in it`);
    return { ...evalCase, arms: { ...evalCase.arms, without: cached.arms[arm] } };
  });
  const plugin = baseline.suite?.plugins?.[0]?.name ?? null;
  return { ...results, cases, baseline: { file: baselinePath, arm, startedAt: baseline.startedAt ?? null, plugin, claudeVersion: baseline.claudeVersion ?? null } };
}

export function score(results, options = {}) {
  return scoreWithAnalysis(results, createAnalysis(options));
}

export function scoreWithAnalysis(results, analysis) {
  const runs = [];
  for (const evalCase of results.cases ?? []) {
    const meta = analysis.meta(evalCase);
    if (!meta) continue;
    const kind = `${meta.kind ?? 'localize'}${meta.variant ? `-${meta.variant}` : ''}`;
    for (const [arm, armRuns] of Object.entries(evalCase.arms ?? {}))
      armRuns.forEach((run, index) => {
        const graders = Object.fromEntries((run.graders ?? []).map((g) => [g.name, g.passed]));
        const parsed = analysis.trace(run);
        const trace = parsed ? metricsOfTrace(parsed) : null;
        const ledger = ledgerMetrics(ledgersOf(run, analysis.tracesDir), trace);
        const base = { case: evalCase.name, kind, side: meta.side, arm, run: index, error: run.error ?? null, costUsd: run.costUsd ?? null, turns: run.turns ?? null, graders, trace, ledger };
        if (infrastructureError(run)) {
          runs.push({ ...base, absent: true });
          return;
        }
        if (kind.startsWith('review')) {
          // Recall against the humans only: a concern no human raised may be
          // right or wrong, and nothing here can tell which.
          const raised = (run.graders ?? []).filter((g) => /^raises-\d+$/.test(g.name));
          // A run whose judges never ran (a breached cost ceiling skips paid
          // graders) is absent, not a run that raised nothing.
          if (raised.length !== meta.threads || run.skippedPaidGraders) runs.push({ ...base, absent: true });
          else runs.push({ ...base, absent: false, threads: meta.threads, raised: raised.filter((g) => g.passed).length, recall: raised.filter((g) => g.passed).length / meta.threads });
          return;
        }
        const evidence = (run.graders ?? []).find((g) => g.name === EVIDENCE_GRADER)?.evidence;
        if (typeof evidence !== 'string') runs.push({ ...base, absent: true });
        else if (meta.kind === 'reuse') runs.push({ ...base, absent: false, ...scoreReuse(evidence, meta.truth, analysis.exports(meta.side)) });
        else runs.push({ ...base, absent: false, ...scoreAnswer(evidence, meta.truth, meta.root) });
      });
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const summarize = (rows) => {
    const scored = rows.filter((r) => !r.absent);
    const out = { runs: rows.length, scored: scored.length, absent: rows.length - scored.length };
    for (const m of ['precision', 'recall', 'f1', 'hit', 'named', 'dupes', 'created', 'raised', 'threads', 'costUsd', 'turns']) {
      const values = scored.map((r) => r[m]).filter((x) => x !== null && x !== undefined);
      if (values.length) out[m] = mean(values);
    }
    // An answer without a `Files` heading is scored whole, so every path it mentions counts as named.
    const sectioned = scored.filter((r) => typeof r.sectioned === 'boolean');
    if (sectioned.length) out.sectioned = sectioned.filter((r) => r.sectioned).length;
    for (const g of ['plugin-fired', 'helper-ran'])
      if (rows.some((r) => g in r.graders)) out[g] = rows.filter((r) => r.graders[g]).length;
    // An untraced run is left out of these counts and shown in `traced`, not counted as a run that did nothing.
    const traced = rows.filter((r) => r.trace);
    out.traced = traced.length;
    if (traced.length) {
      out.models = [...new Set(traced.map((r) => r.trace.model))].sort();
      out['skill-fired'] = traced.filter((r) => r.trace.skills.some((s) => s.startsWith('ambicode:'))).length;
      out['prepare-ran'] = traced.filter((r) => r.trace.prepareRuns > 0).length;
      out['prepare-truncated'] = traced.filter((r) => r.trace.prepareTruncated > 0).length;
      out['replay-missed'] = traced.filter((r) => r.trace.replayMisses > 0).length;
      for (const [name, key] of [['review-runs', 'reviewRuns'], ['bash-reads', 'bashReads'], ['read-calls', 'readCalls'], ['grep-calls', 'grepCalls']])
        out[name] = mean(traced.map((r) => r.trace[key]));
      out['peak-context'] = mean(traced.map((r) => r.trace.peakContext).filter((x) => x !== null));
    }
    // Like `traced`: a run whose ledger was not harvested, or was harvested incomplete, is left out of the
    // measures and counted apart, not counted as a route that did nothing.
    const ledgered = rows.filter((r) => r.ledger);
    out.ledgered = ledgered.length;
    if (ledgered.length) {
      out['ledger-incomplete'] = ledgered.filter((r) => !r.ledger.complete).length;
      out['mcp-hook-spawns'] = MCP_SPAWNS_UNMEASURED;
    }
    const routed = ledgered.filter((r) => r.ledger.complete && r.ledger.routes > 0);
    if (routed.length) {
      out.routed = routed.length;
      // Each measure covers the routed runs that recorded it; none recorded gives null, never 0. `measured` is that count.
      const observed = (pick) => routed.map((r) => pick(r.ledger)).filter((x) => x !== null && x !== undefined);
      const average = (values) => (values.length ? mean(values) : null);
      const total = (values) => (values.length ? values.reduce((a, b) => a + b, 0) : null);
      const steps = observed((l) => l.routeSteps?.completed);
      const revised = observed((l) => l.revises && l.revises.gate + l.revises.code + l.revises.model);
      const preanswered = observed((l) => l.preanswers);
      const blocked = observed((l) => l.stopBlocked);
      const denied = observed((l) => l.permissionDenied);
      const checked = observed((l) => l.checkRedGreen && l.checkRedGreen.proven);
      const built = observed((l) => l.envelopeBuiltFrom);
      out['steps-completed'] = average(steps);
      out.revises = average(revised);
      out.preanswers = total(preanswered);
      out['stop-blocked'] = total(blocked);
      out['permission-denied'] = total(denied);
      out['check-red-green'] = checked.length ? checked.filter(Boolean).length : null;
      out['envelope-built-from'] = built.length ? tally(built) : null;
      out.measured = { 'steps-completed': steps.length, revises: revised.length, preanswers: preanswered.length, 'stop-blocked': blocked.length, 'permission-denied': denied.length, 'check-red-green': checked.length, 'envelope-built-from': built.length };
    }
    return out;
  };
  const groups = {};
  for (const r of runs) for (const key of [`${r.kind}/${r.arm}`, `${r.kind}/${r.arm}/${r.side}`]) (groups[key] ??= []).push(r);
  return { runs, arms: Object.fromEntries(Object.entries(groups).sort().map(([k, rows]) => [k, summarize(rows)])) };
}

export const servedPromptLine = (results) =>
  ({ with: `with (${WITH_PROMPT}; promptMarkdown records the naked ${PROMPT})`, naked: `naked (${PROMPT})` })[results.suite?.servedPrompt] ??
  'unrecorded (a run from before per-arm prompts served prompt.md)';

/** Printed with every comparison against a naked baseline: the user declined the paid check (2026-10-04). */
export const NAKED_EQUIVALENCE =
  'naked/without equivalence unverified: the reference is the naked plugin\'s arm, assumed equal to a no-plugin arm; the paid comparison was declined, so a claim against it carries that assumption';

/** Where a `withBaseline` result's without arm came from; empty when no cached baseline is attached. The gate and the walk print it. */
export function baselineProvenance(results) {
  const b = results.baseline;
  if (!b) return [];
  const days = (Date.parse(results.startedAt) - Date.parse(b.startedAt)) / 86_400_000;
  return [
    `without arm: the ${b.arm} arm of cached baseline ${b.file} (plugin ${b.plugin ?? 'unrecorded'}, Claude Code ${b.claudeVersion ?? 'unrecorded'}), ` +
      `started ${b.startedAt ?? 'at an unrecorded time'}, ${Number.isFinite(days) ? `${days.toFixed(1)} days` : 'an unknown time'} before this run`,
    ...(b.plugin === NAKED_PLUGIN ? [NAKED_EQUIVALENCE] : []),
  ];
}

