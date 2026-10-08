// Walkthroughs share the score invocation's parsed evidence and keep its public row shape.
import { CASES_ROOT } from '../shared/bench-paths.mjs';
import { baselineProvenance, createAnalysis, scoreWithAnalysis, servedPromptLine } from './bench-score.mjs';

const STEP_WIDTH = 120;
const oneLine = (text, width = STEP_WIDTH) => {
  const flat = String(text).replace(/\s*\n\s*/g, ' ⏎ ');
  return flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`;
};

function stepLine(call, n) {
  const input = call.block.input ?? {};
  const what =
    call.block.name === 'Bash'
      ? input.command
      : call.block.name === 'Skill'
        ? [input.skill, input.args].filter(Boolean).join(' ')
        : (input.file_path ?? input.pattern ?? input.path ?? JSON.stringify(input));
  return oneLine(`${n}. ${call.block.name} ${what}`);
}

/**
 * Error analysis, not a score: in trace order, the first thing that went wrong is the one to read,
 * since later ones often follow from it (evals-skills error-analysis: "errors cascade").
 */
function deviations(calls, { arm, root, error, turns, maxTurns, routed }) {
  const found = [];
  const seen = new Set();
  const once = (key, text) => {
    if (!seen.has(key)) found.push(text);
    seen.add(key);
  };
  let reviews = 0;
  (calls ?? []).forEach((call, i) => {
    const step = `(step ${i + 1})`;
    const input = call.block.input ?? {};
    if (JSON.stringify(input).includes('benchmarks/')) once('peek', `reached into benchmarks/ ${step}`);
    if (['Edit', 'Write', 'NotebookEdit'].includes(call.block.name) && String(input.file_path ?? '').includes(`/repo/${root}/`))
      once('edit', `edit attempted: ${input.file_path} ${step}`);
    if (call.truncated) once('cut', `prepare output cut with head/tail/cut ${step}`);
    if (call.helper === 'review' && ++reviews === 2) once('rerun', `review re-run ${step}`);
    if (call.failure) once(`fail:${call.failure}`, `${call.helper} failed: ${call.failure} ${step}`);
  });
  if (error) found.push(`the run ended in an error: ${error}`);
  if (calls && arm === 'with') {
    // A typed `/ambicode:<skill>` starts its route from the prompt hook with no Skill call, so the ledger counts too.
    const fired = routed || calls.some((c) => c.block.name === 'Skill' && String(c.block.input?.skill ?? '').startsWith('ambicode:'));
    if (!fired) found.push('no AMBICODE route started');
  }
  if (typeof maxTurns === 'number' && typeof turns === 'number' && turns >= maxTurns) found.push(`stopped at the ${maxTurns}-turn limit`);
  return found;
}

/** One entry per scored run: the `score` row, its steps (null when the trace was not harvested), and what went wrong. */
export function walkRuns(results, { cases = CASES_ROOT, tracesDir = null } = {}) {
  const analysis = createAnalysis({ cases, tracesDir });
  const { runs } = scoreWithAnalysis(results, analysis);
  return runs.map((row) => {
    const evalCase = results.cases.find((c) => c.name === row.case);
    const run = evalCase.arms[row.arm][row.run];
    const calls = analysis.trace(run)?.calls ?? null;
    const meta = analysis.meta(evalCase);
    const answer = (run.graders ?? []).find((g) => typeof g.evidence === 'string')?.evidence ?? null;
    return {
      row,
      answer,
      steps: calls ? calls.map((call, i) => stepLine(call, i + 1)) : null,
      deviations: deviations(calls, { arm: row.arm, root: meta.root, error: row.error, turns: row.turns, maxTurns: evalCase.maxTurns, routed: (row.ledger?.routes ?? 0) > 0 }),
    };
  });
}

const cell = (text) => String(text).replace(/\|/g, '\\|');
const money = (x) => (typeof x === 'number' ? x.toFixed(3) : 'n/a');

function scoreCell(row) {
  if (row.absent) return 'absent';
  if (row.kind.startsWith('review')) return `raised ${row.raised}/${row.threads}`;
  return `P ${row.precision.toFixed(2)} R ${row.recall.toFixed(2)}`;
}

export function walkReport(results, { cases = CASES_ROOT, tracesDir = null, source } = {}) {
  const walk = walkRuns(results, { cases, tracesDir });
  const total = walk.reduce((sum, w) => sum + (w.row.costUsd ?? 0), 0);
  const lines = [
    `# Walkthrough: ${source}`,
    '',
    `Plugin ${results.suite?.plugins?.[0]?.path ?? 'unknown'}, model ${results.suite?.modelOverride ?? 'unpinned'}, Claude Code ${results.claudeVersion ?? 'unrecorded'}, ${walk.length} run(s), $${total.toFixed(2)}${results.partial ? ', **partial run**' : ''}.`,
    `Served prompt: ${servedPromptLine(results)}.`,
    ...(results.baseline ? baselineProvenance(results).map((line) => `${line[0].toUpperCase()}${line.slice(1)}.`) : ['Baseline: none attached; this walk is not compared against a cached baseline.']),
    'Read each run\'s first deviation and write down what you saw, not why. Later deviations often follow from the first.',
    '',
    '| case | arm | run | $ | turns | skills | prepare | score | first deviation |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const { row, deviations: found } of walk) {
    const skills = row.trace ? [...new Set(row.trace.skills.filter((s) => s.startsWith('ambicode:')))].join(', ') || '—' : 'untraced';
    const prepare = row.trace ? `${row.trace.prepareRuns}${row.trace.prepareTruncated ? ` (${row.trace.prepareTruncated} cut)` : ''}` : 'untraced';
    lines.push(`| ${[row.case, row.arm, row.run, money(row.costUsd), row.turns ?? 'n/a', skills, prepare, scoreCell(row), found[0] ?? 'none found'].map(cell).join(' | ')} |`);
  }
  for (const { row, answer, steps, deviations: found } of walk) {
    lines.push('', `## ${row.case} · ${row.arm} · run ${row.run}`, '');
    lines.push(`- deviations: ${found.length ? found.join('; ') : 'none found'}`);
    if (answer !== null) lines.push(`- answer: ${oneLine(answer, 400)}`);
    if (steps === null) lines.push('- trace not harvested: its steps are unknown, not empty');
    else lines.push('', '```', ...steps, '```');
  }
  return `${lines.join('\n')}\n`;
}

