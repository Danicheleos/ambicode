// Fails a `claude plugin eval` result whose runs died of something other than the arm itself. The harness
// scores such a run like any other, so a `max: 0` grader passes on it. Commands: <result.json>.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { infrastructureError } from './evals-bench.mjs';

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
