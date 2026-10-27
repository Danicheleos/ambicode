// $0 offline: the bytes of the plan route's first model delivery (map + policy stage + step text) on a scratch clone of the bench repo with the
// scratch packs of prepare-packs.mjs, against the hook channel's limit. The size is the `bytes` the engine ledgers for the delivered draft step,
// i.e. before any spill to a file. For `--route task` the policy travels in the implementer's work file, not the hook delivery, so its size is listed too. No model is called.
//   node evals/scripts/policy-plan-delivery.mjs [--cases bench/map] [--limit 8800] [--route plan|task]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { promptOf, scratchOf } from './map-bench.mjs';
import { benchRepo, copyProject } from './policy-bench.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Sizes of the draft deliveries recorded in a task ledger. */
export function draftBytes(ledgerText, step = 'draft') {
  return ledgerText.split('\n').filter(Boolean).map((row) => JSON.parse(row)).filter((row) => row.kind === 'step' && row.step === step && row.status === 'delivered').map((row) => row.bytes);
}

function configure(scratch, drafts) {
  rmSync(path.join(scratch, '.ambicode', 'policies'), { recursive: true, force: true });
  copyProject(benchRepo(), scratch);
  const config = parseYaml(readFileSync(path.join(scratch, '.ambicode', 'config.yaml'), 'utf8'));
  if (drafts) config.projects[0].policyFiles.push(...readdirSync(path.join(scratch, '.ambicode', 'policies', 'drafts')).sort().map((file) => `.ambicode/policies/drafts/${file}`));
  writeFileSync(path.join(scratch, '.ambicode', 'config.yaml'), stringifyYaml(config));
}

function main(argv) {
  const cases = path.resolve(argv.includes('--cases') ? argv[argv.indexOf('--cases') + 1] : path.join(REPO, 'bench', 'map'));
  const limit = Number(argv.includes('--limit') ? argv[argv.indexOf('--limit') + 1] : 8800);
  const route = argv.includes('--route') ? argv[argv.indexOf('--route') + 1] : 'plan';
  const step = route === 'task' ? 'change' : 'draft';
  const cli = path.join(REPO, 'scripts', 'ambicode.mjs');
  if (!existsSync(cli)) throw new Error('scripts/ambicode.mjs is missing: npm run build first');
  const scratch = scratchOf(benchRepo());
  const out = [`| config | case | ${step} delivery bytes | vs limit |${route === 'task' ? ' work file bytes |' : ''}`, `|---|---|---|---|${route === 'task' ? '---|' : ''}`];
  try {
    for (const drafts of [false, true]) {
      configure(scratch, drafts);
      for (const entry of readdirSync(cases).sort().filter((name) => existsSync(path.join(cases, name, 'prompt.md')))) {
        const task = `pd-${route}-${drafts ? 'd' : 'l'}-${entry.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
        execFileSync('node', [cli, 'route', 'start', route, '--task', task, '--headless', promptOf(readFileSync(path.join(cases, entry, 'prompt.md'), 'utf8'))], { cwd: scratch, encoding: 'utf8', maxBuffer: 1 << 26 });
        const [bytes] = draftBytes(readFileSync(path.join(scratch, '.ambicode', 'tasks', task, 'ledger.jsonl'), 'utf8'), step);
        out.push(`| ${drafts ? 'packs+drafts' : 'packs'} | ${entry} | ${bytes} | ${bytes <= limit ? 'under' : 'OVER'} ${limit} |${route === 'task' ? ` ${statSync(path.join(scratch, '.ambicode', 'tasks', task, 'steps', 'work-change.md')).size} |` : ''}`);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  process.stdout.write(`${out.join('\n')}\n`);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('policy-plan-delivery.mjs')) main(process.argv.slice(2));
