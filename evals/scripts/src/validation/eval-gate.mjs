// Turns a with/without run into a verdict. `claude plugin eval` reports meanDelta but never fails on it,
// and four 2026-09-29 runs read as plugin changes when only the model had changed. Commands: <result.json>.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES_ROOT } from '../shared/bench-paths.mjs';
import { NAKED_EQUIVALENCE, baselineProvenance, score, servedPromptLine, withBaseline } from '../analysis/bench-score.mjs';
import { resolveBaseline } from '../analysis/baseline-lock.mjs';
import { referenceFloors } from '../analysis/reference-lock.mjs';

export { NAKED_EQUIVALENCE };

/**
 * 3 runs: course B5 puts single-run noise at ±5–10 pp. 1.1× cost and +2 turns: report 2 §5's
 * acceptance bar; the plugin measured 1.25–1.6× and +2.6 to +5.9 turns on 2026-09-29. 0.2 absent:
 * above that an arm's mean describes the runs that finished, not the arm.
 */
export const BUDGET = { minRuns: 3, maxCostRatio: 1.1, maxExtraTurns: 2, maxAbsentShare: 0.2 };

/**
 * Per case over its runs: recall and F1 at least 0.9× the case's best run, agent cost at most 1.25× its cheapest.
 * The drift audit's 1.1× on every resource failed on one extra call (0/19 cases held API calls); counts are reported,
 * not gated. 0.8 of cases: 5 of the 6, 16 of the 20 core cases.
 */
export const DRIFT = { qualityFloor: 0.9, costCeiling: 1.25, minShare: 0.8, minRuns: 3 };

/**
 * The one acceptance policy: `gate` decides a run, `report` raises per-case findings. report.extraContext is the limit,
 * 3,200 tokens; extraContextSoft, 2,500, is the target. 2,500 failed on every 20-case run (+2,660 on 05_0035, +2,946 on
 * walk 17_1451 after the notation revert): the contract, skill, step header and map left no cut that kept the route.
 */
export const ACCEPTANCE = {
  gate: BUDGET,
  report: { costRatio: 1.2, cheapRatio: 0.9, extraCalls: 2, saturated: 0.95, floor: 0.2, spread: 0.5, routeReadyS: 5, extraContext: 3200, extraContextSoft: 2500 },
  drift: DRIFT,
};

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const range = (xs) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
const fmt = (x, digits = 3) => (x === null || x === undefined ? 'n/a' : Number(x).toFixed(digits));
// Four digits: run 27_0733's 1.1008× printed as "1.10× … budget 1.1×" beside a FAIL.
const RATIO_DIGITS = 4;

/**
 * The noise band is how far the arm's mean moves between repetitions of the same cases (run 0, run 1, …),
 * the wider of the two arms. A single repetition has no band, so it cannot excuse any loss.
 */
export function repetitionMeans(rows, metric) {
  const byRun = new Map();
  for (const r of rows) if (!r.absent && typeof r[metric] === 'number') (byRun.get(r.run) ?? byRun.set(r.run, []).get(r.run)).push(r[metric]);
  return [...byRun.keys()].sort((a, b) => a - b).map((k) => mean(byRun.get(k)));
}

// Costs are differences of recorded floats: 0.26 − 0.01 is 0.25000000000000006, which must still sit on the 1.25× edge.
const EDGE = 1e-9;

/**
 * Quality kept per case against the frozen reference: the run's case mean of recall and F1 at least the reference's
 * mean minus the noise band. The drift band compares a run with itself; this is what catches a steady regression.
 */
export function caseFloors(rows, floors, band) {
  const out = { referenced: [], below: [], unpinned: 0 };
  const names = [...new Set(rows.map((r) => r.case))];
  for (const name of names) {
    const floor = floors?.get(name);
    if (!floor) {
      out.unpinned += 1;
      continue;
    }
    out.referenced.push(name);
    const misses = [];
    for (const metric of ['recall', 'f1']) {
      const xs = rows.filter((r) => r.case === name && !r.absent && typeof r[metric] === 'number').map((r) => r[metric]);
      const now = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      if (floor[metric] && (now === null || now < floor[metric].mean - band - EDGE)) misses.push(`${metric} ${fmt(now, 2)} < ${fmt(floor[metric].mean, 2)} − ${fmt(band, 2)}`);
    }
    if (misses.length) out.below.push(`${name} (${misses.join('; ')})`);
  }
  return out;
}

/**
 * Per case, whether its runs stay in the drift band. A run that did not complete (blocked, open, unverified, absent)
 * puts its case out of band: it is no quality witness, and its zero spread is not stability. A case with fewer runs,
 * a run with no complete ledger, or a run with no agent cost, is a gap. Turns, tool calls, peak context and wall time
 * are max/min ratios, reported only.
 */
export function driftOf(rows, policy = DRIFT) {
  const cases = new Map();
  for (const r of rows) (cases.get(r.case) ?? cases.set(r.case, []).get(r.case)).push(r);
  return [...cases].map(([name, runs]) => {
    const spreadOf = (pick) => {
      const xs = runs.map(pick).filter((x) => typeof x === 'number');
      return xs.length === runs.length && Math.min(...xs) > 0 ? Math.max(...xs) / Math.min(...xs) : null;
    };
    const counts = { turns: spreadOf((r) => r.turns), toolCalls: spreadOf((r) => r.toolCalls ?? r.trace?.toolCalls), peakContext: spreadOf((r) => r.peakContext ?? r.trace?.peakContext), wallS: spreadOf((r) => r.wallS) };
    if (runs.length < policy.minRuns) return { case: name, status: 'gap', reasons: [`${runs.length} run(s)`], counts };
    const unknown = runs.filter((r) => !r.absent && (r.outcome ?? 'unknown') === 'unknown');
    if (unknown.length) return { case: name, status: 'gap', reasons: [`${unknown.length} run(s) with no complete ledger`], counts };
    const reasons = [];
    const unfinished = runs.filter((r) => r.absent || !['completed', 'unrouted'].includes(r.outcome));
    if (unfinished.length) reasons.push(`not completed: ${unfinished.map((r) => (r.absent ? 'absent' : r.outcome)).join(', ')}`);
    const quality = {};
    for (const metric of ['recall', 'f1']) {
      const xs = runs.map((r) => r[metric]).filter((x) => typeof x === 'number');
      const best = xs.length ? Math.max(...xs) : null;
      quality[metric] = { best, worst: xs.length ? Math.min(...xs) : null };
      if (best === null || best === 0) reasons.push(`no ${metric} witness`);
      else if (xs.length < runs.length || Math.min(...xs) < policy.qualityFloor * best - EDGE) reasons.push(`${metric} ${fmt(Math.min(...xs), 2)} < ${policy.qualityFloor}× best ${fmt(best, 2)}`);
    }
    const costs = runs.map((r) => r.agentCostUsd);
    if (costs.some((c) => typeof c !== 'number')) return { case: name, status: 'gap', reasons: ['agent cost unmeasured'], quality, counts };
    const cost = Math.max(...costs) / Math.min(...costs);
    if (cost > policy.costCeiling + EDGE) reasons.push(`agent cost ${fmt(cost, 2)}× cheapest`);
    return { case: name, status: reasons.length ? 'out' : 'in', reasons, quality, cost, counts };
  });
}

export function gate(given, { cases = CASES_ROOT, tracesDir = null, budget = BUDGET, drifting = DRIFT, floors = null, baseline = null, baselinePath = null, baselineArm } = {}) {
  const results = baseline ? withBaseline(given, baseline, { baselinePath, ...(baselineArm ? { arm: baselineArm } : {}) }) : given;
  const { runs } = score(results, { cases, tracesDir });
  const checks = [];
  const info = [];
  const check = (name, pass, detail) => checks.push({ name, pass, status: pass ? 'pass' : 'fail', detail });
  // Neither a pass nor a failure: the number the check needs was never produced. It is printed as a gap
  // and counted in the verdict, so an unpriced run cannot read as a measured one.
  const gap = (name, detail) => checks.push({ name, pass: true, status: 'gap', detail });

  info.push(...baselineProvenance(results));
  info.push(`served prompt: ${servedPromptLine(results)}`);

  check('complete', !results.partial, results.partial ? 'the harness reported a partial run' : 'not partial');

  const override = results.suite?.modelOverride ?? null;
  const models = [...new Set(runs.filter((r) => r.trace).map((r) => r.trace.model))].sort();
  if (!override) check('pinned-model', false, 'no --model override: the model depended on the caller');
  else if (models.length === 0) check('pinned-model', false, `--model ${override}, but no run is traced, so the model each run used is unverified`);
  else check('pinned-model', models.every((m) => m === override), `--model ${override}; traces show ${models.join(', ')}`);

  const perCase = new Map();
  for (const r of runs) perCase.set(`${r.case}/${r.arm}`, (perCase.get(`${r.case}/${r.arm}`) ?? 0) + 1);
  const fewest = perCase.size ? Math.min(...perCase.values()) : 0;
  check('runs-per-case', fewest >= budget.minRuns, `fewest runs of any case arm: ${fewest}, need ${budget.minRuns}`);

  const bands = [];
  for (const kind of [...new Set(runs.map((r) => r.kind))].sort()) {
    const arm = (name) => runs.filter((r) => r.kind === kind && r.arm === name);
    const withRows = arm('with');
    const withoutRows = arm('without');
    if (!withRows.length || !withoutRows.length) {
      check(`${kind}: arms`, false, `needs both arms, has with=${withRows.length} without=${withoutRows.length}`);
      continue;
    }
    for (const [name, rows] of [['with', withRows], ['without', withoutRows]]) {
      const absent = rows.filter((r) => r.absent).length;
      check(`${kind}/${name}: absent`, absent / rows.length <= budget.maxAbsentShare, `${absent} of ${rows.length} runs absent`);
    }
    const w = repetitionMeans(withRows, 'recall');
    const wo = repetitionMeans(withoutRows, 'recall');
    const band = Math.max(range(w), range(wo));
    bands.push(band);
    const delta = mean(w) - mean(wo);
    const recallDetail = `with ${fmt(mean(w))} vs without ${fmt(mean(wo))}, Δ ${fmt(delta)}, noise band ${fmt(band)}`;
    check(`${kind}: recall`, delta >= -band, recallDetail);

    const scored = (rows, key) => mean(rows.filter((r) => !r.absent && typeof r[key] === 'number').map((r) => r[key]));
    const costRatio = scored(withRows, 'agentCostUsd') / scored(withoutRows, 'agentCostUsd');
    const unpriced = [...withRows, ...withoutRows].filter((r) => !r.absent && typeof r.agentCostUsd !== 'number').length;
    const costDetail = `${fmt(costRatio, RATIO_DIGITS)}× the no-plugin arm (agent cost, judging excluded; harness total ${fmt(scored(withRows, 'costUsd') / scored(withoutRows, 'costUsd'), RATIO_DIGITS)}×), budget ${budget.maxCostRatio}×`;
    if (unpriced) gap(`${kind}: cost`, `${costDetail}, but ${unpriced} run(s) have neither a trace cost nor a judge cost to subtract`);
    else check(`${kind}: cost`, costRatio <= budget.maxCostRatio, costDetail);
    const drift = driftOf(withRows, drifting);
    const measured = drift.filter((d) => d.status !== 'gap');
    const held = measured.filter((d) => d.status === 'in');
    const driftDetail = `${held.length} of ${measured.length} cases within ${drifting.qualityFloor}× best recall and F1 and ${drifting.costCeiling}× cheapest agent cost, need ${drifting.minShare}`;
    const outside = drift.filter((d) => d.status !== 'in').map((d) => `${d.case} (${d.reasons.join('; ')})`);
    if (!measured.length) gap(`${kind}: drift`, `no case has ${drifting.minRuns} runs`);
    else check(`${kind}: drift`, held.length / measured.length >= drifting.minShare, `${driftDetail}${outside.length ? `; outside: ${outside.join(', ')}` : ''}`);
    const kept = caseFloors(withRows, floors, band);
    if (!kept.referenced.length) gap(`${kind}: case floors`, floors ? 'no case of this run is pinned in the reference lock' : 'no reference lock (`evals:bench reference <plugin eval.json>`)');
    else check(`${kind}: case floors`, !kept.below.length, `${kept.referenced.length - kept.below.length} of ${kept.referenced.length} pinned cases keep recall and F1 ≥ their reference mean − band ${fmt(band)}${kept.below.length ? `; below: ${kept.below.join(', ')}` : ''}${kept.unpinned ? `; ${kept.unpinned} case(s) not pinned` : ''}`);
    const extraTurns = scored(withRows, 'turns') - scored(withoutRows, 'turns');
    check(`${kind}: turns`, extraTurns <= budget.maxExtraTurns, `${fmt(extraTurns, 2)} more turns than the no-plugin arm, budget ${budget.maxExtraTurns}`);

    for (const key of ['precision', 'f1']) {
      const a = scored(withRows, key);
      if (a !== null) info.push(`${kind}: ${key} with ${fmt(a)} vs without ${fmt(scored(withoutRows, key))}`);
    }
    const traced = withRows.filter((r) => r.trace);
    if (traced.length) {
      const count = (pred) => `${traced.filter(pred).length}/${traced.length}`;
      info.push(
        // A typed `/ambicode:<skill>` starts its route from the prompt hook, with no native Skill call: the ledger is the activation.
        `${kind}/with: route started ${count((r) => (r.ledger?.routes ?? 0) > 0)} (ledger), ` +
          `Skill tool ${count((r) => r.trace.skills.some((s) => s.startsWith('ambicode:')))}, ` +
          `prepare ran ${count((r) => r.trace.prepareRuns > 0)}, prepare truncated ${count((r) => r.trace.prepareTruncated > 0)}, ` +
          `review runs ${fmt(mean(traced.map((r) => r.trace.reviewRuns)), 2)} per run`,
      );
    } else info.push(`${kind}/with: untraced, so firing and prepare use are unmeasured`);
    info.push(...builtinLines(kind, withRows, withoutRows));
    // A question the eval's answers did not cover took its headless default: what the route did then, nobody chose.
    const defaulted = new Map();
    for (const r of withRows) for (const [gateId, n] of Object.entries(r.ledger?.headlessDefaults ?? {})) defaulted.set(gateId, (defaulted.get(gateId) ?? 0) + n);
    if (defaulted.size) gap(`${kind}: gate answers`, `headless defaults taken, not covered by eval-answers.mjs: ${[...defaulted].map(([g, n]) => `${g} ×${n}`).join(', ')}`);
  }

  const meanDelta = results.aggregates?.meanDelta;
  const widest = bands.length ? Math.max(...bands) : 0;
  if (results.baseline) gap('meanDelta', 'the harness computes meanDelta only with both arms in one run; against a cached baseline, the recall check above is the Δ check');
  else if (typeof meanDelta !== 'number') check('meanDelta', false, 'the result carries no meanDelta');
  else check('meanDelta', meanDelta >= -widest, `harness meanDelta ${fmt(meanDelta)}, widest noise band ${fmt(widest)}`);

  return { pass: checks.every((c) => c.pass), gaps: checks.filter((c) => c.status === 'gap').length, checks, info };
}

/** Which built-in plugins each arm's traces loaded. It decides nothing: Claude Code chooses them, not the repository. */
export function builtinLines(kind, withRows, withoutRows) {
  const summary = (rows) => {
    const traced = rows.filter((r) => Array.isArray(r.trace?.builtinPlugins));
    const counts = new Map();
    for (const r of traced) for (const name of r.trace.builtinPlugins) counts.set(name, (counts.get(name) ?? 0) + 1);
    return { traced: traced.length, counts };
  };
  const w = summary(withRows);
  const wo = summary(withoutRows);
  if (!w.traced || !wo.traced) return [`${kind}: built-in plugins unmeasured (traced with=${w.traced} without=${wo.traced})`];
  const names = [...new Set([...w.counts.keys(), ...wo.counts.keys()])].sort();
  const share = (s, name) => `${s.counts.get(name) ?? 0}/${s.traced}`;
  const lines = [`${kind}: built-in plugins ${names.map((name) => `${name} with ${share(w, name)} without ${share(wo, name)}`).join('; ') || 'none'}`];
  const differs = names.filter((name) => (w.counts.get(name) ?? 0) / w.traced !== (wo.counts.get(name) ?? 0) / wo.traced);
  if (differs.length) lines.push(`${kind}: WARNING the arms loaded different built-in plugins (${differs.join(', ')}); part of any context or cost gap is the platform`);
  return lines;
}

function main(argv) {
  const option = (name) => {
    const i = argv.indexOf(name);
    return i < 0 ? undefined : argv.splice(i, 2)[1];
  };
  const tracesAt = option('--traces');
  const baselinePath = option('--baseline');
  const baselineArm = option('--baseline-arm');
  const budget = { ...BUDGET };
  for (const [flag, key] of [['--min-runs', 'minRuns'], ['--max-cost-ratio', 'maxCostRatio'], ['--max-extra-turns', 'maxExtraTurns'], ['--max-absent-share', 'maxAbsentShare']]) {
    const value = option(flag);
    if (value !== undefined) budget[key] = Number(value);
  }
  const [file] = argv;
  if (!file)
    throw new Error('usage: eval-gate.mjs <eval-results.json> [--baseline <with-without-results.json> [--baseline-arm without|with]] [--reference <reference.lock.json>] [--traces <dir>] [--min-runs n] [--max-cost-ratio x] [--max-extra-turns n] [--max-absent-share x]');
  const results = JSON.parse(readFileSync(file, 'utf8'));
  const resolved = resolveBaseline(results, { baselinePath });
  // Both layouts: traces beside the result, and in the iteration above `results/` (where every 2026-10-07 run wrote
  // them; looking only beside the result failed pinned-model as "no run is traced" on runs 24–27).
  const tracesOf = (at) => [path.join(path.dirname(path.resolve(at)), 'traces'), path.join(path.dirname(path.dirname(path.resolve(at))), 'traces')];
  const tracesDir = tracesAt ?? [...tracesOf(file), ...(resolved ? tracesOf(resolved.file) : [])];
  const referenceAt = option('--reference');
  const floors = referenceFloors(referenceAt ? { lockFile: path.resolve(referenceAt) } : {});
  const verdict = gate(results, { tracesDir, budget, floors, baseline: resolved?.results ?? null, baselinePath: resolved?.file ?? null, baselineArm });
  for (const c of verdict.checks) console.log(`${{ pass: 'pass', fail: 'FAIL', gap: 'GAP ' }[c.status]}  ${c.name}: ${c.detail}`);
  for (const line of verdict.info) console.log(`info  ${line}`);
  const gaps = verdict.gaps ? `, ${verdict.gaps} unmeasured` : '';
  console.log(verdict.pass ? `gate: pass${gaps}` : `gate: FAIL (${verdict.checks.filter((c) => !c.pass).length} of ${verdict.checks.length} checks${gaps})`);
  return verdict.pass ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
