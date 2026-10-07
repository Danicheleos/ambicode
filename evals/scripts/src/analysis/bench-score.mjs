// Scoring and baseline identity; analysis caches exist only for one score or walkthrough.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BENCHMARKS, CASES_ROOT, CURATED_CASES, FULL_CASES_DIRECTORY, IMPACT_CASES_DIRECTORY, NAKED_PLUGIN, PRESET_NAMES, presetCasesDir, projectCasesDir, REUSE_CASES_DIRECTORY, REUSE_EXPORTS_FILE } from '../shared/bench-paths.mjs';
import { LEDGER_DIRECTORY, ledgerMetrics, ledgersOf, MCP_SPAWNS_UNMEASURED, sandboxIdOf, tally } from './ledger-metrics.mjs';
import { hunkRecall, identifierRecall, patchPaths } from './patch-overlap.mjs';
import { scoredPlan } from './plan-score.mjs';
import { readJudgeFile } from './task-judge.mjs';
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
const BARE_NAME = '[\\w@.+-]+\\.[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*';
const BARE_BULLET = new RegExp(`^\\s*[-*]\\s+(?:\\*\\*)?(?:\`(${BARE_NAME})\`|(${BARE_NAME})(?=\\*\\*|\\s*$|\\s+[—–-]\\s|[:,(]|\\s+\\())`, 'gm');

export function namedFiles(message, truth, root, { bareBullets = false } = {}) {
  const { text, sectioned } = fileSection(message);
  const named = new Set();
  const paths = [...text.matchAll(/(?:^|[\s`'"(\[*|])(\/?(?:[\w@.+-]+\/)+[\w@.+-]+\.[A-Za-z0-9]+)/g)].map((m) => m[1]);
  // A preset's truth spans the whole tree, so `package.json` at the root is a true file; the path pattern needs a
  // slash, so a bullet naming a root file is read on its own. Only a backticked name, or one the bullet ends at or
  // sets off with a dash, colon or bracket: `- Node.js runtime` and `- e.g. the service` name no file.
  if (bareBullets && sectioned) paths.push(...[...text.matchAll(BARE_BULLET)].map((m) => m[1] ?? m[2]));
  for (const path of paths) {
    let p = path.replace(/^(?:.*\/)?repo\//, '').replace(/^\.\//, '');
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
  return { ...fileMatch(named, truth), sectioned };
}

/** Precision, recall, F1 and hit of `named` paths against `truth`. */
export function fileMatch(named, truth) {
  const correct = named.filter((p) => truth.includes(p)).length;
  const precision = named.length ? correct / named.length : 0;
  const recall = correct / truth.length;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { named: named.length, correct, truth: truth.length, precision, recall, f1, hit: correct > 0 ? 1 : 0 };
}

/**
 * A preset truth splits the touched files into existing, created and deleted; each part's recall is reported apart
 * (null when the change has none of that part), since naming a file to create is a different skill from finding one.
 */
export function splitRecall(named, meta) {
  const out = {};
  for (const [key, list] of [['existingRecall', meta.existing], ['createdRecall', meta.created], ['deletedRecall', meta.deleted]])
    if (Array.isArray(list)) out[key] = list.length ? list.filter((p) => named.includes(p)).length / list.length : null;
  return out;
}

/** A preset answer's file match, with root files read from bullets and the existing/created/deleted split. */
function presetAnswer(text, meta) {
  const { named, sectioned } = namedFiles(text, meta.truth, meta.root, { bareBullets: true });
  return { ...fileMatch(named, meta.truth), sectioned, ...splitRecall(named, meta) };
}

/** Per review label (`defect`, `opinion`, `unclassified`), the raised share of that label's threads; null when the case has none. */
export function labelRecall(raised, labels) {
  const out = {};
  for (const label of ['defect', 'opinion', 'unclassified']) {
    const indexes = labels.map((l, i) => (l === label ? i : -1)).filter((i) => i >= 0);
    out[`${label}Threads`] = indexes.length;
    out[`${label}Recall`] = indexes.length ? indexes.filter((i) => raised.has(i)).length / indexes.length : null;
  }
  return out;
}

const EVIDENCE_GRADER = 'names-a-true-file';
/**
 * The preset measures; each is averaged over the runs that have it, so a case with no created file does not pull
 * createdRecall to 0. `<measure>N` says how many that was: a judge stopped by its cap after 3 of 20 runs is a mean of 3.
 */
const SPLIT_METRICS = ['existingRecall', 'createdRecall', 'deletedRecall', 'hunkRecall', 'identifierRecall', 'defectRecall', 'opinionRecall', 'unclassifiedRecall', 'judgeScore', 'judgeCostUsd'];

const subdirectories = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
/** Every `evals/<project>/full/<name>/truth.json` (the full sets) a case of that name could have. */
const fullSetTruths = (cases, name) => subdirectories(cases).map((project) => path.join(projectCasesDir(FULL_CASES_DIRECTORY, project, cases), name, 'truth.json'));
/** Every preset `truth.json` a case of that name could have: `evals/common/presets/<preset>/<name>/`, the core one's under `common/core/cases/`. */
const presetTruths = (cases, name) => PRESET_NAMES.map((preset) => path.join(presetCasesDir(preset, cases), name, 'truth.json'));
/** Every `cases/<project>/<impact|reuse>/<name>/truth.json` a case of that name could have. */
const projectTruths = (cases, name) =>
  subdirectories(cases).flatMap((project) => [IMPACT_CASES_DIRECTORY, REUSE_CASES_DIRECTORY].map((kind) => path.join(cases, project, kind, name, 'truth.json')));

/** The first of the traces dirs (one, or several as `run-report` passes them) holding `parts`; null when none does. */
const harvested = (tracesDir, ...parts) => (tracesDir ? [].concat(tracesDir).map((dir) => path.join(dir, ...parts)).find((file) => existsSync(file)) ?? null : null);

/** `judgeFile`: a `judge-task` result, whose verdicts join the task runs by sandbox id. */
export function createAnalysis({ cases = CASES_ROOT, tracesDir = null, judgeFile = null } = {}) {
  const metadata = new Map();
  let verdicts = null;
  const traces = new Map();
  const exports = new Map();
  return {
    tracesDir,
    meta(evalCase) {
      if (!metadata.has(evalCase.name)) {
        const file = [...fullSetTruths(cases, evalCase.name), ...projectTruths(cases, evalCase.name), ...presetTruths(cases, evalCase.name), path.join(CURATED_CASES, evalCase.name, 'truth.json')].find(existsSync);
        // caseDir reaches files beside the truth (a task's oracle patch); it is not part of the truth's identity.
        metadata.set(evalCase.name, file ? Object.defineProperty(JSON.parse(readFileSync(file, 'utf8')), 'caseDir', { value: path.dirname(file) }) : null);
      }
      return metadata.get(evalCase.name);
    },
    trace(run) {
      if (!traces.has(run.tracePath)) traces.set(run.tracePath, readTrace(run, tracesDir));
      return traces.get(run.tracePath);
    },
    /** The task judge's verdict on the run; null when it was not judged. */
    verdict(run) {
      verdicts ??= readJudgeFile(judgeFile);
      const id = sandboxIdOf(run);
      return (id && verdicts.get(id)) ?? null;
    },
    /** The run's sandbox change as `harvestPatches` kept it; null when none was harvested. */
    patch(run) {
      const id = sandboxIdOf(run);
      const file = id ? harvested(tracesDir, 'patches', `${id}.patch`) : null;
      return file ? readFileSync(file, 'utf8') : null;
    },
    /** The run's promoted plan, else its latest draft, from the notes harvested beside its ledgers; null when none. */
    plan(run) {
      const id = sandboxIdOf(run);
      const top = id ? harvested(tracesDir, LEDGER_DIRECTORY, id) : null;
      if (!top) return null;
      const plans = [];
      const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true }))
          if (entry.isDirectory()) walk(path.join(dir, entry.name));
          else if (entry.name === 'ledger.jsonl') {
            const found = scoredPlan(dir);
            if (found) plans.push(found);
          }
      };
      walk(top);
      return plans.find((p) => p.kind === 'promoted') ?? plans[0] ?? null;
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
export function withBaseline(results, baseline, { baselinePath, arm = bareArmOf(baseline) }) {
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
          else {
            const passed = raised.filter((g) => g.passed);
            const byLabel = Array.isArray(meta.labels) ? labelRecall(new Set(passed.map((g) => Number(g.name.slice('raises-'.length)) - 1)), meta.labels) : {};
            runs.push({ ...base, absent: false, threads: meta.threads, raised: passed.length, recall: passed.length / meta.threads, ...byLabel });
          }
          return;
        }
        if (meta.kind === 'task') {
          // No harvested patch is a run that was not measured, never one that changed nothing (that is an empty patch).
          const patch = analysis.patch(run);
          if (patch === null) {
            runs.push({ ...base, absent: true });
            return;
          }
          const named = patchPaths(patch);
          const oracle = meta.oracle && meta.caseDir ? readFileSync(path.join(meta.caseDir, meta.oracle), 'utf8') : null;
          const overlap = oracle === null ? {} : { hunkRecall: hunkRecall(oracle, patch).recall, identifierRecall: identifierRecall(oracle, patch).recall };
          // The judge's cost stays out of costUsd: it is the grader's spend, not the agent's.
          const verdict = analysis.verdict(run);
          const judged = verdict ? { judgeScore: verdict.judgeScore, judgeCostUsd: verdict.judgeCostUsd } : {};
          runs.push({ ...base, absent: false, ...fileMatch(named, meta.truth), ...splitRecall(named, meta), ...overlap, ...judged });
          return;
        }
        const evidence = (run.graders ?? []).find((g) => g.name === EVIDENCE_GRADER)?.evidence;
        if (meta.kind === 'plan') {
          // The route arm's plan is its promoted note; the naked arm has no note, so its final message is the plan.
          const note = analysis.plan(run);
          const text = note?.text ?? evidence;
          if (typeof text !== 'string') runs.push({ ...base, absent: true });
          else runs.push({ ...base, absent: false, ...presetAnswer(text, meta), scoredText: note?.kind ?? 'message' });
          return;
        }
        if (typeof evidence !== 'string') runs.push({ ...base, absent: true });
        else if (meta.kind === 'reuse') runs.push({ ...base, absent: false, ...scoreReuse(evidence, meta.truth, analysis.exports(meta.side)) });
        else if (meta.preset) runs.push({ ...base, absent: false, ...presetAnswer(evidence, meta) });
        else runs.push({ ...base, absent: false, ...scoreAnswer(evidence, meta.truth, meta.root) });
      });
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const summarize = (rows) => {
    const scored = rows.filter((r) => !r.absent);
    const out = { runs: rows.length, scored: scored.length, absent: rows.length - scored.length };
    for (const m of ['precision', 'recall', 'f1', 'hit', 'named', 'dupes', 'created', 'raised', 'threads', ...SPLIT_METRICS, 'costUsd', 'turns']) {
      const values = scored.map((r) => r[m]).filter((x) => x !== null && x !== undefined);
      if (values.length) out[m] = mean(values);
      if (values.length && SPLIT_METRICS.includes(m)) out[`${m}N`] = values.length;
    }
    // A plan route that left no note is scored from its final message; counted, so that failure stays visible.
    const fromText = scored.filter((r) => typeof r.scoredText === 'string');
    if (fromText.length) out.scoredFrom = Object.fromEntries([...new Set(fromText.map((r) => r.scoredText))].sort().map((k) => [k, fromText.filter((r) => r.scoredText === k).length]));
    // An answer without a `Files` heading is scored whole, so every path it mentions counts as named.
    const sectioned = scored.filter((r) => typeof r.sectioned === 'boolean');
    if (sectioned.length) out.sectioned = sectioned.filter((r) => r.sectioned).length;
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

/** The arm of a baseline result that stands in for the bare model: the naked plugin's own arm, else `without`. */
export const bareArmOf = (baseline) => (baseline.suite?.plugins?.[0]?.name === NAKED_PLUGIN ? 'with' : 'without');

/** Per case name, the scored run count and each metric's mean (null when no run recorded it) over the bare arm. */
export function bareMeansByCase(baseline, metrics, analysis = createAnalysis()) {
  const arm = bareArmOf(baseline);
  const byCase = new Map();
  for (const r of scoreWithAnalysis(baseline, analysis).runs) {
    if (r.arm !== arm || r.absent) continue;
    const rows = byCase.get(r.case) ?? [];
    rows.push(r);
    byCase.set(r.case, rows);
  }
  const meanOf = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  return new Map(
    [...byCase].map(([name, rows]) => [name, { runs: rows.length, ...Object.fromEntries(metrics.map((m) => [m, meanOf(rows.map((r) => r[m]).filter((x) => typeof x === 'number'))])) }]),
  );
}

const bareMeanByCase = (baseline, metric) =>
  new Map([...bareMeansByCase(baseline, [metric])].filter(([, row]) => row[metric] !== null).map(([name, row]) => [name, row[metric]]));

/** Mean recall of the bare model per case name, from a naked-baseline result: the input of discrimination-ranked `select`. */
export const bareRecallByCase = (baseline) => bareMeanByCase(baseline, 'recall');

/** Mean precision of the bare model per case name: the tie-break of discrimination-ranked `select`. */
export const barePrecisionByCase = (baseline) => bareMeanByCase(baseline, 'precision');

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

