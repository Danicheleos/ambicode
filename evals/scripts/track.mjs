// Appends one row per case from a `claude plugin eval --json` result to the history, and rewrites the summary table.
// Usage: track.mjs <result.json> [--arm plugin|bare] [--model <m>] [--effort <level>] [--history <file>] [--summary <file>]
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sharedGraders, versionOf } from './cases.mjs';

const mean = (values) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);
const round = (value, digits = 3) => (value === null ? null : Number(value.toFixed(digits)));
/** Sample standard deviation; null under two values. */
const spread = (values) => {
  if (values.length < 2) return null;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
};
const numbers = (values) => values.filter((v) => typeof v === 'number');
const stat = (values) => ({ mean: round(mean(numbers(values))), sd: round(spread(numbers(values))), n: numbers(values).length });

/** The run's single arm: the suite always runs with --ablation none, so the harness names it `with` either way. */
const runsOf = (evalCase) => evalCase.arms?.with ?? Object.values(evalCase.arms ?? {})[0] ?? [];

export function rowsOf(result, { arm = 'plugin', model = 'unknown', effort = 'unknown', plugin = 'unknown', version = versionOf } = {}) {
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
      version: version(evalCase.name),
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
      // Distinct main-session model calls and tool calls (context.mjs); `turns` above is the harness's raw count, ≈ tool calls + 1.
      modelCalls: round(mean(context.map((c) => c.calls)), 1),
      toolCalls: round(mean(context.map((c) => c.tools).filter((n) => typeof n === 'number')), 1),
      graders: Object.fromEntries(Object.entries(graders).map(([name, passes]) => [name, round(mean(passes), 2)])),
      // Retrieval metrics (metrics.mjs), only for a case that declares them; a run that broke the files contract counts in `contractBroken`.
      ...(runs.some((run) => run.metrics) ? {
        metrics: {
          recall: stat(runs.map((run) => run.metrics?.recall)),
          precision: stat(runs.map((run) => run.metrics?.precision)),
          f1: stat(runs.map((run) => run.metrics?.f1)),
          contractBroken: runs.filter((run) => run.metrics?.contract === false).length,
        },
      } : {}),
      // One entry per run, for the drift between runs of the same case.
      perRun: runs.map((run) => ({
        score: round(run.score ?? 0, 2), turns: run.turns ?? null, seconds: run.durationSeconds ?? null, costUsd: round((run.costUsd ?? 0) + (run.judgeCostUsd ?? 0), 4),
        contextPeak: run.context?.peak ?? null, modelCalls: run.context?.calls ?? null, toolCalls: run.context?.tools ?? null, error: run.error ?? null, trace: run.trace ?? null,
        failing: (run.graders ?? []).filter((grader) => !grader.passed).map((grader) => grader.name),
        ...(run.metrics ? { recall: run.metrics.recall, precision: run.metrics.precision, f1: run.metrics.f1, missed: run.metrics.missed, extra: run.metrics.extra, contract: run.metrics.contract } : {}),
      })),
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

/** `calls/tools` of a row; rows written before those fields existed show `—`. */
const callsOf = (row) => `${row?.modelCalls ?? '—'}/${row?.toolCalls ?? '—'}`;
const kilo = (tokens) => (tokens === null || tokens === undefined ? '—' : (tokens / 1000).toFixed(1));
const signed = (value, digits = 2) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
const delta = (now, before, digits = 2) => (before === undefined || before === null || now === null || now === before ? '' : ` (${signed(now - before, digits)})`);
// Rows written before the arm and effort fields existed are plugin rows at the model's default effort.
const armOf = (row) => row.arm ?? 'plugin';
const setting = (row) => `${row.model}/${row.effort ?? 'default'}`;

/** Latest plugin row per case beside the latest bare row; the lift is shown only when both ran the same model and effort. */
export function summary(history, { shared = sharedGraders, version = versionOf } = {}) {
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
    'shared graders with no plugin loaded; `lift` = outcome − bare, shown only when both rows ran the same model, effort and case version.',
    '`calls/tools` are the distinct model calls and tool calls of the main session (the harness turn count is about tool calls + 1), plugin · bare.',
    '`context` is the largest main-session context of the run in thousands of tokens (input + cache), plugin / bare.',
    'Brackets: change against the previous row of the same arm. Failing graders are the latest plugin run\'s.',
    '',
  );
  for (const skill of [...new Set(names.map((name) => name.split('-')[0]))].sort()) {
    lines.push(`## ${skill}`, '', '| case | plugin | outcome | bare | lift | plugin $ | bare $ | calls/tools | context k | failing graders |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const name of names.filter((n) => n.split('-')[0] === skill)) {
      const now = latest('plugin', name);
      const bare = latest('bare', name);
      const outcome = now === undefined ? null : outcomeOf(now, shared(name));
      const current = (row) => (row.version ?? 1) === version(name);
      const lift = now !== undefined && bare !== undefined && outcome !== null && setting(now) === setting(bare) && current(now) && current(bare) ? signed(outcome - bare.score) : '';
      const failing = now === undefined ? [] : Object.entries(now.graders).filter(([, rate]) => rate < 1).map(([grader, rate]) => (now.runs > 1 ? `${grader} ${rate}` : grader));
      lines.push(`| ${name} | ${now ? `${now.score}${delta(now.score, previous('plugin', name)?.score)}` : '—'} | ${outcome ?? '—'} | ${bare ? `${bare.score}${delta(bare.score, previous('bare', name)?.score)}` : '—'} | ${lift || '—'} | ${now?.costUsd ?? '—'} | ${bare?.costUsd ?? '—'} | ${callsOf(now)}${bare ? ` · ${callsOf(bare)}` : ''} | ${kilo(now?.contextPeak)}${bare ? ` / ${kilo(bare.contextPeak)}` : ''} | ${failing.join(', ') || '—'} |`);
    }
    lines.push('');
  }
  lines.push(...runsSection(names, latest));
  return lines.join('\n');
}

const fmt = (s) => (s === undefined || s.mean === null ? '—' : `${s.mean.toFixed(2)}${s.sd === null ? '' : ` ± ${s.sd.toFixed(2)}`}`);
const cell = (value) => (value === null || value === undefined ? '—' : typeof value === 'number' ? String(Number(value.toFixed(2))) : value);

/** Every run of the latest multi-run row, and every latest row with retrieval metrics: the drift between runs of one case. */
function runsSection(names, latest) {
  const rows = names.flatMap((name) => ['plugin', 'bare'].map((arm) => latest(arm, name))).filter((row) => row?.perRun && (row.runs > 1 || row.metrics));
  if (rows.length === 0) return [];
  const lines = [
    '## Runs',
    '',
    'Every run of the latest row, for the drift on one case. Recall: share of the files a right answer names that were',
    'named. Precision: share of the named files that are right (or allowed). Mean ± sample standard deviation.',
    '',
  ];
  for (const row of rows) {
    const m = row.metrics?.recall?.n > 0 ? row.metrics : null;
    lines.push(`### ${row.case} · ${armOf(row)} · ${row.runs} run(s) · ${row.at.slice(0, 16)}`, '');
    if (m) lines.push(`recall ${fmt(m.recall)} · precision ${fmt(m.precision)} · F1 ${fmt(m.f1)}${m.contractBroken ? ` · ${m.contractBroken} run(s) without the Files section` : ''}`, '');
    const retrieval = (...values) => (m ? values : []);
    const head = ['run', 'score', ...retrieval('recall', 'precision', 'F1'), 'calls', 'tools', 'context k', '$', ...retrieval('missed', 'extra'), 'failing graders'];
    const line = (cells) => `| ${cells.join(' | ')} |`;
    lines.push(line(head), line(head.map(() => '---')));
    row.perRun.forEach((run, index) => {
      const missed = run.contract === false ? 'no Files section' : (run.missed ?? []).join(', ');
      lines.push(line([index + 1, cell(run.score), ...retrieval(cell(run.recall), cell(run.precision), cell(run.f1)), cell(run.modelCalls), cell(run.toolCalls), kilo(run.contextPeak), cell(run.costUsd), ...retrieval(missed || '—', (run.extra ?? []).join(', ') || '—'), `${run.failing.join(', ') || '—'}${run.error ? ` (${clip(run.error)})` : ''}`]));
    });
    lines.push(line(['spread', fmt(stat(row.perRun.map((r) => r.score))), ...retrieval('', '', ''), fmt(stat(row.perRun.map((r) => r.modelCalls))), fmt(stat(row.perRun.map((r) => r.toolCalls))), '', '', ...retrieval('', ''), '']), '');
  }
  return lines;
}
const clip = (text) => String(text).replace(/\s+/g, ' ').slice(0, 60);

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
