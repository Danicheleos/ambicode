// Plan eval runner (v6 33 §4, step 06 E3): ONE `claude -p` session per run, never `--resume` (MCP servers are
// dropped on resume). Epics, prompts and labels come from `--benchmarks <dir>` (NDA, gitignored); nothing here
// names an epic. Layout read from that directory: `<epic>/prompt.md`, optional `<epic>/repo` (the checkout to
// run in, default `<epic>/repo`), `<epic>/truth.txt` and `labels.json` (see plan-score.mjs).
//
//   node plan-run.mjs --benchmarks <dir> --plugin <dist dir> --model <id> --out <dir> [--runs 3] [--epics 3]
//        [--arms naked,route] [--max-cost-usd N] --dry-run | --authorized <label>
//
// The route arm starts the plan route from the user's prompt; acceptance comes only from the trusted-start
// preanswer in that prompt, never from a model flag.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerFlags } from './eval-answers.mjs';

export const ACCEPT_ANSWER = answerFlags('plan').join(' ');
const VALUE_OPTIONS = ['--benchmarks', '--plugin', '--model', '--out', '--runs', '--epics', '--arms', '--max-cost-usd', '--authorized', '--effort'];

export function parsePlanRunArgs(argv) {
  const values = {};
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--resume' || argv[i] === '--continue') throw new Error('plan-run starts one session per run: --resume drops the MCP servers');
    else if (VALUE_OPTIONS.includes(argv[i])) {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${argv[i - 1]} needs a value`);
      values[argv[i - 1]] = value;
    } else throw new Error(`unknown option ${argv[i]}: plan-run takes ${[...VALUE_OPTIONS, '--dry-run'].join(', ')}`);
  }
  for (const required of ['--benchmarks', '--model']) if (!values[required]) throw new Error(`${required} is required`);
  const arms = (values['--arms'] ?? 'naked,route').split(',');
  if (arms.some((arm) => !['naked', 'route'].includes(arm))) throw new Error('--arms takes naked and route');
  if (arms.includes('route') && !values['--plugin']) throw new Error('--plugin is required for the route arm');
  if (!dryRun) {
    if (!values['--authorized']) throw new Error('--authorized <label> is required: a paid run needs a named authorization');
    if (!values['--max-cost-usd'] || !values['--out']) throw new Error('--max-cost-usd and --out are required for a real run');
  }
  const count = (name, fallback) => {
    const n = Number(values[name] ?? fallback);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
    return n;
  };
  return { ...values, dryRun, arms, runs: count('--runs', 3), epics: count('--epics', 3) };
}

export function readEpics(benchmarks, limit) {
  const epics = readdirSync(benchmarks, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  return epics.slice(0, limit).map((epic) => ({ epic, prompt: readFileSync(path.join(benchmarks, epic, 'prompt.md'), 'utf8').trim(), cwd: path.join(benchmarks, epic, 'repo') }));
}

export const sessionPrompt = (arm, prompt) => (arm === 'route' ? `/ambicode:plan ${ACCEPT_ANSWER} ${prompt}` : prompt);

export function sessionArgv(options, arm, sessionId) {
  const args = ['-p', '--model', options['--model'], '--effort', options['--effort'] ?? 'medium', '--output-format', 'stream-json', '--verbose', '--session-id', sessionId];
  if (options['--max-cost-usd']) args.push('--max-budget-usd', options['--max-cost-usd']);
  if (arm === 'route') args.push('--plugin-dir', options['--plugin']);
  return args;
}

/** The sessions a run would spawn: one per epic × arm × run. */
export function planSessions(options) {
  const sessions = [];
  for (const { epic, prompt, cwd } of readEpics(options['--benchmarks'], options.epics))
    for (const arm of options.arms)
      for (let run = 1; run <= options.runs; run++) {
        const id = `${epic}-${arm}-${run}`;
        sessions.push({ id, epic, arm, run, cwd, argv: ['claude', ...sessionArgv(options, arm, randomUUID())], stdin: sessionPrompt(arm, prompt) });
      }
  return sessions;
}

function runSession(session, outDir) {
  return new Promise((resolve) => {
    const child = spawn(session.argv[0], session.argv.slice(1), { cwd: session.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stdin.end(session.stdin);
    child.on('close', (code) => {
      writeFileSync(path.join(outDir, `${session.id}.jsonl`), out);
      const result = out.split('\n').map((line) => { try { return JSON.parse(line); } catch { return null; } }).findLast((event) => event?.type === 'result');
      resolve({ id: session.id, code, cost: result?.total_cost_usd ?? 0, turns: result?.num_turns ?? null });
    });
  });
}

export async function main(argv) {
  const options = parsePlanRunArgs(argv);
  const sessions = planSessions(options);
  if (options.dryRun) {
    for (const session of sessions) console.log(JSON.stringify({ id: session.id, cwd: session.cwd, argv: session.argv, stdin: session.stdin }));
    return;
  }
  mkdirSync(options['--out'], { recursive: true });
  let spent = 0;
  for (const session of sessions) {
    if (spent >= Number(options['--max-cost-usd'])) throw new Error(`--max-cost-usd reached after ${spent.toFixed(2)} USD; stopped before ${session.id}`);
    const result = await runSession(session, options['--out']);
    spent += result.cost;
    console.log(JSON.stringify({ ...result, authorized: options['--authorized'] }));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exit(1); });
