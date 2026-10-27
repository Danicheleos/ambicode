// Real-change cases for the task skill: a past change in a large bench repository, the task stated as a user would, the repository at the
// parent of that change.
//   <bench env vars named in the local file> node evals/scripts/real-cases.mjs [--evals evals]
// Writes evals/cases/task-real/ (plugin arm: `/ambicode:task`) and evals/bare/task-real/ (the same request, no skill). Both gitignored
// like downstream/: the scaffold names the local bench checkouts. The scaffold is downstream-cases.mjs's, pointed at the parent commit.
// The truth is `metrics: {source:'changed'}` scored by run.mjs on the workspace diff harvest snapshots (context.mjs changedFilesOf).
// The bench repositories are only read (git archive / show), never written.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from './downstream-cases.mjs';
import { seedFiles } from './task-seeds.mjs';

const EVALS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REAL_TAG = 'task-real';
export const isRealCase = (name) => name.startsWith('task-real-');

// The cases themselves are data about the bench repositories and live in the gitignored evals/local/real-cases.json (see LOCAL_FILE); nothing
// of them is kept in git. Shape of that file:
//   { repos: { <key>: { bench: <env var of the checkout>, context: <env var of its context dir, optional> } },
//     cases: [{ name: 'task-real-...', repo: <key>, kind, slug, commit, parent, description, prompt, relevant: [file], allowed: [file | dir/], limits?: {max_turns, timeout_seconds},
//               graders: [grader] }] }
// A grader is {name, weight?, guard?, match?: 'contains' | 'not_contains'} plus one of
//   kind 'file':  pattern over the workspace file `file` (a literal path);
//   kind 'trace': `pattern` over the tool-call lines of the trace, or `wrote: [token regexes]`: one Edit/Write/Bash-write call whose line holds every token;
//   kind 'exists': `glob` of files that must exist in the workspace (new files whose name is a free choice);
//   kind 'diff': `pattern` over the added lines of the run's workspace diff, of the files whose path matches `in` (diff-graders.mjs; scored after the run, so it
//     sees new files of any name, files written through several edits or by a command). Kept in truth.json, not rendered as a harness grader;
//   kind 'llm': `rubric`, judged on the final message (weight 1: the final messages of the two arms differ in what they retell).
// A case also carries `plan` and `investigation`, two notes (markdown) a good plan or investigation of the task would have produced; each becomes a variant
// of the case, `<name>-plan` and `<name>-inv`, whose plugin arm starts from the note in .ambicode/tasks/<slug>/ and whose bare arm has the same text in the prompt;
// a third variant, `<name>` (tag task-real-raw), is the task prompt alone with nothing seeded.
// `guard: true` graders must hold on the untouched parent (real-cases.test.mjs measures it against the repository): they forbid the alternative the real
// change avoided. The others measure the change: they fail on the parent and pass on the real change.
// REAL_CASES_FILE points the generator and its tests at another file (a half-written set, one repository's cases).
export const LOCAL_FILE = process.env.REAL_CASES_FILE ?? path.join(EVALS, 'local', 'real-cases.json');

/** The cases and repository keys of the local file, or empty ones when the file is absent. */
export function loadRealCases(file = LOCAL_FILE) {
  if (!existsSync(file)) return { repos: {}, cases: [] };
  const data = JSON.parse(readFileSync(file, 'utf8'));
  return { repos: data.repos ?? {}, cases: data.cases ?? [] };
}

const y = (value) => `'${String(value).replace(/'/g, "''")}'`;
const grader = (name, frontmatter) => ({ name, text: `---\n${frontmatter}\n---\n` });
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();
// 40 turns ran short for a large repository: the task route alone takes 3 main turns and an implementer subagent. A case sized beyond one file sets its own `limits`.
const LIMITS = { max_turns: 60, timeout_seconds: 1500 };

// Every case, both arms: the eval measures the code a run writes, not the project's builds, tests or reviews. The plugin arm also gets every configured
// check set to null (config-checks-off.mjs) and `--headless` with no iteration named: every plan iteration runs and the review-offer gate defaults to skip.
export const NO_RUNS = 'Do not run builds, tests, linters or reviews; write the code and the tests it needs and stop.';

const WRITE_CALL = '(?:\\"name\\":\\"(?:Edit|Write)\\"|\\"name\\":\\"Bash\\"[^\\n]*(?:<<|\\.write\\(|sed -i|cat >|tee ))';
/** Regex over the trace for one write call (Edit, Write or a Bash write) whose single JSON line holds every token. Reads and greps do not match: they are not write calls. */
export const wroteLine = (tokens) => `(?<=^|\\n)${tokens.map((token) => `(?=[^\\n]*${token})`).join('')}(?=[^\\n]*${WRITE_CALL})[^\\n]*`;

/** The regex graders of one case, as the harness frontmatter. The route-done one reads the ledger and exists in the plugin arm only. */
export function graderFiles(real, plugin) {
  const out = real.graders.filter((g) => g.kind !== 'diff').map((g) => {
    const weight = `weight: ${g.weight ?? 1}`;
    if (g.kind === 'exists') return grader(g.name, `type: file_exists\npath: ${g.glob}\n${weight}`);
    if (g.kind === 'llm') return { name: g.name, text: `---\ntype: llm\nfocus: last_message\n${weight}\n---\n\n${g.rubric.trim()}\n` };
    const pattern = g.wrote ? wroteLine(g.wrote) : g.pattern;
    const target = g.kind === 'trace' ? 'trace' : `{ source: file, path: ${g.file} }`;
    return grader(g.name, `type: regex\npattern: ${y(pattern)}\nmatch: ${g.match ?? 'contains'}\ntarget: ${target}\n${weight}`);
  });
  if (plugin && real.variant === 'plan') out.push(grader('plan-picked-up', `type: regex\npattern: ${y(`"planPath":".ambicode/tasks/${real.slug}/plan\\.md","iteration":1`)}\nmatch: contains\ntarget: { source: file, path: .ambicode/tasks/${real.slug}/ledger.jsonl }\nweight: 1`));
  if (plugin) out.push(grader('route-done', `type: regex\npattern: ${y('"kind":"exit"[^\\n]*"reason":"done"')}\nmatch: contains\ntarget: { source: file, path: .ambicode/tasks/${real.slug}/ledger.jsonl }\nweight: 1`));
  return out;
}

/** The variants of a case: `<name>-plan` (an accepted plan) and `<name>-inv` (an investigation) start from a note; `<name>` itself is raw, the task prompt alone with nothing seeded. */
export function variantsOf(real) {
  const out = [];
  if (real.plan) out.push({ ...real, name: `${real.name}-plan`, slug: `${real.slug}p`, variant: 'plan', note: { kind: 'plan', text: real.plan }, request: 'Go ahead with the plan.' });
  if (real.investigation) out.push({ ...real, name: `${real.name}-inv`, slug: `${real.slug}i`, variant: 'inv', note: { kind: 'investigation', text: real.investigation }, request: real.prompt });
  out.push({ ...real, variant: 'raw', note: null, request: real.prompt });
  return out;
}

/** The request as typed to Claude Code with no plugin: the note's text in the prompt instead of a file the route picks up. Plain words, no AMBICODE names. */
const bareBody = (v) => (v.note === null ? oneLine(v.request) : v.note.kind === 'plan'
  ? `Implement the accepted plan below in this repository: make the changes it lists and add the tests it asks for.\n\n${v.note.text.trim()}`
  : `${oneLine(v.request)}\n\nAn earlier investigation of this code found the following; build on it.\n\n${v.note.text.trim()}`);

/** One variant's files for one arm, keyed below the arm's tree root. */
export function caseFiles({ real, order, sources, plugin }) {
  const root = `${String(order + 1).padStart(2, '0')}-${real.name}`;
  const files = new Map();
  files.set(`${root}/case.yaml`, `schema_version: "1.1"\nname: ${real.name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
  files.set(`${root}/scaffold.sh`, scaffold({ ...sources[real.repo], head: real.parent, policies: true, seeded: real.note !== null, checksOff: true }, plugin));
  if (plugin && real.note) for (const [name, text] of Object.entries(seedFiles(real.slug, real.note.kind, real.note.text))) files.set(`${root}/${name}`, text);
  files.set(`${root}/prompt.md`, [
    '---',
    `name: ${real.name}`,
    `description: ${y(real.description)}`,
    `tags: ["task", "${REAL_TAG}", "${REAL_TAG}-${real.variant}", "${real.kind}"]`,
    'runs: 1',
    `max_turns: ${(real.limits ?? LIMITS).max_turns}`,
    `timeout_seconds: ${(real.limits ?? LIMITS).timeout_seconds}`,
    `allowed_tools: [Read, Glob, Grep, Bash, Edit, Write${plugin ? ', Skill, Agent' : ''}]`,
    '---',
    '',
    plugin ? `/ambicode:task --task ${real.slug} --headless ${oneLine(real.request)} ${NO_RUNS}` : `${bareBody(real)}\n\n${NO_RUNS}`,
    '',
  ].join('\n'));
  for (const one of graderFiles(real, plugin)) files.set(`${root}/graders/${one.name}.md`, one.text);
  const diffGraders = real.graders.filter((g) => g.kind === 'diff').map(({ name, pattern, in: inside, match, weight }) => ({ name, pattern, ...(inside === undefined ? {} : { in: inside }), ...(match === undefined ? {} : { match }), weight: weight ?? 1 }));
  files.set(`${root}/truth.json`, `${JSON.stringify({ name: real.name, source: 'changed', level: 'file', relevant: real.relevant, allowed: real.allowed, ...(diffGraders.length === 0 ? {} : { diffGraders }), bench: { repo: real.repo, commit: real.commit, parent: real.parent } }, null, 2)}\n`);
  return files;
}

/** Rewrites both task-real trees; returns one row per variant. */
export function writeReal({ evalsDir = EVALS, sources, cases = loadRealCases().cases }) {
  for (const tree of ['cases', 'bare']) rmSync(path.join(evalsDir, tree, REAL_TAG), { recursive: true, force: true });
  return cases.flatMap(variantsOf).map((real, order) => {
    for (const plugin of [true, false]) {
      for (const [relative, text] of caseFiles({ real, order, sources, plugin })) {
        const file = path.join(evalsDir, plugin ? 'cases' : 'bare', REAL_TAG, relative);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, text, relative.endsWith('.sh') ? { mode: 0o755 } : undefined);
      }
    }
    return { name: real.name, relevant: real.relevant.length, allowed: real.allowed.length, parent: real.parent };
  });
}

/** truth.json of the rendered task-real case with this name, or null: run.mjs scores `changed` metrics from it. */
export function realTruth(name, evalsDir = EVALS) {
  const root = path.join(evalsDir, 'cases', REAL_TAG);
  if (!isRealCase(name) || !existsSync(root)) return null;
  for (const entry of readdirSync(root)) {
    const file = path.join(root, entry, 'truth.json');
    if (!existsSync(file)) continue;
    const truth = JSON.parse(readFileSync(file, 'utf8'));
    if (truth.name === name) return truth;
  }
  return null;
}

function main(argv, env) {
  let evals = EVALS;
  let file = LOCAL_FILE;
  for (let at = 0; at < argv.length; at += 1) {
    if (argv[at] === '--evals') evals = path.resolve(argv[++at]);
    else if (argv[at] === '--cases') file = path.resolve(argv[++at]);
    else throw new Error(`unknown argument ${argv[at]}`);
  }
  const { repos, cases } = loadRealCases(file);
  if (cases.length === 0) throw new Error(`no cases: ${file} is absent or empty`);
  const sources = {};
  for (const [key, names] of Object.entries(repos)) {
    if (!env[names.bench]) throw new Error(`env ${names.bench} (the ${key} checkout) is required`);
    const bench = path.resolve(env[names.bench]);
    sources[key] = { bench, context: path.resolve(env[names.context] ?? path.join(bench, '.ambicode', 'context')) };
  }
  for (const row of writeReal({ evalsDir: evals, sources, cases })) console.log(`${row.name}: ${row.relevant} relevant, ${row.allowed} allowed, parent ${row.parent.slice(0, 8)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2), process.env); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
