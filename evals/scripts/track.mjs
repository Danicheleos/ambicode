// Appends one row per case from a `claude plugin eval --json` result to the history, and rewrites the summary table.
// Usage: track.mjs <result.json> [--model <m>] [--history evals/history.jsonl] [--summary evals/history.md]
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const mean = (values) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);
const round = (value, digits = 3) => (value === null ? null : Number(value.toFixed(digits)));

/** The with-plugin arm's runs; the suite runs no other arm unless asked, and a baseline arm says nothing about a skill. */
const runsOf = (evalCase) => evalCase.arms?.with ?? Object.values(evalCase.arms ?? {})[0] ?? [];

export function rowsOf(result, { model = 'unknown', plugin = 'unknown' } = {}) {
  return (result.cases ?? []).map((evalCase) => {
    const runs = runsOf(evalCase);
    const graders = {};
    for (const run of runs) for (const grader of run.graders ?? []) (graders[grader.name] ??= []).push(grader.passed ? 1 : 0);
    return {
      at: result.startedAt ?? new Date().toISOString(),
      claude: result.claudeVersion ?? null,
      plugin,
      model,
      case: evalCase.name,
      skill: evalCase.name.split('-')[0],
      runs: runs.length,
      errors: runs.filter((run) => run.error).length,
      score: round(mean(runs.map((run) => run.score ?? 0))),
      passed: runs.length > 0 && runs.every((run) => run.passed === true),
      costUsd: round(mean(runs.map((run) => (run.costUsd ?? 0) + (run.judgeCostUsd ?? 0))), 4),
      turns: round(mean(runs.map((run) => run.turns ?? 0)), 1),
      seconds: round(mean(runs.map((run) => run.durationSeconds ?? 0)), 0),
      graders: Object.fromEntries(Object.entries(graders).map(([name, passes]) => [name, round(mean(passes), 2)])),
    };
  });
}

export function readHistory(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

const delta = (now, before, digits = 2) => (before === undefined || before === null || now === null || now === before ? '' : ` (${now - before > 0 ? '+' : ''}${(now - before).toFixed(digits)})`);

/** Latest row per case against the row before it; one table per skill. */
export function summary(history) {
  const byCase = new Map();
  for (const row of history) (byCase.get(row.case) ?? byCase.set(row.case, []).get(row.case)).push(row);
  const latest = [...byCase.values()].map((rows) => ({ now: rows.at(-1), before: rows.at(-2) }));
  const last = history.at(-1);
  const lines = ['# Skill coverage history', ''];
  if (last === undefined) return `${lines.join('\n')}No run recorded yet.\n`;
  const current = latest.filter(({ now }) => now.at === last.at);
  lines.push(
    `Latest run: ${last.at} · plugin ${last.plugin} · Claude Code ${last.claude} · model ${last.model} · ${current.length} case(s) · mean score ${round(mean(current.map(({ now }) => now.score ?? 0)), 2)} · cost $${round(current.reduce((sum, { now }) => sum + (now.costUsd ?? 0) * now.runs, 0), 2)}`,
    '',
    'Δ compares each case with its previous row. Failing graders are the latest run\'s, with the pass share when runs > 1.',
    '',
  );
  for (const skill of [...new Set(latest.map(({ now }) => now.skill))].sort()) {
    lines.push(`## ${skill}`, '', '| case | score | cost $ | turns | runs | failing graders |', '| --- | --- | --- | --- | --- | --- |');
    for (const { now, before } of latest.filter(({ now }) => now.skill === skill).sort((a, b) => a.now.case.localeCompare(b.now.case))) {
      const failing = Object.entries(now.graders).filter(([, rate]) => rate < 1).map(([name, rate]) => (now.runs > 1 ? `${name} ${rate}` : name));
      const stale = now.at === last.at ? '' : ` (from ${now.at.slice(0, 10)})`;
      lines.push(`| ${now.case}${stale} | ${now.score}${delta(now.score, before?.score)} | ${now.costUsd}${delta(now.costUsd, before?.costUsd)} | ${now.turns}${delta(now.turns, before?.turns, 1)} | ${now.runs}${now.errors ? ` (${now.errors} errored)` : ''} | ${failing.join(', ') || '—'} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function main(argv) {
  const [file] = argv;
  if (!file) throw new Error('usage: track.mjs <result.json> [--model <m>] [--history <file>] [--summary <file>]');
  const option = (name, fallback) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : fallback; };
  const history = option('--history', 'evals/history.jsonl');
  const result = JSON.parse(readFileSync(file, 'utf8'));
  const plugin = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const rows = rowsOf(result, { model: option('--model', 'unknown'), plugin });
  appendFileSync(history, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
  writeFileSync(option('--summary', 'evals/history.md'), summary(readHistory(history)));
  for (const row of rows) console.log(`${row.case.padEnd(24)} score ${row.score}  $${row.costUsd}  ${row.turns} turns${row.errors ? `  ${row.errors} errored` : ''}`);
  console.log(`${rows.length} row(s) appended to ${history}${result.partial ? ' (partial result: the cost ceiling was hit)' : ''}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
