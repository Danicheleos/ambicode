// `init-scout-large`: /ambicode:init --auto on a copy of a real, large repository (HEAD, without .ambicode/context, with its
// config.yaml and its .claude/), graded on what the scout wrote. Generated into evals/cases/init-large/ (gitignored, skipped by
// suite.test.mjs and by cases.mjs's clean-up, because the repository is not in git): `node evals/scripts/init-large-case.mjs`, then
// `npm run evals -- --case init-scout-large --max-cost-usd 1`. Source: env INIT_BENCH, default the sibling inseer-frontend checkout.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { BUILDERS } from './cases.mjs';
import { scoutGraders } from './init-cases.mjs';
import { buildModuleTree, maxModulesFor } from '../../src/modules/context/context.ts';

const EVALS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.dirname(EVALS);
export const INIT_LARGE = 'init-scout-large';
const CONTEXT = '.ambicode/context';
const LEDGER = '.ambicode/tasks/init/ledger.jsonl';
const sq = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
const y = (value) => `'${String(value).replace(/'/g, "''")}'`;

export const initLargeBench = (env = process.env) => path.resolve(env.INIT_BENCH);

/** The modules `context tree` prints for the config's project paths, by the same function and the config's own limits. */
export function modulesOfBench(files, config) {
  const roots = config.projects.flatMap((project) => project.paths).map((p) => p.replace(/\/$/, ''));
  return buildModuleTree(files, { roots, maxModules: maxModulesFor(config.context) }).modules.map((module) => ({ note: module.note, dir: module.path, depth: module.depth }));
}

export function initLargeScaffold(bench) {
  return `#!/bin/sh
# The session directory becomes a fresh git repository holding the bench's HEAD (tracked files, .claude/ included), no
# .ambicode/context, and the bench's config.yaml with the scout set to haiku (the default of templates/config.yaml).
set -e
git -C ${sq(bench)} archive HEAD | tar xf -
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.invalid commit -q -m bench
mkdir -p .ambicode
cp ${sq(path.join(bench, '.ambicode', 'config.yaml'))} .ambicode/config.yaml
sed -i.bak 's/scout: { model: [a-z]*,/scout: { model: haiku,/' .ambicode/config.yaml
rm .ambicode/config.yaml.bak
`;
}

export function renderInitLarge(bench, files = execFileSync('git', ['-C', bench, 'ls-files'], { maxBuffer: 1 << 28 }).toString().split('\n').filter(Boolean)) {
  const config = parse(readFileSync(path.join(bench, '.ambicode', 'config.yaml'), 'utf8'));
  const modules = modulesOfBench(files, config);
  const b = BUILDERS;
  const docs = ['CODE_GUIDELINE.md', 'CONTRIBUTING.md'].find((name) => files.includes(name)) ?? 'README.md';
  const graders = [
    b.tool('scout-invoked', 'Agent', 'ambicode:scout'),
    // The Agent input carries the model the init skill passes, in either key order.
    b.tool('scout-model-haiku', 'Agent', String.raw`ambicode:scout[^\n]*"model":"haiku"|"model":"haiku"[^\n]*ambicode:scout`),
    ...['overview', 'navigation', 'conventions', 'index'].map((name) => b.exists(`context-${name}`, `${CONTEXT}/${name}.md`)),
    ...scoutGraders(b, { modules, doc: docs, conventions: [] }).filter((grader) => grader.name !== 'index-has-no-extra-notes'),
    // recordInit writes "<n> files written, <p> problems" for every `context write`, rejected ones included.
    b.regex('no-failed-context-write', String.raw`context write[^\n]*, [1-9][0-9]* problems`, { file: LEDGER, match: 'not_contains' }),
  ];
  const root = `cases/init-large/${INIT_LARGE}`;
  const out = new Map();
  out.set(`${root}/case.yaml`, `schema_version: "1.1"\nname: ${INIT_LARGE}\ncontext:\n  scaffold_script: scaffold.sh\n`);
  out.set(`${root}/scaffold.sh`, initLargeScaffold(bench));
  out.set(`${root}/prompt.md`, ['---', `name: ${INIT_LARGE}`, `description: ${y('/ambicode:init --auto on a large real repository: does the haiku scout write every module note without a rejected write.')}`, 'tags: ["init-large"]', 'runs: 1', 'max_turns: 40', 'timeout_seconds: 1200', 'allowed_tools: [Read, Glob, Grep, Bash, Write, Skill, Agent]', '---', '', '/ambicode:init --auto', ''].join('\n'));
  for (const grader of graders) out.set(`${root}/graders/${grader.name}.md`, grader.text);
  out.set(`${root}/truth.json`, `${JSON.stringify({ bench, modules: modules.map((module) => module.note) }, null, 2)}\n`);
  return out;
}

export function writeInitLarge(evalsDir = EVALS, env = process.env) {
  const bench = initLargeBench(env);
  if (!existsSync(path.join(bench, '.ambicode', 'config.yaml'))) {
    console.log(`${INIT_LARGE} skipped: no ${path.join(bench, '.ambicode', 'config.yaml')} (set INIT_BENCH)`);
    return 0;
  }
  rmSync(path.join(evalsDir, 'cases', 'init-large'), { recursive: true, force: true });
  const files = renderInitLarge(bench);
  for (const [relative, text] of files) {
    const file = path.join(evalsDir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text, relative.endsWith('.sh') ? { mode: 0o755 } : undefined);
  }
  console.log(`${INIT_LARGE}: ${files.size} files`);
  return files.size;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) writeInitLarge();
