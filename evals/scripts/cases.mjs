// The suite's single source: every case, both arms. `node evals/scripts/cases.mjs` rewrites evals/cases/ (plugin arm)
// and evals/bare/ (no plugin) from it; suite.test.mjs fails when the trees drift from this file.
//
// A grader marked `shared` judges the outcome (the answer, the code, the boundary) and runs in both arms; the rest read
// what only the plugin writes (ledger, subagents, report sections). The lift a case reports is the plugin's shared score
// minus the bare one, so only shared graders are ever compared.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initCases } from './init-cases.mjs';
import { planCases } from './plan-cases.mjs';
import { investigateCases } from './investigate-cases.mjs';
import { reviewCases } from './review-cases.mjs';
import { rulesCases } from './rules-cases.mjs';
import { taskCases } from './task-cases.mjs';

const y = (value) => `'${String(value).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------- grader builders
// `file` is a literal path below the session directory: the harness resolves no globs in it.
const regex = (name, pattern, { match = 'contains', file = null, weight = 1, trace = false } = {}) => ({
  name,
  text: `---\ntype: regex\npattern: ${y(pattern)}\nmatch: ${match}\ntarget: ${trace ? 'trace' : file === null ? 'last_message' : `{ source: file, path: ${file} }`}\nweight: ${weight}\n---\n`,
});
const ledger = (name, pattern, file, options = {}) => regex(name, pattern, { file, ...options });
const tool = (name, toolName, inputMatch, { min = 1, max = null, weight = 1 } = {}) => ({
  name,
  text: `---\ntype: tool_used\ntool: ${toolName}\ninput_match: ${y(inputMatch)}\nmin: ${min}${max === null ? '' : `\nmax: ${max}`}\nweight: ${weight}\n---\n`,
});
const never = (name, toolName, inputMatch) => tool(name, toolName, inputMatch, { min: 0, max: 0 });
const exists = (name, file) => ({ name, text: `---\ntype: file_exists\npath: ${file}\nweight: 1\n---\n` });
const llm = (name, rubric, { file = null, weight = 2 } = {}) => ({
  name,
  text: `---\ntype: llm\nfocus: ${file === null ? 'last_message' : `{ source: file, path: ${file} }`}\nweight: ${weight}\n---\n\n${rubric.trim()}\n`,
});
/** Runs in both arms; `bare` replaces it in the bare arm when the plugin keeps the artefact somewhere the bare arm has none. */
const shared = (grader, bare = grader) => ({ ...grader, shared: true, bare: { ...bare, name: grader.name } });

const noEdits = [shared(never('no-edit', 'Edit', '.')), shared(never('no-write-source', 'Write', '"file_path":"[^"]*/(src|tests)/'))];

const T = (slug) => `.ambicode/tasks/${slug}/ledger.jsonl`;
const DONE = (file) => ledger('route-done', '"kind":"exit"[^\\n]*"reason":"done"', file);

const LIMITS = {
  // 40 turns: the old task cases ran 25-35 (route steps, implementer, format, report); a tighter cap failed runs for budget, not quality.
  task: { max_turns: 40, timeout_seconds: 1200, allowed_tools: ['Read', 'Glob', 'Grep', 'Bash', 'Edit', 'Write', 'Skill', 'Agent'] },
  // 30 turns, 900 s: the plan route is ground, draft, check and gate; the huge cases set their own cap (plan-cases.mjs). Edit is the route's fix round; the bare arm keeps the v3 tool set it is compared against.
  plan: { max_turns: 30, timeout_seconds: 900, allowed_tools: ['Read', 'Glob', 'Grep', 'Bash', 'Edit', 'Write', 'Skill'], bare_allowed_tools: ['Read', 'Glob', 'Grep', 'Bash', 'Write', 'Skill'] },
  review: { max_turns: 20, timeout_seconds: 900, allowed_tools: ['Read', 'Glob', 'Grep', 'Bash', 'Skill'] },
  // 30 turns: the old investigate-trace failed at 12 on a 6-file answer and needed 20; these chains are 5-7 files in 90-120-file repositories.
  investigate: { max_turns: 30, timeout_seconds: 900, allowed_tools: ['Read', 'Glob', 'Grep', 'Bash', 'Skill'] },
  rules: { max_turns: 24, timeout_seconds: 900, allowed_tools: ['Read', 'Glob', 'Grep', 'Bash', 'Write', 'Skill'] },
  // Agent: the scout-invoked grader needs it, and the harness withholds an ungranted tool from the model (cannot-pass check in claude plugin eval 2.1.303).
  init: { max_turns: 24, timeout_seconds: 900, allowed_tools: ['Read', 'Glob', 'Grep', 'Bash', 'Write', 'Skill', 'Agent'] },
};

/**
 * name: `<skill>-<behaviour>`. prompt: the plugin arm (types the skill with a fixed --task slug). bare: the same request
 * as a user would type it to Claude Code with no plugin, or null when the behaviour is the plugin's own (a gate, a
 * policy pack, init) and has no bare counterpart.
 * version: raise it whenever a prompt or grader changes; a lift is computed only between rows of the current version.
 * metrics: recall and precision of the files the answer names (metrics.mjs), or with source `changed` of the files the workspace diff holds at harvest: `relevant` must be named, `allowed` may be.
 */
/** The grader builders, for generated cases that live outside this file (init-large-case.mjs, review-cases.mjs). */
export const BUILDERS = { regex, ledger, tool, never, exists, llm, shared, noEdits, DONE };

export const CASES = [
  // ---------------------------------------------------------------- review
  // Fourteen cases on the init stacks (review-cases.mjs): same scaffold in both arms, graded per issue.
  ...reviewCases(BUILDERS),
  // ---------------------------------------------------------------- investigate
  // Ten tricky questions on the init stacks and five in depth on ts-app-medium, two of them on its ts-app-medium-deep variant (investigate-cases.mjs).
  ...investigateCases(BUILDERS),
  // ---------------------------------------------------------------- task
  // Two cases (task-cases.mjs): one after an investigation on the seedvault stack, one on the app fixture.
  ...taskCases(BUILDERS),
  // ---------------------------------------------------------------- plan
  // Ten cases on the init stacks and five on ts-app-medium (plan-cases.mjs): same request in both arms, the plan graded as text.
  ...planCases(BUILDERS),
  // ---------------------------------------------------------------- rules
  // One case tagged `rules` (rules-cases.mjs): plan policy delivery.
  ...rulesCases(BUILDERS),
  // ---------------------------------------------------------------- init
  // One case per stack (init-cases.mjs): same prompt, the fixture and its expected result differ.
  ...initCases({ regex, tool, never, exists, llm }),
];

// ---------------------------------------------------------------- rendering
// Four levels up: a case sits in <tree>/<suite>/<name>, one deeper than the flat layout it replaced.
const ROOT_FROM_CASE = '$(cd "$(dirname "$0")/../../../.." && pwd)';

// A case whose `files` hold seed/... entries starts after an earlier route: its notes and ledger are copied into the gitignored .ambicode/ (task-seeds.mjs).
const SEED_COPY = 'mkdir -p "$PWD/.ambicode"\ncp -R "$(dirname "$0")/seed/." "$PWD/.ambicode/"\n';

// The session directory itself becomes the repository, as in real use and as downstream-cases.mjs does since 551c6248: a repo/
// subdirectory made check-citations fail on `repo/`-prefixed citations (4 of 30 investigate runs, 0.6.22). materialize.mjs wants
// an empty destination, so the fixture is built beside and moved in, dotfiles (.git, .ambicode) included.
function scaffold(fixture, flags, seeded = false) {
  const materialize = `node "${ROOT_FROM_CASE}/fixtures/materialize.mjs" ${fixture}`;
  return `#!/bin/sh
# Synthetic fixture from fixtures/definitions.mjs; the case keeps no copy of it. The session directory becomes the repository.
set -e
${materialize} "$PWD/fixture"${flags === '' ? '' : ` ${flags}`}
for entry in "$PWD/fixture"/* "$PWD/fixture"/.[!.]*; do [ -e "$entry" ] && mv "$entry" "$PWD"/; done
rmdir "$PWD/fixture"
${seeded ? SEED_COPY : ''}`;
}

function promptFile(c, body, tree) {
  const limits = { ...LIMITS[c.name.split('-')[0]], ...c.limits };
  return [
    '---',
    `name: ${c.name}`,
    `description: ${y(c.description)}`,
    `tags: [${c.tags.map((tag) => `"${tag}"`).join(', ')}]`,
    'runs: 1',
    `max_turns: ${limits.max_turns}`,
    `timeout_seconds: ${limits.timeout_seconds}`,
    `allowed_tools: [${(tree === 'bare' ? limits.bare_allowed_tools ?? limits.allowed_tools : limits.allowed_tools).join(', ')}]`,
    '---',
    '',
    body,
    '',
  ].join('\n');
}

/** Every file of both trees, keyed by its path below evals/. */
export function render(cases = CASES) {
  const files = new Map();
  for (const c of cases) {
    const arms = [['cases', c.prompt, c.flags, c.graders]];
    // The bare arm gets no config: the fixture as a user without the plugin would have it, unless the case sets `bareFlags` (review cases hold both arms to the same scaffold).
    if (c.bare !== null) arms.push(['bare', c.bare, c.bareFlags ?? c.flags.replace('--ambicode-init', '').replace('--context', '').replace('--stack-packs', '').replace('--policy', '').replace(/\s+/g, ' ').trim(), c.graders.filter((g) => g.shared).map((g) => g.bare)]);
    for (const [tree, body, flags, graders] of arms) {
      const dir = caseDir(tree, c.name);
      files.set(`${dir}/case.yaml`, `schema_version: "1.1"\nname: ${c.name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
      files.set(`${dir}/scaffold.sh`, scaffold(c.fixture, flags, tree === 'cases' && Object.keys(c.files ?? {}).some((name) => name.startsWith('seed/'))));
      files.set(`${dir}/prompt.md`, promptFile(c, body, tree));
      for (const grader of graders) files.set(`${dir}/graders/${grader.name}.md`, grader.text);
      if (tree === 'cases') for (const [name, text] of Object.entries(c.files ?? {})) files.set(`${dir}/${name}`, text);
    }
  }
  return files;
}

/** A case lives in <tree>/<suite>/<name>; the suite is the name's first word (rules, review, init). */
export const suiteOf = (name) => name.split('-')[0];
export const caseDir = (tree, name) => `${tree}/${suiteOf(name)}/${name}`;
export const caseOf = (name) => CASES.find((c) => c.name === name) ?? null;
export const EVALS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `--case <glob>` rewrites only the matching cases and leaves every other directory alone. */
function write(argv = []) {
  const at = argv.indexOf('--case');
  const glob = at >= 0 ? argv[at + 1] : null;
  const pattern = glob === null ? null : new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  const selected = pattern === null ? CASES : CASES.filter((c) => pattern.test(c.name));
  if (pattern !== null && selected.length === 0) throw new Error(`no case matches ${glob}`);
  for (const tree of ['cases', 'bare']) {
    const dir = path.join(EVALS, tree);
    mkdirSync(dir, { recursive: true });
    for (const suite of readdirSync(dir)) {
      // Rendered by their own generators and gitignored: a full regeneration must not delete them.
      if (['results', 'init-large', 'downstream', 'task-real'].includes(suite)) continue;
      if (pattern === null) rmSync(path.join(dir, suite), { recursive: true, force: true });
      else if (selected.some((c) => suiteOf(c.name) === suite)) {
        for (const name of readdirSync(path.join(dir, suite))) if (pattern.test(name)) rmSync(path.join(dir, suite, name), { recursive: true, force: true });
        if (readdirSync(path.join(dir, suite)).length === 0) rmSync(path.join(dir, suite), { recursive: true, force: true });
      }
    }
  }
  const files = render(selected);
  for (const [relative, text] of files) {
    const file = path.join(EVALS, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text, relative.endsWith('.sh') ? { mode: 0o755 } : undefined);
  }
  console.log(`${selected.length} cases, ${selected.filter((c) => c.bare !== null).length} with a bare arm, ${files.size} files`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) write(process.argv.slice(2));
