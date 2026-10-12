// Appends one row per case from a `claude plugin eval --json` result to the history, and rewrites the summary table.
// Usage: track.mjs <result.json> [--arm plugin|bare] [--model <m>] [--effort <level>] [--history <file>] [--summary <file>]
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sharedGraders } from './cases.mjs';

const mean = (values) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);
const round = (value, digits = 3) => (value === null ? null : Number(value.toFixed(digits)));

/** The run's single arm: the suite always runs with --ablation none, so the harness names it `with` either way. */
const runsOf = (evalCase) => evalCase.arms?.with ?? Object.values(evalCase.arms ?? {})[0] ?? [];

export function rowsOf(result, { arm = 'plugin', model = 'unknown', effort = 'unknown', plugin = 'unknown' } = {}) {
  return (result.cases ?? []).map((evalCase) => {
    const runs = runsOf(evalCase);
    const graders = {};
    const context = runs.map((run) => run.context).filter(Boolean);
    for (const run of runs) for (const grader of run.graders ?? []) (graders[grader.name] ??= []).push(grader.passed ? 1 : 0);
    return {
      at: result.startedAt ?? new Date().toISOString(),
      arm,
      claude: result.claudeVersion ?? null,
      plugin: arm === 'bare' ? null : plugin,
      model,
      effort,
      case: evalCase.name,
      skill: evalCase.name.split('-')[0],
      runs: runs.length,
      errors: runs.filter((run) => run.error).length,
      score: round(mean(runs.map((run) => run.score ?? 0))),
      passed: runs.length > 0 && runs.every((run) => run.passed === true),
      costUsd: round(mean(runs.map((run) => (run.costUsd ?? 0) + (run.judgeCostUsd ?? 0))), 4),
      turns: round(mean(runs.map((run) => run.turns ?? 0)), 1),
      seconds: round(mean(runs.map((run) => run.durationSeconds ?? 0)), 0),
      // Main-session tokens per model call (context.mjs); null when no trace was kept.
      contextPeak: round(mean(context.map((c) => c.peak)), 0),
      contextFinal: round(mean(context.map((c) => c.final)), 0),
      graders: Object.fromEntries(Object.entries(graders).map(([name, passes]) => [name, round(mean(passes), 2)])),
    };
  });
}

/** The weighted share of a row's shared graders that passed: the part of a plugin score a bare run can be compared with. */
export function outcomeOf(row, shared = sharedGraders(row.case)) {
  const scored = shared.filter(({ name }) => row.graders[name] !== undefined);
  const weight = scored.reduce((sum, { weight }) => sum + weight, 0);
  return weight === 0 ? null : round(scored.reduce((sum, { name, weight }) => sum + row.graders[name] * weight, 0) / weight);
}

export function readHistory(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

const kilo = (tokens) => (tokens === null || tokens === undefined ? '—' : (tokens / 1000).toFixed(1));
const signed = (value, digits = 2) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
const delta = (now, before, digits = 2) => (before === undefined || before === null || now === null || now === before ? '' : ` (${signed(now - before, digits)})`);
// Rows written before the arm and effort fields existed are plugin rows at the model's default effort.
const armOf = (row) => row.arm ?? 'plugin';
const setting = (row) => `${row.model}/${row.effort ?? 'default'}`;

/** Latest plugin row per case beside the latest bare row; the lift is shown only when both ran the same model and effort. */
export function summary(history, { shared = sharedGraders } = {}) {
  const series = new Map();
  for (const row of history) {
    const key = `${armOf(row)}:${row.case}`;
    (series.get(key) ?? series.set(key, []).get(key)).push(row);
  }
  const latest = (arm, name) => series.get(`${arm}:${name}`)?.at(-1);
  const previous = (arm, name) => series.get(`${arm}:${name}`)?.at(-2);
  const names = [...new Set(history.map((row) => row.case))].sort();
  const lines = ['# Skill coverage history', ''];
  if (names.length === 0) return `${lines.join('\n')}No run recorded yet.\n`;
  for (const arm of ['plugin', 'bare']) {
    const rows = names.map((name) => latest(arm, name)).filter(Boolean);
    if (rows.length === 0) continue;
    const last = rows.reduce((a, b) => (a.at > b.at ? a : b));
    lines.push(`- **${arm}** [longest run, turn by turn](chains/${arm}-longest.md) · latest run ${last.at} · ${setting(last)} · Claude Code ${last.claude}${arm === 'plugin' ? ` · plugin ${last.plugin}` : ''} · ${rows.length} case(s) · mean score ${round(mean(rows.map((row) => row.score ?? 0)), 2)} · cost $${round(rows.reduce((sum, row) => sum + (row.costUsd ?? 0) * row.runs, 0), 2)}`);
  }
  lines.push(
    '',
    '`plugin` is the full case score; `outcome` is its shared graders only (answer, code, boundary); `bare` is the same',
    'shared graders with no plugin loaded; `lift` = outcome − bare, shown only when both rows ran the same model and effort.',
    '`context` is the largest main-session context of the run in thousands of tokens (input + cache), plugin / bare.',
    'Brackets: change against the previous row of the same arm. Failing graders are the latest plugin run\'s.',
    '',
  );
  for (const skill of [...new Set(names.map((name) => name.split('-')[0]))].sort()) {
    lines.push(`## ${skill}`, '', '| case | plugin | outcome | bare | lift | plugin $ | bare $ | turns | context k | failing graders |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const name of names.filter((n) => n.split('-')[0] === skill)) {
      const now = latest('plugin', name);
      const bare = latest('bare', name);
      const outcome = now === undefined ? null : outcomeOf(now, shared(name));
      const lift = now !== undefined && bare !== undefined && outcome !== null && setting(now) === setting(bare) ? signed(outcome - bare.score) : '';
      const failing = now === undefined ? [] : Object.entries(now.graders).filter(([, rate]) => rate < 1).map(([grader, rate]) => (now.runs > 1 ? `${grader} ${rate}` : grader));
      lines.push(`| ${name} | ${now ? `${now.score}${delta(now.score, previous('plugin', name)?.score)}` : '—'} | ${outcome ?? '—'} | ${bare ? `${bare.score}${delta(bare.score, previous('bare', name)?.score)}` : '—'} | ${lift || '—'} | ${now?.costUsd ?? '—'} | ${bare?.costUsd ?? '—'} | ${now?.turns ?? '—'}${bare ? ` / ${bare.turns}` : ''} | ${kilo(now?.contextPeak)}${bare ? ` / ${kilo(bare.contextPeak)}` : ''} | ${failing.join(', ') || '—'} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main(argv) {
  const [file] = argv;
  if (!file) throw new Error('usage: track.mjs <result.json> [--arm plugin|bare] [--model <m>] [--effort <level>] [--history <file>] [--summary <file>]');
  const option = (name, fallback) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : fallback; };
  const history = option('--history', 'evals/history.jsonl');
  const result = JSON.parse(readFileSync(file, 'utf8'));
  const plugin = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const rows = rowsOf(result, { arm: option('--arm', 'plugin'), model: option('--model', 'unknown'), effort: option('--effort', 'unknown'), plugin });
  appendFileSync(history, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
  writeFileSync(option('--summary', 'evals/history.md'), summary(readHistory(history)));
  for (const row of rows) console.log(`${row.arm.padEnd(6)} ${row.case.padEnd(24)} score ${row.score}  $${row.costUsd}  ${row.turns} turns${row.errors ? `  ${row.errors} errored` : ''}`);
  console.log(`${rows.length} row(s) appended to ${history}${result.partial ? ' (partial result: the cost ceiling was hit)' : ''}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
