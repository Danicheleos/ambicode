// Benchmark case selection and byte-stable prompt, scaffold, and grader generation.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BENCHMARKS, CASES_DIRECTORY, casePrefix, projectCodeDir } from '../shared/bench-paths.mjs';
import { CASES_LOCK, withCasesLock } from '../harness/cases-lock.mjs';
import { GENERATION_MARKER, INVESTIGATE_COMMAND, PROMPT, REVIEW_COMMAND, SWAP_MARKER, writePluginPrompt } from '../harness/prompt-transport.mjs';

// All measurable from the data alone. 2..10 true files: one is named by luck, past ten the change was a
// sweep. 300 ticket characters: shorter ones test guessing. 600 changed lines keeps a review inside the
// 900 s case timeout. 5 localize + 4 review per side is about the archived suite's size per arm.
export const SELECT = { minTruth: 2, maxTruth: 10, minTicketChars: 300, maxChangedLines: 600, localize: 5, review: 4 };

const PROMPT_HEADING = '## build:context prompt';
const TRUTH_HEADING = '## TRUE RELATED CODE';

// Some ground-truth lists carry a tool's console status lines as list items; they are not paths.
const NOT_A_PATH = /^(Exit code:|Wall time:|Output:)/;

const SNAPSHOT_DATE = '2026-01-01T00:00:00Z';

export function parseTicket(markdown) {
  const lines = markdown.split('\n');
  const at = (heading) => lines.map((line, i) => (line.trimEnd() === heading ? i : -1)).filter((i) => i >= 0);
  const prompt = at(PROMPT_HEADING);
  const truth = at(TRUTH_HEADING);
  if (prompt.length !== 1 || truth.length !== 1 || prompt[0] > truth[0]) {
    return { error: `expected one "${PROMPT_HEADING}" before one "${TRUTH_HEADING}"` };
  }
  const text = lines.slice(prompt[0] + 1, truth[0]).join('\n').trim();
  const paths = [];
  for (const line of lines.slice(truth[0] + 1)) {
    const item = /^\s*[-*]\s+`?([^`]+?)`?\s*$/.exec(line)?.[1];
    if (item && !NOT_A_PATH.test(item) && !paths.includes(item)) paths.push(item);
  }
  if (!text) return { error: 'the ticket text is empty' };
  return { text, truth: paths };
}

// The checkout is a working tree: installed packages and git metadata are never ground truth.
const SKIPPED = new Set(['.DS_Store', '.git', 'node_modules']);

function listFiles(directory, prefix = '') {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(directory, entry.name), relative));
    else out.push(relative);
  }
  return out;
}

/**
 * The first path segment most truth paths share, when the rest of such a path exists in the
 * snapshot. The snapshot is placed there, so the truth's paths stay the repository's paths.
 */
export function codeRoot(truthLists, checkoutFiles) {
  const present = new Set(checkoutFiles);
  const votes = new Map();
  for (const paths of truthLists)
    for (const p of paths) {
      const slash = p.indexOf('/');
      if (slash > 0 && present.has(p)) votes.set(p.slice(0, slash), (votes.get(p.slice(0, slash)) ?? 0) + 1);
    }
  const [best] = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  if (!best) throw new Error('no ground-truth path resolves into the checkout under any leading directory');
  return best[0];
}

/**
 * The fraction of true files whose name (basename, last extension dropped) the ticket never mentions:
 * 1 means every file must be found from the code's behaviour, 0 that grep over the ticket reaches all.
 */
export function localizeHardness(text, truth) {
  if (truth.length === 0) return 0;
  const haystack = text.toLowerCase();
  const stem = (p) => path.posix.basename(p).replace(/\.[^.]+$/, '').toLowerCase();
  return truth.filter((p) => !haystack.includes(stem(p))).length / truth.length;
}

export function changedLines(patch) {
  return patch.split('\n').filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line)).length;
}

/** Per thread: 1 for existing, +1 resolved, +1 the author replied, +1 a body of 120+ characters. */
export function reviewSubstance(threads) {
  return threads.reduce(
    (sum, t) => sum + 1 + (t.resolved ? 1 : 0) + ((t.replies ?? []).some((r) => r.byAuthor) ? 1 : 0) + ((t.body?.length ?? 0) >= 120 ? 1 : 0),
    0,
  );
}

const yamlString = (value) => JSON.stringify(value);
export const regexEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function casePrompt({ name, side, kind, description, walk = false }, body) {
  return `---
name: ${name}
description: ${description}
tags: ["bench", "${kind}", ${yamlString(casePrefix(side))}${walk ? ', "walk"' : ''}]
runs: 1
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

${body}`;
}

function promptFile(name, side, text, { walk = false } = {}) {
  return casePrompt({ name, side, kind: 'localize', description: "Localize the files a real ticket's change touches, in a real codebase.", walk }, `In the repository at \`repo/\`, the ticket below is about to be implemented.

<ticket>
${text}
</ticket>

Which files would that change have to touch? End your answer with a
\`## Files\` section that lists each file by its path relative to \`repo/\`,
one per line as a bullet, with a few words on what it contributes. List only
files that already exist; leave out files the change would create.

\`repo/\` is the repository under investigation. Change into it with \`cd repo\`
before running anything, and run every command from there.

Answer the question; do not edit anything.
`);
}

export function scaffoldFile(sideRel, root) {
  return `#!/bin/sh
# Generated by evals-bench.mjs; regenerate rather than edit.
#
# Copies the benchmark checkout's ${root}/ to repo/${root}/ (where the ground truth's
# paths put it) with the team's configuration, and commits it, so both arms
# start from the same clean tree. Only config.yaml is copied from .ambicode/:
# task notes and saved reviews there are earlier sessions' conclusions about
# this code, and could hand an arm the answer.
set -e
SIDE="$(cd "$(dirname "$0")/${sideRel}" && pwd)"
REPO="$PWD/repo"
mkdir -p "$REPO/.ambicode"
cp -R "$SIDE/${root}" "$REPO/${root}"
cp "$SIDE/.ambicode/config.yaml" "$REPO/.ambicode/config.yaml"
find "$REPO" -name .DS_Store -delete
git -C "$REPO" init -q
git -C "$REPO" add -A
GIT_AUTHOR_DATE=${SNAPSHOT_DATE} GIT_COMMITTER_DATE=${SNAPSHOT_DATE} \\
  git -C "$REPO" -c user.name="AMBICODE Benchmark" -c user.email=benchmark@example.invalid \\
  commit -qm "benchmark snapshot"
`;
}

export function graderFiles(truth, root) {
  const list = truth.map((p) => `- \`${p}\``).join('\n');
  // The investigate skill writes its note under .ambicode/task/; only a write into the code is an edit.
  const code = `"file_path":"[^"]*/repo/${regexEscape(root)}/`;
  const files = {
    'names-a-true-file.md': `---
type: llm
focus: last_message
weight: 3
arm: both
---

The question asked which existing files a ticket's change would have to touch.
The change that was actually merged touched these files:

${list}

PASS if the final response presents at least one of those files as a file the
change would touch. A path written relative to \`repo/\`, with or without a
leading \`./\`, counts as the same file.
FAIL if it names none of them as part of the change.
`,
  };
  for (const tool of ['Edit', 'Write']) files[`no-code-${tool.toLowerCase()}.md`] = `---
type: tool_used
tool: ${tool}
input_match: '${code}'
min: 0
max: 0
weight: 1
arm: both
---

Investigation is read-only: no ${tool} call on a file under the code.
`;
  // No Skill or helper indicator: investigate is user-invoked and its route starts from the prompt hook, so a
  // Skill call or a `prepare`/`locate` run never happens in a routed run and would read as a miss.
  return files;
}

/**
 * The curated suite's `denyRead` does not cover `evals/benchmarks/`, and the run's own repository is copied to
 * `repo/`, so any tool input reaching a `evals/benchmarks/` path is a peek. Glob too: the truth IS file names.
 */
export function peekGraders() {
  const files = {};
  for (const tool of ['Read', 'Grep', 'Glob', 'Bash']) {
    files[`no-peek-${tool.toLowerCase()}.md`] = `---
type: tool_used
tool: ${tool}
input_match: 'benchmarks/'
min: 0
max: 0
weight: 1
arm: both
---

The benchmark data (tickets, ground truth, snapshots) sits outside the run at
a path containing \`benchmarks/\`. The run's repository is \`repo/\`; no ${tool}
call may reach into the data directory.
`;
  }
  return files;
}

/**
 * Forced twins (a review prompt naming the skill) were removed with the typed plugin-arm prompt: the plugin arm
 * now types the command itself (`prompt.with.md`), and the naked arm keeps the neutral prompt.
 */
const LEGACY_FORCED_SUFFIX = '-forced';

/** A case directory left by the generator before the twins were removed; serving it would measure a twin. */
export function refuseLegacyTwins(casesDir) {
  const twins = readdirSync(casesDir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.endsWith(LEGACY_FORCED_SUFFIX)).length;
  if (twins) throw new Error(`${casesDir} still holds ${twins} forced twin case(s) from an older generator: rerun \`select\``);
}

function reviewPromptFile(name, side, text, { walk = false } = {}) {
  return casePrompt({ name, side, kind: 'review', description: "Review a real merged change, as it stood when a human reviewed it.", walk }, `In the repository at \`repo/\`, there is an uncommitted change. It implements
the ticket below.

<ticket>
${text}
</ticket>

Review the change before it merges: report the problems a reviewer should
raise, each with its file and line.

\`repo/\` is the repository under review. Change into it with \`cd repo\` before
running anything, and run every command from there.

Do not edit anything.
`);
}

function reviewScaffoldFile(sideRel, root, versionPath) {
  return `#!/bin/sh
# Generated by evals-bench.mjs; regenerate rather than edit.
#
# The snapshot, with every file the change touches put back as it was at the
# change's base, committed; then the change as the human reviewer saw it,
# applied and left uncommitted. The touched files are exact; the rest of the
# tree is the snapshot, which is newer than the change.
set -e
SIDE="$(cd "$(dirname "$0")/${sideRel}" && pwd)"
VERSION="$SIDE/${versionPath}"
REPO="$PWD/repo"
mkdir -p "$REPO/.ambicode"
cp -R "$SIDE/${root}" "$REPO/${root}"
cp "$SIDE/.ambicode/config.yaml" "$REPO/.ambicode/config.yaml"
cp -R "$VERSION/base/." "$REPO/"
while IFS= read -r file; do [ -n "$file" ] && rm -rf "$REPO/$file"; done < "$VERSION/absent.txt"
find "$REPO" -name .DS_Store -delete
git -C "$REPO" init -q
git -C "$REPO" add -A
GIT_AUTHOR_DATE=${SNAPSHOT_DATE} GIT_COMMITTER_DATE=${SNAPSHOT_DATE} \\
  git -C "$REPO" -c user.name="AMBICODE Benchmark" -c user.email=benchmark@example.invalid \\
  commit -qm "benchmark snapshot at the change's base"
git -C "$REPO" apply --binary "$VERSION/change.patch"
`;
}

function reviewGraderFiles(threads) {
  const files = {};
  threads.forEach((thread, i) => {
    const where = thread.newLine ?? thread.oldLine;
    const quoted = thread.body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    files[`raises-${String(i + 1).padStart(2, '0')}.md`] = `---
type: llm
focus: last_message
weight: 1
arm: both
---

A human reviewer left this comment on \`${thread.path}${where ? `:${where}` : ''}\` of
this change:

${quoted}

PASS if the final response raises the same concern: the same problem, about
the same code, in any words. A different problem at the same place does not
count.
FAIL if it does not raise it.
`;
  });
  files['plugin-fired.md'] = `---
type: tool_used
tool: Skill
input_match: '"ambicode:review"'
arm: with-only
---

The review skill was invoked. Routing only.
`;
  files['helper-ran.md'] = `---
type: tool_used
tool: Bash
input_match: 'ambicode(\\.mjs\\\\")? review'
arm: with-only
---

The agent ran \`ambicode review\`. It proves the call was attempted, not that
the independent reviewer answered: inside the eval sandbox no nested reviewer
signs in (evals/cases/common/archived/typescript/README.md).
`;
  return files;
}

function reviewVersions(base) {
  const reviews = path.join(base, 'reviews');
  if (!existsSync(reviews)) return [];
  const out = [];
  for (const ticket of readdirSync(reviews, { withFileTypes: true }).filter((e) => e.isDirectory()))
    for (const version of readdirSync(path.join(reviews, ticket.name), { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const dir = path.join(reviews, ticket.name, version.name);
      if (!existsSync(path.join(dir, 'threads.json'))) continue;
      out.push({ ticket: ticket.name, version: version.name, dir, relative: path.posix.join('..', 'reviews', ticket.name, version.name) });
    }
  return out.sort((a, b) => (a.ticket + a.version).localeCompare(b.ticket + b.version));
}

function writeCase(out, plan) {
  const directory = path.join(out, plan.name);
  mkdirSync(path.join(directory, 'graders'), { recursive: true });
  writeFileSync(path.join(directory, 'case.yaml'), `schema_version: "1.1"\nname: ${plan.name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
  const graders = plan.kind === 'localize' ? graderFiles(plan.truth, plan.root) : reviewGraderFiles(plan.threads);
  for (const [file, body] of Object.entries({ ...graders, ...peekGraders() })) writeFileSync(path.join(directory, 'graders', file), body);
  if (plan.kind === 'localize') {
    writeFileSync(path.join(directory, PROMPT), promptFile(plan.name, plan.side, plan.text, { walk: plan.walk }));
    writePluginPrompt(directory, INVESTIGATE_COMMAND);
    writeFileSync(path.join(directory, 'scaffold.sh'), scaffoldFile(plan.sideRel, plan.root), { mode: 0o755 });
    writeFileSync(
      path.join(directory, 'truth.json'),
      JSON.stringify({ kind: 'localize', side: plan.side, ticket: plan.ticket, root: plan.root, truth: plan.truth, missingFromSnapshot: plan.missingFromSnapshot }, null, 2),
    );
    return { kind: 'localize', name: plan.name, side: plan.side, truth: plan.truth.length, missing: plan.missingFromSnapshot.length };
  }
  writeFileSync(path.join(directory, PROMPT), reviewPromptFile(plan.name, plan.side, plan.text, { walk: plan.walk }));
  writePluginPrompt(directory, REVIEW_COMMAND);
  writeFileSync(path.join(directory, 'scaffold.sh'), reviewScaffoldFile(plan.sideRel, plan.root, plan.versionRel), { mode: 0o755 });
  writeFileSync(
    path.join(directory, 'truth.json'),
    JSON.stringify({ kind: 'review', side: plan.side, ticket: plan.ticket, version: plan.version, root: plan.root, threads: plan.threads.length }, null, 2),
  );
  return { kind: 'review', name: plan.name, side: plan.side, threads: plan.threads.length };
}

function selectPlans(plans, pick) {
  const chosen = [];
  const sides = {};
  for (const side of [...new Set(plans.map((p) => p.side))].sort()) {
    const localize = plans
      .filter((p) => p.side === side && p.kind === 'localize')
      .map((p) => ({
        plan: p,
        hardness: localizeHardness(p.text, p.truth),
        eligible: p.missingFromSnapshot.length === 0 && p.truth.length >= SELECT.minTruth && p.truth.length <= SELECT.maxTruth && p.text.length >= SELECT.minTicketChars,
      }));
    const pickedLocalize = localize
      .filter((c) => c.eligible)
      .sort((a, b) => b.hardness - a.hardness || b.plan.truth.length - a.plan.truth.length || b.plan.text.length - a.plan.text.length || a.plan.name.localeCompare(b.plan.name))
      .slice(0, pick.localize);
    const review = plans
      .filter((p) => p.side === side && p.kind === 'review')
      .map((p) => ({ plan: p, substance: reviewSubstance(p.threads), changed: changedLines(readFileSync(path.join(p.dir, 'change.patch'), 'utf8')) }))
      .map((c) => ({ ...c, eligible: c.changed <= SELECT.maxChangedLines }));
    const pickedReview = review
      .filter((c) => c.eligible)
      .sort((a, b) => b.substance - a.substance || b.plan.threads.length - a.plan.threads.length || a.plan.name.localeCompare(b.plan.name))
      .slice(0, pick.review);
    // The top pick of each kind per side is the walkthrough set: few enough runs to read every trace.
    chosen.push(...[pickedLocalize, pickedReview].flatMap((picked) => picked.map((c, i) => ({ ...c.plan, walk: i === 0 }))));
    sides[side] = {
      localize: {
        eligible: localize.filter((c) => c.eligible).length,
        of: localize.length,
        chosen: pickedLocalize.map((c) => ({ name: c.plan.name, hardness: c.hardness, truth: c.plan.truth.length, ticketChars: c.plan.text.length })),
      },
      review: {
        eligible: review.filter((c) => c.eligible).length,
        of: review.length,
        chosen: pickedReview.map((c) => ({ name: c.plan.name, substance: c.substance, threads: c.plan.threads.length, changedLines: c.changed })),
      },
    };
  }
  return { chosen, selection: { criteria: { ...SELECT, localize: pick.localize, review: pick.review }, sides } };
}

/**
 * Replaces everything in `out` but its lock, holding the lock. An outstanding swap or an interrupted generation
 * is refused unless `regenerate` says to recreate the cases anyway; a run still using them is always refused.
 */
export function generate({ benchmarks = BENCHMARKS, out, pick = null, regenerate = false, projects } = {}) {
  projects ??= readdirSync(benchmarks, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(benchmarks, e.name, 'assets')))
    .map((e) => e.name)
    .sort();
  if (projects.length === 0) throw new Error(`no <project>/assets/ under ${benchmarks}`);
  // The full set lives with each project's data; a curated selection takes from every project into one directory.
  if (out === undefined) {
    const each = projects.map((project) => generate({ benchmarks, out: path.join(benchmarks, project, CASES_DIRECTORY), pick, regenerate, projects: [project] }));
    return { out: each.map((r) => r.out).join(', '), written: each.flatMap((r) => r.written), refused: each.flatMap((r) => r.refused), selection: null };
  }
  mkdirSync(out, { recursive: true });
  return withCasesLock(out, 'generate', () => generateLocked({ benchmarks, out, pick, regenerate, sides: projects }));
}

function generateLocked({ benchmarks, out, pick, regenerate, sides }) {
  const pending = [SWAP_MARKER, GENERATION_MARKER].filter((marker) => existsSync(path.join(out, marker)));
  if (pending.length && !regenerate)
    throw new Error(`${out} has ${pending.join(' and ')}: a plugin-prompt swap or an interrupted generation is outstanding; \`restore-prompts\` puts a swap back, \`--regenerate\` recreates the cases`);
  const refused = [];
  const plans = [];
  writeFileSync(path.join(out, GENERATION_MARKER), '');
  for (const entry of readdirSync(out)) if (entry !== CASES_LOCK && entry !== GENERATION_MARKER) rmSync(path.join(out, entry), { recursive: true, force: true });
  for (const side of sides) {
    const base = path.join(benchmarks, side);
    const code = projectCodeDir(benchmarks, side);
    if (!existsSync(path.join(code, '.ambicode', 'config.yaml'))) throw new Error(`${side}: project/.ambicode/config.yaml is missing`);
    const sideRel = path.relative(path.join(out, 'case'), code).split(path.sep).join('/');
    const snapshot = listFiles(code);
    const tickets = readdirSync(path.join(base, 'assets'))
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => ({ id: path.basename(f, '.md'), ...parseTicket(readFileSync(path.join(base, 'assets', f), 'utf8')) }));
    const root = codeRoot(tickets.filter((t) => !t.error).map((t) => t.truth), snapshot);
    const present = new Set(snapshot);
    for (const ticket of tickets) {
      const name = `${casePrefix(side)}-${ticket.id}`.toLowerCase();
      if (ticket.error) {
        refused.push({ name, reason: ticket.error });
        continue;
      }
      const truth = ticket.truth.filter((p) => present.has(p));
      if (truth.length === 0) {
        refused.push({ name, reason: `none of its ${ticket.truth.length} true file(s) exists in the snapshot` });
        continue;
      }
      plans.push({ kind: 'localize', name, side, sideRel, root, ticket: ticket.id, text: ticket.text, truth, missingFromSnapshot: ticket.truth.filter((p) => !present.has(p)) });
    }
    const texts = new Map(tickets.filter((t) => !t.error).map((t) => [t.id, t.text]));
    for (const v of reviewVersions(base)) {
      const name = `${casePrefix(side)}-${v.ticket}-review-${v.version}`.toLowerCase();
      const threads = JSON.parse(readFileSync(path.join(v.dir, 'threads.json'), 'utf8'));
      if (!texts.has(v.ticket)) {
        refused.push({ name, reason: 'its ticket has no usable text' });
        continue;
      }
      if (threads.length === 0) {
        refused.push({ name, reason: 'no reviewer thread' });
        continue;
      }
      const missing = ['change.patch', 'absent.txt', 'base'].find((required) => !existsSync(path.join(v.dir, required)));
      if (missing) {
        refused.push({ name, reason: `${missing} is missing from the prepared version` });
        continue;
      }
      plans.push({ kind: 'review', name, side, sideRel, root, ticket: v.ticket, version: v.version, versionRel: v.relative, dir: v.dir, text: texts.get(v.ticket), threads });
    }
  }
  let chosen = plans;
  let selection = null;
  if (pick) ({ chosen, selection } = selectPlans(plans, pick));
  const written = chosen.map((plan) => writeCase(out, plan));
  if (selection) writeFileSync(path.join(out, 'selection.json'), JSON.stringify(selection, null, 2));
  rmSync(path.join(out, GENERATION_MARKER));
  return { out, written, refused, selection };
}
