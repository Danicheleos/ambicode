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
// A second tag for the cases of one suite: its file sets `tag`, and writeReal renders and clears only that tree, so task-real/ is left alone.
export const SUITE_TAG = 'suite-real';
// The investigate cases of the same benches: their own tag, so rendering them clears neither task-real/ nor suite-real/.
export const INVESTIGATE_TAG = 'suite-investigate';
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
//   kind 'llm': `rubric`, judged on the final message (weight 1: the final messages of the two arms differ in what they retell); with `focus: <workspace path>`
//     it judges that file of the final workspace instead, the same in both arms.
// A case also carries `plan` and `investigation`, two notes (markdown) a good plan or investigation of the task would have produced; each becomes a variant
// of the case, `<name>-plan` and `<name>-inv`, whose plugin arm starts from the note in .ambicode/tasks/<slug>/ and whose bare arm has the same text in the prompt;
// a third variant, `<name>` (tag task-real-raw), is the task prompt alone with nothing seeded.
// `guard: true` graders must hold on the untouched parent (real-cases.test.mjs measures it against the repository): they forbid the alternative the real
// change avoided. The others measure the change: they fail on the parent and pass on the real change.
// Optional file-level keys: `tag` (default task-real), `noRuns` (the sentence both arms get instead of NO_RUNS). Optional case keys: `promptFile` (path relative to the
// file, read as the prompt as-is; a missing or empty one throws), `investigationFile` (the same, read as `investigation`), `remove: [path]` (workspace files deleted before the scaffold's commit, both arms).
// `skill: 'investigate'` makes a case a question about the code at `parent`: `prompt` is the question (the generator appends the citation and `## Files` rules, as
// the retired synthetic investigate cases did; `files: false` drops the Files rule and scores citations), one variant, read-only tools, the investigate limits, the final message as the answer.
// Its truth is `relevant`/`allowed` scored on the answer, no diff. Grader kinds besides `llm` (judged on the final message): 'answer' (`pattern` over the final message, both arms),
// 'ledger' (`pattern` over the task ledger, plugin arm only), 'never' (`tool`, `input_match`: a tool_used grader with max 0, both arms).
// A file with a `tag` is a suite: its plugin arm copies <file dir>/<tag>-material/<case name>/.ambicode (a missing one throws) instead of the bench's.
// REAL_CASES_FILE points the generator and its tests at another file (a half-written set, one repository's cases).
export const LOCAL_FILE = process.env.REAL_CASES_FILE ?? path.join(EVALS, 'local', 'real-cases.json');

/** The cases and repository keys of the local file, or empty ones when the file is absent. */
export function loadRealCases(file = LOCAL_FILE) {
  if (!existsSync(file)) return { repos: {}, cases: [] };
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const cases = (data.cases ?? []).map((withName) => {
    // A file with a `tag` is a suite: each case starts from its frozen .ambicode in <tag>-material/<name>/ beside the file, not from the bench's current one.
    const one = data.tag === undefined ? withName : { ...withName, material: path.resolve(path.dirname(file), `${data.tag}-material`, withName.name) };
    if (one.material !== undefined && !existsSync(path.join(one.material, '.ambicode'))) throw new Error(`${one.name}: frozen material ${path.join(one.material, '.ambicode')} is missing`);
    const out = { ...one };
    for (const [key, into] of [['promptFile', 'prompt'], ['investigationFile', 'investigation']]) {
      if (one[key] === undefined) continue;
      const source = path.resolve(path.dirname(file), one[key]);
      const text = existsSync(source) ? readFileSync(source, 'utf8').trim() : '';
      if (text === '') throw new Error(`${one.name}: ${key} ${source} is missing or empty`);
      out[into] = text;
    }
    return out;
  });
  return { repos: data.repos ?? {}, cases, ...(data.tag === undefined ? {} : { tag: data.tag }), ...(data.noRuns === undefined ? {} : { noRuns: data.noRuns }) };
}

const y = (value) => `'${String(value).replace(/'/g, "''")}'`;
const grader = (name, frontmatter) => ({ name, text: `---\n${frontmatter}\n---\n` });
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();
// 40 turns ran short for a large repository: the task route alone takes 3 main turns and an implementer subagent. A case sized beyond one file sets its own `limits`.
const LIMITS = { max_turns: 60, timeout_seconds: 1500 };
// cases.mjs LIMITS.investigate: 30 turns failed none of its 6-7 file chains; a case on a larger repository sets its own `limits`.
const INVESTIGATE_LIMITS = { max_turns: 30, timeout_seconds: 900 };
const CITE = 'Cite `path:line` for each claim.';
const FILES = 'End your answer with a `## Files` section: one path per line, only the files that take part in the answer.';
const isInvestigate = (real) => real.skill === 'investigate';
const askOf = (real) => `${real.prompt} ${CITE}${real.files === false ? '' : ` ${FILES}`}`;

// Every case, both arms: the eval measures the code a run writes, not the project's builds, tests or reviews. The plugin arm also gets every configured
// check set to null (config-checks-off.mjs) and `--headless` with no iteration named: every plan iteration runs and the review-offer gate defaults to skip.
export const NO_RUNS = 'Do not run builds, tests, linters or reviews; write the code and the tests it needs and stop.';

const WRITE_CALL = '(?:\\"name\\":\\"(?:Edit|Write)\\"|\\"name\\":\\"Bash\\"[^\\n]*(?:<<|\\.write\\(|sed -i|cat >|tee ))';
/** Regex over the trace for one write call (Edit, Write or a Bash write) whose single JSON line holds every token. Reads and greps do not match: they are not write calls. */
export const wroteLine = (tokens) => `(?<=^|\\n)${tokens.map((token) => `(?=[^\\n]*${token})`).join('')}(?=[^\\n]*${WRITE_CALL})[^\\n]*`;

/** The regex graders of one case, as the harness frontmatter. The route-done one reads the ledger and exists in the plugin arm only. */
export function graderFiles(real, plugin) {
  const out = real.graders.filter((g) => g.kind !== 'diff' && (plugin || g.kind !== 'ledger')).map((g) => {
    const weight = `weight: ${g.weight ?? 1}`;
    if (g.kind === 'answer') return grader(g.name, `type: regex\npattern: ${y(g.pattern)}\nmatch: ${g.match ?? 'contains'}\ntarget: last_message\n${weight}`);
    if (g.kind === 'ledger') return grader(g.name, `type: regex\npattern: ${y(g.pattern)}\nmatch: ${g.match ?? 'contains'}\ntarget: { source: file, path: .ambicode/tasks/${real.slug}/ledger.jsonl }\n${weight}`);
    if (g.kind === 'never') return grader(g.name, `type: tool_used\ntool: ${g.tool}\ninput_match: ${y(g.input_match)}\nmin: 0\nmax: 0\n${weight}`);
    if (g.kind === 'exists') return grader(g.name, `type: file_exists\npath: ${g.glob}\n${weight}`);
    // The plugin arm's final message is one pointer line: the implementer's report is the file the task route saves; the bare arm has no route, so its message is the report.
    if (g.kind === 'llm' && g.focus) return { name: g.name, text: `---\ntype: llm\nfocus: { source: file, path: ${g.focus} }\n${weight}\n---\n\n${g.rubric.trim()}\n` };
    // An investigate case's answer is the final message in both arms; a task's plugin arm ends on a pointer line, so its judge reads the report.
    if (g.kind === 'llm') return { name: g.name, text: `---\ntype: llm\nfocus: ${plugin && !isInvestigate(real) ? `{ source: file, path: .ambicode/tasks/${real.slug}/report.md }` : 'last_message'}\n${weight}\n---\n\n${g.rubric.trim()}\n` };
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
  if (isInvestigate(real)) return [{ ...real, variant: 'raw', note: null, request: askOf(real) }];
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
export function caseFiles({ real, order, sources, plugin, tag = REAL_TAG, noRuns = NO_RUNS }) {
  const root = `${String(order + 1).padStart(2, '0')}-${real.name}`;
  const files = new Map();
  files.set(`${root}/case.yaml`, `schema_version: "1.1"\nname: ${real.name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
  files.set(`${root}/scaffold.sh`, scaffold({ ...sources[real.repo], head: real.parent, policies: true, seeded: real.note !== null, checksOff: true, remove: real.remove, material: real.material }, plugin));
  if (plugin && real.note) for (const [name, text] of Object.entries(seedFiles(real.slug, real.note.kind, real.note.text))) files.set(`${root}/${name}`, text);
  files.set(`${root}/prompt.md`, [
    '---',
    `name: ${real.name}`,
    `description: ${y(real.description)}`,
    `tags: ["${isInvestigate(real) ? 'investigate' : 'task'}", "${tag}", "${tag}-${real.variant}", "${real.kind}"]`,
    'runs: 1',
    `max_turns: ${(real.limits ?? (isInvestigate(real) ? INVESTIGATE_LIMITS : LIMITS)).max_turns}`,
    `timeout_seconds: ${(real.limits ?? (isInvestigate(real) ? INVESTIGATE_LIMITS : LIMITS)).timeout_seconds}`,
    `allowed_tools: [${isInvestigate(real) ? 'Read, Glob, Grep, Bash' : 'Read, Glob, Grep, Bash, Edit, Write'}${plugin ? (isInvestigate(real) ? ', Skill' : ', Skill, Agent') : ''}]`,
    '---',
    '',
    isInvestigate(real) ? `${plugin ? `/ambicode:investigate --task ${real.slug} ` : ''}${oneLine(real.request)}` : plugin ? `/ambicode:task --task ${real.slug} --headless ${oneLine(real.request)} ${noRuns}` : `${bareBody(real)}\n\n${noRuns}`,
    '',
  ].join('\n'));
  for (const one of graderFiles(real, plugin)) files.set(`${root}/graders/${one.name}.md`, one.text);
  const diffGraders = real.graders.filter((g) => g.kind === 'diff').map(({ name, pattern, in: inside, match, weight, perFile }) => ({ name, pattern, ...(inside === undefined ? {} : { in: inside }), ...(match === undefined ? {} : { match }), ...(perFile === undefined ? {} : { perFile }), weight: weight ?? 1 }));
  files.set(`${root}/truth.json`, `${JSON.stringify({ name: real.name, source: isInvestigate(real) ? (real.files === false ? 'citations' : 'files-section') : 'changed', level: 'file', relevant: real.relevant, allowed: real.allowed, ...(diffGraders.length === 0 ? {} : { diffGraders }), bench: { repo: real.repo, commit: real.commit, parent: real.parent } }, null, 2)}\n`);
  return files;
}

// The variants main() renders, with the number each directory keeps from the 30-variant set the other 27 were archived from
// (eval-archive/task-cases-2026-10-29): the numbers pin the directory names, so a later trim of the local file cannot renumber them.
export const KEEP = { 'task-real-k12-report-settings-plan': 19, 'task-real-k12-celery-email-plan': 22, 'task-real-k12-recognition-notifications': 30 };

/** Rewrites both task-real trees; returns one row per variant. With `keep` ({variant name: directory number}) only those variants are rendered. */
export function writeReal({ evalsDir = EVALS, sources, cases = loadRealCases().cases, keep = null, tag = REAL_TAG, noRuns = NO_RUNS }) {
  for (const tree of ['cases', 'bare']) rmSync(path.join(evalsDir, tree, tag), { recursive: true, force: true });
  const variants = cases.flatMap(variantsOf).map((real, order) => ({ real, order: keep ? (keep[real.name] ?? 0) - 1 : order }));
  return variants.filter(({ order }) => order >= 0).map(({ real, order }) => {
    for (const plugin of [true, false]) {
      for (const [relative, text] of caseFiles({ real, order, sources, plugin, tag, noRuns })) {
        const file = path.join(evalsDir, plugin ? 'cases' : 'bare', tag, relative);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, text, relative.endsWith('.sh') ? { mode: 0o755 } : undefined);
      }
    }
    return { name: real.name, relevant: real.relevant.length, allowed: real.allowed.length, parent: real.parent };
  });
}

/** truth.json of the rendered case with this name (any name: a suite's cases are not all task-real-*), or null: run.mjs scores `changed` metrics from it. The plan->task chain cases (chain-cases.mjs) are task-real-*-chain and live in cases/task-chain. */
export function realTruth(name, evalsDir = EVALS) {
  for (const tree of [REAL_TAG, 'task-chain', SUITE_TAG, INVESTIGATE_TAG]) {
    const root = path.join(evalsDir, 'cases', tree);
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      const file = path.join(root, entry, 'truth.json');
      if (!existsSync(file)) continue;
      const truth = JSON.parse(readFileSync(file, 'utf8'));
      if (truth.name === name) return truth;
    }
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
  const { repos, cases, tag = REAL_TAG, noRuns = NO_RUNS } = loadRealCases(file);
  if (cases.length === 0) throw new Error(`no cases: ${file} is absent or empty`);
  const sources = {};
  for (const [key, names] of Object.entries(repos)) {
    if (!env[names.bench]) throw new Error(`env ${names.bench} (the ${key} checkout) is required`);
    const bench = path.resolve(env[names.bench]);
    sources[key] = { bench, context: path.resolve(env[names.context] ?? path.join(bench, '.ambicode', 'context')) };
  }
  for (const row of writeReal({ evalsDir: evals, sources, cases, keep: tag === REAL_TAG ? KEEP : null, tag, noRuns })) console.log(`${row.name}: ${row.relevant} relevant, ${row.allowed} allowed, parent ${row.parent.slice(0, 8)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2), process.env); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
