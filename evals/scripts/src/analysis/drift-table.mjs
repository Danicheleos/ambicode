// The drift table: per case, the repetitions side by side with min, max, spread and an in-band flag, plus the
// mechanics (reads by route, zsh failures, host caps, operand refusals) that explain the spread. Offline and free.
import { ACCEPTANCE, driftOf } from '../validation/eval-gate.mjs';

/**
 * The absolute band of the drift plan: quality at least 0.9x the case's best repetition, resources at most 1.1x its
 * smallest. It is the plan's target for the plugin on its own; the gate's own thresholds (ACCEPTANCE.drift) are untouched.
 */
export const BAND = { quality: ACCEPTANCE.drift.qualityFloor, resource: 1.1 };

export const QUALITY = ['recall', 'precision', 'f1'];
export const RESOURCES = ['agentCostUsd', 'modelCalls', 'toolCalls', 'turns', 'servedBytes', 'peakContext', 'wallS'];
const MECHANICS = ['zshGlob', 'hostCapped', 'operandRefusals', 'failedCalls', 'failedWithZsh'];
// Float noise: 0.9 x 1.0 must sit on its own edge, as in the gate's EDGE.
const EDGE = 1e-9;

const number = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** One metric over a case's repetitions: values (null where unmeasured), min, max, spread, and the band verdict (null when a rep is unmeasured). */
export function metricOf(values, kind) {
  const known = values.filter((x) => x !== null);
  if (known.length !== values.length || !known.length) return { values, min: known.length ? Math.min(...known) : null, max: known.length ? Math.max(...known) : null, spread: null, inBand: null };
  const min = Math.min(...known);
  const max = Math.max(...known);
  if (kind === 'quality') return { values, min, max, spread: max === 0 ? 0 : (max - min) / max, inBand: max === 0 || min >= BAND.quality * max - EDGE };
  return { values, min, max, spread: min === 0 ? (max === 0 ? 0 : null) : max / min - 1, inBand: max <= BAND.resource * min + EDGE };
}

/** Case x arm groups of at least two repetitions; smaller groups are listed in `skipped`, never silently dropped. */
export function driftTable(rows) {
  const groups = Map.groupBy(rows, (r) => `${r.case}\t${r.arm}`);
  const gate = new Map(driftOf(rows.filter((r) => r.arm === 'with')).map((d) => [d.case, d]));
  const cases = [];
  const skipped = [];
  for (const [key, group] of groups) {
    const [name, arm] = key.split('\t');
    const reps = group.toSorted((a, b) => a.run - b.run);
    if (reps.length < 2) {
      skipped.push({ case: name, arm, runs: reps.length });
      continue;
    }
    const metrics = {};
    for (const m of QUALITY) metrics[m] = metricOf(reps.map((r) => number(r[m])), 'quality');
    for (const m of RESOURCES) metrics[m] = metricOf(reps.map((r) => number(r[m])), 'resource');
    const mechanics = reps.map((r) => ({ run: r.run, id: r.id, readsVia: r.readsVia ?? null, ...Object.fromEntries(MECHANICS.map((k) => [k, number(r[k])])) }));
    const out = Object.entries(metrics).filter(([, v]) => v.inBand === false).map(([k]) => k);
    cases.push({ case: name, arm, runs: reps.length, metrics, mechanics, outOfBand: out, gate: arm === 'with' ? (({ status, reasons }) => ({ status, reasons }))(gate.get(name) ?? { status: 'gap', reasons: ['no rows'] }) : null });
  }
  return { band: BAND, cases, skipped };
}

const cell = (x, digits) => (x === null || x === undefined ? '-' : Number.isInteger(x) && digits === 0 ? String(x) : x.toFixed(digits));
const DIGITS = { recall: 3, precision: 3, f1: 3, agentCostUsd: 3, modelCalls: 0, toolCalls: 0, turns: 0, servedBytes: 0, peakContext: 0, wallS: 1 };
const flag = (inBand) => (inBand === null ? 'n/a' : inBand ? 'in' : 'OUT');
const via = (v) => (v ? `${v.read ?? '-'}/${v.nativeRead}/${v.bash}` : '-');

export function renderDrift(table, label = '') {
  const out = [`# Drift table${label ? `: ${label}` : ''}`, '', `Band: quality >= ${BAND.quality}x best, resources <= ${BAND.resource}x min. Spread: quality (max-min)/max, resources max/min-1. Gate status is the eval gate's own (cost ceiling ${ACCEPTANCE.drift.costCeiling}x), shown for reference.`, ''];
  for (const c of table.cases) {
    out.push(`## ${c.case} (${c.arm}, ${c.runs} reps)${c.gate ? `, gate ${c.gate.status}${c.gate.reasons.length ? `: ${c.gate.reasons.join('; ')}` : ''}` : ''}`, '');
    out.push('| metric | per rep | min | max | spread | band |', '|---|---|---|---|---|---|');
    for (const [m, v] of Object.entries(c.metrics)) out.push(`| ${m} | ${v.values.map((x) => cell(x, DIGITS[m])).join(' / ')} | ${cell(v.min, DIGITS[m])} | ${cell(v.max, DIGITS[m])} | ${v.spread === null ? '-' : `${(v.spread * 100).toFixed(1)}%`} | ${flag(v.inBand)} |`);
    out.push('', '| rep | id | reads read/native/bash | zshGlob | hostCapped | operandRefusals | failed | failed+zsh |', '|---|---|---|---|---|---|---|---|');
    for (const r of c.mechanics) out.push(`| ${r.run} | ${r.id ?? '-'} | ${via(r.readsVia)} | ${cell(r.zshGlob, 0)} | ${cell(r.hostCapped, 0)} | ${cell(r.operandRefusals, 0)} | ${cell(r.failedCalls, 0)} | ${cell(r.failedWithZsh, 0)} |`);
    out.push('', `Out of band: ${c.outOfBand.length ? c.outOfBand.join(', ') : 'none'}`, '');
  }
  if (table.skipped.length) out.push(`Skipped (fewer than 2 reps): ${table.skipped.map((s) => `${s.case}/${s.arm} (${s.runs})`).join(', ')}`);
  return `${out.join('\n')}\n`;
}
