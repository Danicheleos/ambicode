// Fails a `claude plugin eval` result whose runs died of something other than the arm itself. The harness
// scores such a run like any other, so a `max: 0` grader passes on it. Commands: <result.json>.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// A run that hit its own turn or time limit is the arm's outcome. Any other error (session limit, lost
// login, interrupt, scaffold failure) says nothing about the arm: 84 of 156 runs on 2026-10-02 died so.
const ARM_OUTCOME_ERROR = /maximum number of turns|timed? ?out|timeout/i;
// 07_1105, 10_1109 and 11_1119 (a skill body whose "!`cmd`" failed at load): 60 runs with no error and 0 turns were scored
// and reported "complete". A run that made no model call says nothing about the arm either.
export const NO_TURN = 'no model turn: the run ended before its first model call';
export const infrastructureError = (run) => {
  if (run.error && !ARM_OUTCOME_ERROR.test(String(run.error))) return String(run.error);
  return run.error ? null : run.turns === 0 ? NO_TURN : null;
};

export function invalidRuns(results) {
  const out = [];
  for (const evalCase of results.cases ?? [])
    for (const [arm, runs] of Object.entries(evalCase.arms ?? {}))
      (runs ?? []).forEach((run, index) => {
        const error = infrastructureError(run);
        if (error) out.push({ case: evalCase.name, arm, run: index, error });
      });
  return out;
}

function main([file]) {
  if (!file) throw new Error('usage: run-validity.mjs <result.json>');
  const invalid = invalidRuns(JSON.parse(readFileSync(file, 'utf8')));
  for (const r of invalid) console.log(`INVALID  ${r.case} · ${r.arm} · run ${r.run}: ${r.error}`);
  console.log(invalid.length ? `run validity: FAIL, ${invalid.length} run(s) died outside the arm; rerun them before reading the scores` : 'run validity: pass');
  return invalid.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
