// Downstream cases: the corrected map cases run end to end on the real bench repository, so a map change is judged on a real project.
//   NAV_BENCH=<repo> node evals/scripts/downstream-cases.mjs [--maps bench/map] [--evals evals]
// Writes evals/cases/downstream/ (plugin arm: `/ambicode:investigate <ticket>`) and evals/bare/downstream/ (bare arm: the same request
// without the skill). Both gitignored: they hold ticket text and truth paths. The truth is the map case's truth.json, scored at file level
// from the `## Files` section of the final answer (scoreFiles), by run.mjs into each run's `metrics` and by the plugin-master Evals view.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalTextOf, foundPaths, scoreFiles } from './metrics.mjs';
import { promptOf } from './map-bench.mjs';

const EVALS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.dirname(EVALS);
export const DOWNSTREAM_TAG = 'downstream';
// Corrected targets per map case (2026-10-23): 6141 has 32, 3571 24, then 5967 16 and 6292 14; the next, 5948, has 13. 6404 (6 targets) is
// kept because the first three were named by the user, so the cases with the most reachable targets after them are 5967 and 6292.
export const DOWNSTREAM_IDS = ['6141', '3571', '6404', '5967', '6292'];
export const downstreamCaseName = (id) => `fe-vs-${id}-downstream`;
export const isDownstreamCase = (name) => /^fe-vs-\d+-downstream$/.test(name);

// Navigator limits, except the timeout: a full route reads the repository with a stronger model than the haiku navigator (plugin navigator max 226 s, bare 97 s).
const LIMITS = { max_turns: 40, timeout_seconds: 600 };
// Heading and list shape metrics.mjs `files-section` reads; the same line in both arms, so the metric is comparable.
const FILES = 'Do not change anything. End your answer with a `## Files` section: one repository-relative path per line, only the files that take part in the answer.';
const REQUEST = 'Which files would the change in this ticket need to edit or read? Ticket:';
// One line, as every app investigate case: a multi-line prompt ran as a plain model, the session never called the skill (fe-vs-6404, 2026-10-23).
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

const y = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sq = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

// A `## Files` heading (exactly `Files`), then lines up to the next heading (blank ones included, as foundPaths reads the section), then a path with a
// directory part at the start of a line (after a bullet, number or backticks). The first version nested the optional pieces of a line inside a lazy
// repeat and took 82 s on ten prose lines below the heading (measured 2026-10-26), so each line here is consumed one way only.
const FILES_SECTION = '(?:^|\\n)#{1,6}[ \\t]*Files[ \\t]*:?[ \\t]*\\r?\\n(?:(?!#{1,6}[ \\t])[^\\n]*\\n)*?[ \\t]*(?:[-*]|\\d+[.)])?[ \\t]*[`*]*(?:\\./)?[\\w@.-]+(?:/[\\w@.-]+)+';

const grader = (name, frontmatter) => ({ name, text: `---\n${frontmatter}\n---\n` });
const graders = (plugin, id) => [
  grader('files-section', `type: regex\npattern: ${y(FILES_SECTION)}\nmatch: contains\ntarget: last_message\nweight: 1`),
  grader('no-edit', 'type: tool_used\ntool: Edit\ninput_match: \'.\'\nmin: 0\nmax: 0\nweight: 1'),
  ...(plugin ? [grader('route-done', `type: regex\npattern: ${y('"kind":"exit"[^\\n]*"reason":"done"')}\nmatch: contains\ntarget: { source: file, path: .ambicode/tasks/inv-${id}/ledger.jsonl }\nweight: 1`)] : []),
];

/** The bench's HEAD as a one-commit repository in the session directory (no history: a ticket's own merge request is in it), so the truth, corrected at `head`, stays valid. */
export function scaffold({ bench, head, context, policies = false, seeded = false, checksOff = false }, plugin) {
  const link = plugin
    ? `# Plugin arm only: the bench's own config and context, which are gitignored there and so absent from the archive.
mkdir -p .ambicode
# Unguarded: a silent skip surfaced as a misleading config-missing in the session dir; cp now names the bench path.
cp ${sq(path.join(bench, '.ambicode', 'config.yaml'))} .ambicode/config.yaml
[ ! -d ${sq(context)} ] || cp -R ${sq(context)} .ambicode/context
${policies ? `[ ! -d ${sq(path.join(bench, '.ambicode', 'policies'))} ] || cp -R ${sq(path.join(bench, '.ambicode', 'policies'))} .ambicode/policies\n` : ''}${checksOff ? `# No check is runnable, so the task route runs no build, test or lint (config-checks-off.mjs).\n[ ! -f .ambicode/config.yaml ] || node ${sq(path.join(REPO, 'evals', 'scripts', 'config-checks-off.mjs'))} .ambicode/config.yaml\n` : ''}${seeded ? '# The earlier route\'s note and ledger line, for /ambicode:task to pick up (task-seeds.mjs).\ncp -R "$(dirname "$0")/seed/." .ambicode/\n' : ''}printf '.ambicode/\\n' >> .git/info/exclude
# The bench's context predates the search index, so every run built it cold at map time (15 of 17 runs, ~1.4 s of session); init leaves it built at HEAD in real use. A bench with no context (k12-backend) has nothing to index.
[ ! -d .ambicode/context ] || node ${sq(path.join(REPO, 'scripts', 'ambicode.mjs'))} context index > /dev/null
`
    : '';
  return `#!/bin/sh
# The session directory becomes a fresh git repository holding \`git archive ${head}\` of the bench: the session starts in the repository root, as in real use (a repo/ subdirectory made check-citations fail on repo/-prefixed paths).
set -e
git -C ${sq(bench)} archive --format=tar ${head} | tar xf -
git init -q
git add -A
git -c user.name=eval -c user.email=eval@example.invalid commit -q -m bench
${link}`;
}

/** One map case's files for one arm, keyed below the arm's tree root. */
export function caseFiles({ id, order, ticket, truth, sources, plugin }) {
  const name = downstreamCaseName(id);
  const root = `${String(order + 1).padStart(2, '0')}-${name}`;
  const files = new Map();
  files.set(`${root}/case.yaml`, `schema_version: "1.1"\nname: ${name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
  files.set(`${root}/scaffold.sh`, scaffold({ ...sources, head: truth.bench.head }, plugin));
  files.set(`${root}/prompt.md`, [
    '---',
    `name: ${name}`,
    `description: ${y('A real ticket investigated on the real bench repository.')}`,
    `tags: ["${DOWNSTREAM_TAG}", "skill:investigate"]`,
    'runs: 3',
    `max_turns: ${LIMITS.max_turns}`,
    `timeout_seconds: ${LIMITS.timeout_seconds}`,
    `allowed_tools: [Read, Glob, Grep, Bash${plugin ? ', Skill' : ''}]`,
    '---',
    '',
    `${plugin ? `/ambicode:investigate --task inv-${id} ` : ''}${oneLine(`${REQUEST} ${ticket} ${FILES}`)}`,
    '',
  ].join('\n'));
  for (const one of graders(plugin, id)) files.set(`${root}/graders/${one.name}.md`, one.text);
  files.set(`${root}/truth.json`, `${JSON.stringify({ name, source: 'files-section', level: 'file', relevant: truth.relevant, allowed: truth.allowed, dropped: truth.dropped, bench: truth.bench }, null, 2)}\n`);
  return files;
}

/** The map case directory of `id` under `mapsDir` (`<nn>-fe-vs-<id>`). A missing one is an error: the corrected truth is the point. */
function mapCase(mapsDir, id) {
  const entry = readdirSync(mapsDir).find((one) => new RegExp(`^\\d+-fe-vs-${id}$`).test(one));
  if (entry === undefined) throw new Error(`map case for ${id} missing in ${mapsDir}: run map-cases.mjs first`);
  const dir = path.join(mapsDir, entry);
  return { truth: JSON.parse(readFileSync(path.join(dir, 'truth.json'), 'utf8')), ticket: promptOf(readFileSync(path.join(dir, 'prompt.md'), 'utf8')) };
}

/** Rewrites both downstream trees; returns one row per case. */
export function writeDownstream({ mapsDir, evalsDir = EVALS, sources, ids = DOWNSTREAM_IDS }) {
  for (const tree of ['cases', 'bare']) rmSync(path.join(evalsDir, tree, 'downstream'), { recursive: true, force: true });
  const rows = [];
  ids.forEach((id, order) => {
    const { truth, ticket } = mapCase(mapsDir, id);
    for (const plugin of [true, false]) {
      for (const [relative, text] of caseFiles({ id, order, ticket, truth, sources, plugin })) {
        const file = path.join(evalsDir, plugin ? 'cases' : 'bare', DOWNSTREAM_TAG, relative);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, text, relative.endsWith('.sh') ? { mode: 0o755 } : undefined);
      }
    }
    rows.push({ id, relevant: truth.relevant.length, allowed: truth.allowed.length, head: truth.bench.head });
  });
  return rows;
}

/** truth.json of the rendered downstream case with this name, or null. */
export function downstreamTruth(name, evalsDir = EVALS) {
  const root = path.join(evalsDir, 'cases', DOWNSTREAM_TAG);
  if (!isDownstreamCase(name) || !existsSync(root)) return null;
  for (const entry of readdirSync(root)) {
    const file = path.join(root, entry, 'truth.json');
    if (!existsSync(file)) continue;
    const truth = JSON.parse(readFileSync(file, 'utf8'));
    if (truth.name === name) return truth;
  }
  return null;
}

/** Retrieval metrics of a run from its trace: the `## Files` section of the final answer against truth.json; no truth, no metrics. */
export const downstreamMetrics = (truth, traceText) => (truth === null || traceText === undefined ? {} : scoreFiles(truth, foundPaths(finalTextOf(traceText), truth.source)));

function main(argv, env) {
  const options = { bench: env.NAV_BENCH ?? null, maps: path.join(path.dirname(EVALS), 'bench', 'map'), evals: EVALS };
  for (let at = 0; at < argv.length; at += 1) {
    const [flag, inline] = argv[at].split('=');
    const value = () => inline ?? argv[++at];
    if (flag === '--bench') options.bench = value();
    else if (flag === '--maps') options.maps = value();
    else if (flag === '--evals') options.evals = value();
    else throw new Error(`unknown argument ${argv[at]}`);
  }
  if (options.bench === null) throw new Error('--bench <repo> or env NAV_BENCH is required');
  const bench = path.resolve(options.bench);
  const context = path.resolve(env.NAV_CONTEXT ?? path.join(bench, '.ambicode', 'context'));
  const rows = writeDownstream({ mapsDir: options.maps, evalsDir: options.evals, sources: { bench, context } });
  for (const row of rows) console.log(`${downstreamCaseName(row.id)}: ${row.relevant} relevant, ${row.allowed} allowed, bench ${row.head.slice(0, 8)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2), process.env); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
