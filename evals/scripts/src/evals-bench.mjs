// Cases from `benchmarks/` (under NDA and gitignored: this file carries no word of it), graded by the
// files the merged change touched. The data sits under the sandbox's `denyRead` only with
// `--eval-dir benchmarks`, so curated cases carry `no-peek-*` graders. Commands: generate, select, run, score.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const BENCHMARKS = path.join(ROOT, 'benchmarks');
export const CASES_DIRECTORY = 'cases';
export const BENCH_EVAL_DIR = 'benchmarks';
/** Never the bare `evals/`: discovery is recursive, so that would sweep every suite at once. */
export const CURATED_EVAL_DIR = 'evals/evals-core';
export const CURATED_CASES = path.join(ROOT, CURATED_EVAL_DIR, CASES_DIRECTORY);

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

function listFiles(directory, prefix = '') {
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
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
export function codeRoot(truthLists, snapshotFiles) {
  const present = new Set(snapshotFiles);
  const votes = new Map();
  for (const paths of truthLists)
    for (const p of paths) {
      const slash = p.indexOf('/');
      if (slash > 0 && present.has(p.slice(slash + 1))) votes.set(p.slice(0, slash), (votes.get(p.slice(0, slash)) ?? 0) + 1);
    }
  const [best] = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  if (!best) throw new Error('no ground-truth path resolves into the snapshot under any leading directory');
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
const regexEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function promptFile(name, side, text, { walk = false } = {}) {
  return `---
name: ${name}
description: Localize the files a real ticket's change touches, in a real codebase.
tags: ["bench", "localize", ${yamlString(side.toLowerCase())}${walk ? ', "walk"' : ''}]
runs: 1
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at \`repo/\`, the ticket below is about to be implemented.

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
`;
}

function scaffoldFile(sideRel, root) {
  return `#!/bin/sh
# Generated by evals-bench.mjs; regenerate rather than edit.
#
# Copies the benchmark snapshot to repo/${root}/ (where the ground truth's
# paths put it) with the team's configuration, and commits it, so both arms
# start from the same clean tree. Only config.yaml is copied from .ambicode/:
# task notes and saved reviews there are earlier sessions' conclusions about
# this code, and could hand an arm the answer.
set -e
SIDE="$(cd "$(dirname "$0")/${sideRel}" && pwd)"
REPO="$PWD/repo"
mkdir -p "$REPO/.ambicode"
cp -R "$SIDE/src" "$REPO/${root}"
cp "$SIDE/.ambicode/config.yaml" "$REPO/.ambicode/config.yaml"
find "$REPO" -name .DS_Store -delete
git -C "$REPO" init -q
git -C "$REPO" add -A
GIT_AUTHOR_DATE=${SNAPSHOT_DATE} GIT_COMMITTER_DATE=${SNAPSHOT_DATE} \\
  git -C "$REPO" -c user.name="AMBICODE Benchmark" -c user.email=benchmark@example.invalid \\
  commit -qm "benchmark snapshot"
`;
}

function graderFiles(truth, root) {
  const list = truth.map((p) => `- \`${p}\``).join('\n');
  // The investigate skill writes its note under .ambicode/task/; only a write into the code is an edit.
  const code = `"file_path":"[^"]*/repo/${regexEscape(root)}/`;
  return {
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
    'no-code-edit.md': `---
type: tool_used
tool: Edit
input_match: '${code}'
min: 0
max: 0
weight: 1
arm: both
---

Investigation is read-only: no Edit call on a file under the code.
`,
    'no-code-write.md': `---
type: tool_used
tool: Write
input_match: '${code}'
min: 0
max: 0
weight: 1
arm: both
---

Investigation is read-only: no Write call on a file under the code.
`,
    'plugin-fired.md': `---
type: tool_used
tool: Skill
input_match: '"ambicode:'
arm: with-only
---

An AMBICODE skill was invoked. Routing only.
`,
    'helper-ran.md': `---
type: tool_used
tool: Bash
input_match: 'ambicode(\\.mjs\\\\")? (prepare|locate)'
arm: with-only
---

The agent ran the helper that produces the boundary shortlist. It proves the
call was attempted, not that its output was used.
`,
  };
}

/**
 * The curated suite's `denyRead` does not cover `benchmarks/`, and the run's own repository is copied to
 * `repo/`, so any tool input reaching a `benchmarks/` path is a peek. Glob too: the truth IS file names.
 */
function peekGraders() {
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
 * The neutral prompt measures whether the plugin is picked and whether it helps; the forced one names the
 * skill, so it measures only whether it helps once picked. Sonnet 5.5 picked it 0/32 times unforced
 * (2026-09-29), so a forced-only suite would report help the user never gets.
 */
function reviewPromptFile(name, side, text, { forced = false, walk = false } = {}) {
  const ask = forced ? 'Use the ambicode review skill to review' : 'Review';
  return `---
name: ${name}
description: Review a real merged change, as it stood when a human reviewed it.
tags: ["bench", "review", ${yamlString(side.toLowerCase())}${walk ? ', "walk"' : ''}${forced ? ', "forced"' : ''}]
runs: 1
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

In the repository at \`repo/\`, there is an uncommitted change. It implements
the ticket below.

<ticket>
${text}
</ticket>

${ask} the change before it merges: report the problems a reviewer should
raise, each with its file and line.

\`repo/\` is the repository under review. Change into it with \`cd repo\` before
running anything, and run every command from there.

Do not edit anything.
`;
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
cp -R "$SIDE/src" "$REPO/${root}"
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
signs in (evals/evals-archived/typescript/README.md).
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
      out.push({ ticket: ticket.name, version: version.name, dir, relative: path.posix.join('reviews', ticket.name, version.name) });
    }
  return out.sort((a, b) => (a.ticket + a.version).localeCompare(b.ticket + b.version));
}

function writeCase(out, plan, { forced = false } = {}) {
  const directory = path.join(out, plan.name);
  mkdirSync(path.join(directory, 'graders'), { recursive: true });
  writeFileSync(path.join(directory, 'case.yaml'), `schema_version: "1.1"\nname: ${plan.name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
  const graders = plan.kind === 'localize' ? graderFiles(plan.truth, plan.root) : reviewGraderFiles(plan.threads);
  for (const [file, body] of Object.entries({ ...graders, ...peekGraders() })) writeFileSync(path.join(directory, 'graders', file), body);
  if (plan.kind === 'localize') {
    writeFileSync(path.join(directory, 'prompt.md'), promptFile(plan.name, plan.side, plan.text, { walk: plan.walk }));
    writeFileSync(path.join(directory, 'scaffold.sh'), scaffoldFile(plan.sideRel, plan.root), { mode: 0o755 });
    writeFileSync(
      path.join(directory, 'truth.json'),
      JSON.stringify({ kind: 'localize', side: plan.side, ticket: plan.ticket, root: plan.root, truth: plan.truth, missingFromSnapshot: plan.missingFromSnapshot }, null, 2),
    );
    return { kind: 'localize', name: plan.name, side: plan.side, truth: plan.truth.length, missing: plan.missingFromSnapshot.length };
  }
  writeFileSync(path.join(directory, 'prompt.md'), reviewPromptFile(plan.name, plan.side, plan.text, { forced, walk: plan.walk }));
  writeFileSync(path.join(directory, 'scaffold.sh'), reviewScaffoldFile(plan.sideRel, plan.root, plan.versionRel), { mode: 0o755 });
  writeFileSync(
    path.join(directory, 'truth.json'),
    JSON.stringify({ kind: 'review', ...(forced ? { variant: 'forced' } : {}), side: plan.side, ticket: plan.ticket, version: plan.version, root: plan.root, threads: plan.threads.length }, null, 2),
  );
  return { kind: forced ? 'review-forced' : 'review', name: plan.name, side: plan.side, threads: plan.threads.length };
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

export function generate({ benchmarks = BENCHMARKS, out = path.join(benchmarks, CASES_DIRECTORY), pick = null, forced = false } = {}) {
  rmSync(out, { recursive: true, force: true });
  const refused = [];
  const plans = [];
  const sides = readdirSync(benchmarks, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(benchmarks, e.name, 'assets')))
    .map((e) => e.name)
    .sort();
  if (sides.length === 0) throw new Error(`no <side>/assets/ under ${benchmarks}`);
  for (const side of sides) {
    const base = path.join(benchmarks, side);
    for (const required of ['src', path.join('.ambicode', 'config.yaml')])
      if (!existsSync(path.join(base, required))) throw new Error(`${side}: ${required} is missing`);
    const sideRel = path.relative(path.join(out, 'case'), base).split(path.sep).join('/');
    const snapshot = listFiles(path.join(base, 'src'));
    const tickets = readdirSync(path.join(base, 'assets'))
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => ({ id: path.basename(f, '.md'), ...parseTicket(readFileSync(path.join(base, 'assets', f), 'utf8')) }));
    const root = codeRoot(tickets.filter((t) => !t.error).map((t) => t.truth), snapshot);
    const present = new Set(snapshot.map((f) => `${root}/${f}`));
    for (const ticket of tickets) {
      const name = `${side}-${ticket.id}`.toLowerCase();
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
      const name = `${side}-${v.ticket}-review-${v.version}`.toLowerCase();
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
  if (forced)
    for (const plan of chosen.filter((p) => p.kind === 'review')) written.push(writeCase(out, { ...plan, name: `${plan.name}-forced` }, { forced: true }));
  if (selection) writeFileSync(path.join(out, 'selection.json'), JSON.stringify(selection, null, 2));
  return { out, written, refused, selection };
}

function fileSection(message) {
  const lines = message.split('\n');
  let start = -1;
  let level = 0;
  lines.forEach((line, i) => {
    const heading = /^(#{1,6})\s*\**\s*files\b/i.exec(line);
    if (heading) {
      start = i;
      level = heading[1].length;
    }
  });
  if (start < 0) return { text: message, sectioned: false };
  const end = lines.findIndex((line, i) => i > start && new RegExp(`^#{1,${level}}\\s`).test(line));
  return { text: lines.slice(start + 1, end < 0 ? undefined : end).join('\n'), sectioned: true };
}

/**
 * `./`, `repo/` and absolute prefixes are dropped, and a path missing only the code root
 * (`controllers/x.ts` for `src/controllers/x.ts`) matches when exactly one true path ends that way.
 */
export function namedFiles(message, truth, root) {
  const { text, sectioned } = fileSection(message);
  const named = new Set();
  for (const match of text.matchAll(/(?:^|[\s`'"(\[*|])(\/?(?:[\w@.+-]+\/)+[\w@.+-]+\.[A-Za-z0-9]+)/g)) {
    let p = match[1].replace(/^(?:.*\/)?repo\//, '').replace(/^\.\//, '');
    if (!truth.includes(p) && !p.startsWith(`${root}/`)) {
      const candidates = truth.filter((t) => t === `${root}/${p}`);
      if (candidates.length === 1) p = candidates[0];
    }
    named.add(p);
  }
  return { named: [...named], sectioned };
}

export function scoreAnswer(message, truth, root) {
  const { named, sectioned } = namedFiles(message, truth, root);
  const correct = named.filter((p) => truth.includes(p)).length;
  const precision = named.length ? correct / named.length : 0;
  const recall = correct / truth.length;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { named: named.length, correct, truth: truth.length, precision, recall, f1, hit: correct > 0 ? 1 : 0, sectioned };
}

const EVIDENCE_GRADER = 'names-a-true-file';

// Printed by `ambicode review` when EVAL_AMBICODE_REVIEWER_REPLAY stood in for the reviewer: that
// reviewer's cost and time are then absent from the arm, which reads cheaper than the product is.
const REPLAY_MARK = 'REPLAYED from a recording';
const READ_COMMANDS = new Set(['cat', 'sed', 'head', 'tail', 'grep', 'rg', 'find', 'ls', 'awk', 'wc', 'nl', 'less', 'tree']);
const firstWords = (command) =>
  command
    .split(/&&|\|\||;|\||\n/)
    .map((segment) => segment.trim().split(/\s+/)[0])
    .filter(Boolean);

// The CLI's refusal (`error [code]:`, exit 2) and a review that ran but whose reviewer failed
// (`(error: code:` in the header). The second read as "none found" on 2026-09-30: no sandbox login.
const HELPER_FAILURE = [/^error \[([a-z0-9-]+)\]:/m, /\(error: ([a-z0-9-]+):/];

/** What one of the agent's tool calls was. The counts and the walkthrough both read it, so they cannot disagree. */
function classifyCall(block) {
  const call = { block, helper: null, truncated: false, bashRead: false, failure: null };
  if (block.name !== 'Bash' || typeof block.input?.command !== 'string') return call;
  const command = block.input.command;
  const helper = /ambicode\.mjs\\?"?\s+(\w+)/.exec(command)?.[1];
  if (helper === 'prepare' || helper === 'locate') {
    call.helper = 'prepare';
    // 28 of 31 Opus calls on 2026-09-29 were cut with `head -c` against the skill's "read it whole".
    call.truncated = /\|\s*(head|tail|cut)\b/.test(command.slice(command.indexOf(helper)));
  } else if (helper === 'review' || helper === 'bundle') call.helper = 'review';
  else if (!helper && firstWords(command).some((word) => READ_COMMANDS.has(word))) call.bashRead = true;
  return call;
}

/**
 * The agent's own tool calls, in order, never the whole trace: the skill body is in the trace too and
 * names `prepare` itself, so a text match counts a call nobody made.
 */
function parseTrace(jsonl) {
  const trace = { model: null, calls: [], replayedReviews: 0 };
  const byId = new Map();
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'system' && event.subtype === 'init') trace.model ??= event.model ?? null;
    if (event.type === 'user')
      for (const block of Array.isArray(event.message?.content) ? event.message.content : []) {
        if (block.type !== 'tool_result') continue;
        const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
        if (text.includes(REPLAY_MARK)) trace.replayedReviews += 1;
        const call = byId.get(block.tool_use_id);
        if (call?.helper) call.failure = HELPER_FAILURE.map((pattern) => pattern.exec(text)?.[1]).find(Boolean) ?? null;
      }
    if (event.type !== 'assistant') continue;
    for (const block of event.message?.content ?? [])
      if (block.type === 'tool_use') {
        const call = classifyCall(block);
        trace.calls.push(call);
        if (block.id) byId.set(block.id, call);
      }
  }
  return trace;
}

export function traceMetrics(jsonl) {
  const { model, calls, replayedReviews } = parseTrace(jsonl);
  const count = (pred) => calls.filter(pred).length;
  return {
    model,
    toolCalls: calls.length,
    skills: calls.filter((c) => c.block.name === 'Skill' && typeof c.block.input?.skill === 'string').map((c) => c.block.input.skill),
    prepareRuns: count((c) => c.helper === 'prepare'),
    prepareTruncated: count((c) => c.truncated),
    reviewRuns: count((c) => c.helper === 'review'),
    replayedReviews,
    replayMisses: count((c) => c.failure === 'replay-miss'),
    bashReads: count((c) => c.bashRead),
    readCalls: count((c) => c.block.name === 'Read'),
    grepCalls: count((c) => c.block.name === 'Grep' || c.block.name === 'Glob'),
  };
}

function traceFile(run, tracesDir) {
  const id = /[/\\](e-[^/\\]+)[/\\]/.exec(run.tracePath ?? '')?.[1];
  if (!tracesDir || !id) return null;
  const file = path.join(tracesDir, `${id}.jsonl`);
  return existsSync(file) ? file : null;
}

function traceOf(run, tracesDir) {
  const file = traceFile(run, tracesDir);
  return file ? traceMetrics(readFileSync(file, 'utf8')) : null;
}

function caseMeta(evalCase, benchmarks) {
  const truthFile = [path.join(benchmarks, CASES_DIRECTORY), CURATED_CASES].map((dir) => path.join(dir, evalCase.name, 'truth.json')).find(existsSync);
  return truthFile ? JSON.parse(readFileSync(truthFile, 'utf8')) : null;
}

/**
 * The no-plugin arm depends on the model, the Claude Code version and the prompt, not on the plugin, so
 * one run of it serves every later plugin-only run. Anything that could make it stale is refused.
 */
/** `arm` picks the cached arm that stands in as `without`: `with` compares against another plugin's arm (the LSP-only control). */
export function withBaseline(results, baseline, { baselinePath, arm = 'without' }) {
  const refuse = (why) => {
    throw new Error(`baseline ${baselinePath} refused: ${why}`);
  };
  if (baseline.partial) refuse('it is a partial run');
  const model = results.suite?.modelOverride ?? null;
  if ((baseline.suite?.modelOverride ?? null) !== model) refuse(`its model is ${baseline.suite?.modelOverride ?? 'unpinned'}, this run's is ${model ?? 'unpinned'}`);
  if (baseline.claudeVersion !== results.claudeVersion) refuse(`it ran on Claude Code version ${baseline.claudeVersion}, this run on ${results.claudeVersion}`);
  const cases = (results.cases ?? []).map((evalCase) => {
    if (evalCase.arms?.without) refuse(`${evalCase.name} has its own without arm`);
    const cached = (baseline.cases ?? []).find((c) => c.name === evalCase.name);
    if (!cached) refuse(`it has no case ${evalCase.name}`);
    if (cached.promptMarkdown !== evalCase.promptMarkdown) refuse(`${evalCase.name}'s prompt differs from the one it ran`);
    if (!cached.arms?.[arm]?.length) refuse(`${evalCase.name} has no ${arm} arm in it`);
    return { ...evalCase, arms: { ...evalCase.arms, without: cached.arms[arm] } };
  });
  return { ...results, cases, baseline: { file: baselinePath, arm, startedAt: baseline.startedAt ?? null } };
}

export function score(results, { benchmarks = BENCHMARKS, tracesDir = null } = {}) {
  const runs = [];
  for (const evalCase of results.cases ?? []) {
    const meta = caseMeta(evalCase, benchmarks);
    if (!meta) continue;
    const kind = `${meta.kind ?? 'localize'}${meta.variant ? `-${meta.variant}` : ''}`;
    for (const [arm, armRuns] of Object.entries(evalCase.arms ?? {}))
      armRuns.forEach((run, index) => {
        const graders = Object.fromEntries((run.graders ?? []).map((g) => [g.name, g.passed]));
        const trace = traceOf(run, tracesDir);
        const base = { case: evalCase.name, kind, side: meta.side, arm, run: index, error: run.error ?? null, costUsd: run.costUsd ?? null, turns: run.turns ?? null, graders, trace };
        if (kind.startsWith('review')) {
          // Recall against the humans only: a concern no human raised may be
          // right or wrong, and nothing here can tell which.
          const raised = (run.graders ?? []).filter((g) => /^raises-\d+$/.test(g.name));
          // A run whose judges never ran (a breached cost ceiling skips paid
          // graders) is absent, not a run that raised nothing.
          if (raised.length !== meta.threads || run.skippedPaidGraders) runs.push({ ...base, absent: true });
          else runs.push({ ...base, absent: false, threads: meta.threads, raised: raised.filter((g) => g.passed).length, recall: raised.filter((g) => g.passed).length / meta.threads });
          return;
        }
        const evidence = (run.graders ?? []).find((g) => g.name === EVIDENCE_GRADER)?.evidence;
        if (typeof evidence !== 'string') runs.push({ ...base, absent: true });
        else runs.push({ ...base, absent: false, ...scoreAnswer(evidence, meta.truth, meta.root) });
      });
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const summarize = (rows) => {
    const scored = rows.filter((r) => !r.absent);
    const out = { runs: rows.length, scored: scored.length, absent: rows.length - scored.length };
    for (const m of ['precision', 'recall', 'f1', 'hit', 'named', 'raised', 'threads', 'costUsd', 'turns']) {
      const values = scored.map((r) => r[m]).filter((x) => x !== null && x !== undefined);
      if (values.length) out[m] = mean(values);
    }
    for (const g of ['plugin-fired', 'helper-ran'])
      if (rows.some((r) => g in r.graders)) out[g] = rows.filter((r) => r.graders[g]).length;
    // An untraced run is left out of these counts and shown in `traced`, not counted as a run that did nothing.
    const traced = rows.filter((r) => r.trace);
    out.traced = traced.length;
    if (traced.length) {
      out.models = [...new Set(traced.map((r) => r.trace.model))].sort();
      out['skill-fired'] = traced.filter((r) => r.trace.skills.some((s) => s.startsWith('ambicode:'))).length;
      out['prepare-ran'] = traced.filter((r) => r.trace.prepareRuns > 0).length;
      out['prepare-truncated'] = traced.filter((r) => r.trace.prepareTruncated > 0).length;
      out['replay-missed'] = traced.filter((r) => r.trace.replayMisses > 0).length;
      for (const [name, key] of [['review-runs', 'reviewRuns'], ['bash-reads', 'bashReads'], ['read-calls', 'readCalls'], ['grep-calls', 'grepCalls']])
        out[name] = mean(traced.map((r) => r.trace[key]));
    }
    return out;
  };
  const groups = {};
  for (const r of runs) for (const key of [`${r.kind}/${r.arm}`, `${r.kind}/${r.arm}/${r.side}`]) (groups[key] ??= []).push(r);
  return { runs, arms: Object.fromEntries(Object.entries(groups).sort().map(([k, rows]) => [k, summarize(rows)])) };
}

const STEP_WIDTH = 120;
const oneLine = (text, width = STEP_WIDTH) => {
  const flat = String(text).replace(/\s*\n\s*/g, ' ⏎ ');
  return flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`;
};

function stepLine(call, n) {
  const input = call.block.input ?? {};
  const what =
    call.block.name === 'Bash'
      ? input.command
      : call.block.name === 'Skill'
        ? [input.skill, input.args].filter(Boolean).join(' ')
        : (input.file_path ?? input.pattern ?? input.path ?? JSON.stringify(input));
  return oneLine(`${n}. ${call.block.name} ${what}`);
}

/**
 * Error analysis, not a score: in trace order, the first thing that went wrong is the one to read,
 * since later ones often follow from it (evals-skills error-analysis: "errors cascade").
 */
function deviations(calls, { kind, arm, root, error, turns, maxTurns }) {
  const found = [];
  const seen = new Set();
  const once = (key, text) => {
    if (!seen.has(key)) found.push(text);
    seen.add(key);
  };
  let reviews = 0;
  (calls ?? []).forEach((call, i) => {
    const step = `(step ${i + 1})`;
    const input = call.block.input ?? {};
    if (JSON.stringify(input).includes('benchmarks/')) once('peek', `reached into benchmarks/ ${step}`);
    if (['Edit', 'Write', 'NotebookEdit'].includes(call.block.name) && String(input.file_path ?? '').includes(`/repo/${root}/`))
      once('edit', `edit attempted: ${input.file_path} ${step}`);
    if (call.truncated) once('cut', `prepare output cut with head/tail/cut ${step}`);
    if (call.helper === 'review' && ++reviews === 2) once('rerun', `review re-run ${step}`);
    if (call.failure) once(`fail:${call.failure}`, `${call.helper} failed: ${call.failure} ${step}`);
  });
  if (error) found.push(`the run ended in an error: ${error}`);
  if (calls && arm === 'with') {
    const fired = calls.some((c) => c.block.name === 'Skill' && String(c.block.input?.skill ?? '').startsWith('ambicode:'));
    if (!fired) found.push('no AMBICODE skill fired');
    else if (kind === 'localize' && !calls.some((c) => c.helper === 'prepare')) found.push('a skill fired but prepare never ran');
  }
  if (typeof maxTurns === 'number' && typeof turns === 'number' && turns >= maxTurns) found.push(`stopped at the ${maxTurns}-turn limit`);
  return found;
}

/** One entry per scored run: the `score` row, its steps (null when the trace was not harvested), and what went wrong. */
export function walkRuns(results, { benchmarks = BENCHMARKS, tracesDir = null } = {}) {
  const { runs } = score(results, { benchmarks, tracesDir });
  return runs.map((row) => {
    const evalCase = results.cases.find((c) => c.name === row.case);
    const run = evalCase.arms[row.arm][row.run];
    const file = traceFile(run, tracesDir);
    const calls = file ? parseTrace(readFileSync(file, 'utf8')).calls : null;
    const meta = caseMeta(evalCase, benchmarks);
    const answer = (run.graders ?? []).find((g) => typeof g.evidence === 'string')?.evidence ?? null;
    return {
      row,
      answer,
      steps: calls ? calls.map((call, i) => stepLine(call, i + 1)) : null,
      deviations: deviations(calls, { kind: row.kind, arm: row.arm, root: meta.root, error: row.error, turns: row.turns, maxTurns: evalCase.maxTurns }),
    };
  });
}

const cell = (text) => String(text).replace(/\|/g, '\\|');
const money = (x) => (typeof x === 'number' ? x.toFixed(3) : 'n/a');

function scoreCell(row) {
  if (row.absent) return 'absent';
  if (row.kind.startsWith('review')) return `raised ${row.raised}/${row.threads}`;
  return `P ${row.precision.toFixed(2)} R ${row.recall.toFixed(2)}`;
}

export function walkReport(results, { benchmarks = BENCHMARKS, tracesDir = null, source } = {}) {
  const walk = walkRuns(results, { benchmarks, tracesDir });
  const total = walk.reduce((sum, w) => sum + (w.row.costUsd ?? 0), 0);
  const lines = [
    `# Walkthrough: ${source}`,
    '',
    `Plugin ${results.suite?.plugins?.[0]?.path ?? 'unknown'}, model ${results.suite?.modelOverride ?? 'unpinned'}, ${walk.length} run(s), $${total.toFixed(2)}${results.partial ? ', **partial run**' : ''}.`,
    'Read each run\'s first deviation and write down what you saw, not why. Later deviations often follow from the first.',
    '',
    '| case | arm | run | $ | turns | skills | prepare | score | first deviation |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const { row, deviations: found } of walk) {
    const skills = row.trace ? [...new Set(row.trace.skills.filter((s) => s.startsWith('ambicode:')))].join(', ') || '—' : 'untraced';
    const prepare = row.trace ? `${row.trace.prepareRuns}${row.trace.prepareTruncated ? ` (${row.trace.prepareTruncated} cut)` : ''}` : 'untraced';
    lines.push(`| ${[row.case, row.arm, row.run, money(row.costUsd), row.turns ?? 'n/a', skills, prepare, scoreCell(row), found[0] ?? 'none found'].map(cell).join(' | ')} |`);
  }
  for (const { row, answer, steps, deviations: found } of walk) {
    lines.push('', `## ${row.case} · ${row.arm} · run ${row.run}`, '');
    lines.push(`- deviations: ${found.length ? found.join('; ') : 'none found'}`);
    if (answer !== null) lines.push(`- answer: ${oneLine(answer, 400)}`);
    if (steps === null) lines.push('- trace not harvested: its steps are unknown, not empty');
    else lines.push('', '```', ...steps, '```');
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Never publishes, and keeps the result JSON (every prompt and final answer) in an excluded
 * directory: a `--json` outside the excluded directories is refused.
 */
export function runArgs(extra = [], { now = new Date(), benchmarks = BENCHMARKS, set = 'curated', plugin = ROOT } = {}) {
  if (!['curated', 'full'].includes(set)) throw new Error(`--set takes curated or full, not ${set}`);
  if (extra.includes('--publish-report')) throw new Error('--publish-report is refused: the benchmark set is under NDA');
  if (extra.includes('--eval-dir')) throw new Error('--eval-dir is fixed by --set');
  // Four 2026-09-29 runs differed only by model (Opus, then Sonnet) and read as plugin changes.
  if (!extra.includes('--model')) throw new Error('--model is required: a run with an unpinned model cannot be compared with another');
  // Campaign R1 (2026-09-29) ran uncapped sweeps for 13.5 h, about $221, and used up a weekly plan limit.
  const cap = extra[extra.indexOf('--max-cost-usd') + 1];
  if (!extra.includes('--max-cost-usd') || !cap || cap.startsWith('--')) throw new Error('--max-cost-usd is required: an uncapped sweep can spend a week of plan usage in a day');
  if (!existsSync(path.join(plugin, '.claude-plugin', 'plugin.json'))) throw new Error(`${plugin} is not a plugin: no .claude-plugin/plugin.json`);
  const resultsDir = set === 'full' ? path.join(benchmarks, 'results') : path.join(ROOT, CURATED_EVAL_DIR, 'results');
  const excluded = [benchmarks, path.join(ROOT, CURATED_EVAL_DIR, 'results')];
  for (const flag of ['--json', '--report', '--output-dir']) {
    const i = extra.indexOf(flag);
    if (i < 0) continue;
    const target = extra[i + 1];
    if (!target || target.startsWith('--')) throw new Error(`${flag} needs a path under ${excluded.join(' or ')}`);
    if (excluded.every((dir) => path.relative(dir, path.resolve(target)).startsWith('..')))
      throw new Error(`${flag} must stay under ${excluded.join(' or ')}: the result holds the benchmark's prompts and answers`);
  }
  const json = extra.includes('--json') ? [] : ['--json', path.join(resultsDir, `eval-${now.toISOString().replace(/[:.]/g, '-')}.json`)];
  const evalDir = set === 'full' ? BENCH_EVAL_DIR : CURATED_EVAL_DIR;
  return ['plugin', 'eval', plugin, '--eval-dir', evalDir, '--scaffold', '--allow-tools', 'Bash', '--no-publish', ...json, ...extra];
}

export function harvestDir(argv) {
  const i = argv.indexOf('--json');
  if (i < 0 || !argv[i + 1]) throw new Error('no --json in the run arguments: nowhere safe to put traces');
  return path.join(path.dirname(path.resolve(argv[i + 1])), 'traces');
}

/**
 * Observed at `/private/tmp/e-*` on macOS (reached as `/tmp`); `os.tmpdir()` is scanned too. A wrong
 * root shows up in `harvestedOfResult` as named-but-not-harvested rather than a quiet 0.
 */
const SANDBOX_ROOTS = [...new Set(['/tmp', tmpdir()])];

/**
 * The harness deletes each sandbox when its eval finishes, so the only window is while it runs. Copies go
 * to a temporary name then rename; later passes overwrite, since the trace grows and the last copy is whole.
 */
export function harvestTraces(outDir, { sandboxRoots = SANDBOX_ROOTS } = {}) {
  mkdirSync(outDir, { recursive: true });
  let copied = 0;
  // ENOENT is the benign race. Anything else (EACCES, ENOSPC) would silently degrade every pass,
  // so the first one is thrown after the pass, best effort for the remaining copies.
  let failure = null;
  for (const root of sandboxRoots) {
    let names;
    try {
      names = readdirSync(root);
    } catch (error) {
      if (error.code !== 'ENOENT') failure ??= error;
      continue;
    }
    for (const name of names) {
      if (!name.startsWith('e-')) continue;
      const trace = path.join(root, name, 'out', 'trace.jsonl');
      const to = path.join(outDir, `${name}.jsonl`);
      try {
        copyFileSync(trace, `${to}.tmp`);
        renameSync(`${to}.tmp`, to);
        copied += 1;
      } catch (error) {
        if (error.code !== 'ENOENT') failure ??= error;
      }
    }
  }
  if (failure) throw failure;
  return copied;
}

export function harvestedOfResult(jsonPath, tracesDir) {
  const results = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const named = new Set();
  for (const evalCase of results.cases ?? [])
    for (const runs of Object.values(evalCase.arms ?? {}))
      for (const run of runs ?? []) {
        const id = /[/\\](e-[^/\\]+)[/\\]/.exec(run.tracePath ?? '');
        if (id) named.add(id[1]);
      }
  const harvested = [...named].filter((id) => existsSync(path.join(tracesDir, `${id}.jsonl`))).length;
  return { named: named.size, harvested };
}

/** Beside the result, so it stays in the same gitignored directory: it quotes the benchmark's answers. */
function writeWalk(jsonPath, { benchmarks, tracesDir }) {
  const out = path.join(path.dirname(path.resolve(jsonPath)), `${path.basename(jsonPath, '.json').replace(/^eval-/, 'walk-')}.md`);
  writeFileSync(out, walkReport(JSON.parse(readFileSync(jsonPath, 'utf8')), { benchmarks, tracesDir, source: path.basename(jsonPath) }));
  return out;
}

// Faster buys nothing (the final copy wins); slower risks missing a short run's whole window.
const HARVEST_INTERVAL_MS = 2_000;

async function main(argv) {
  const [command, ...rest] = argv;
  const taken = new Set();
  const option = (name) => {
    const i = rest.indexOf(name);
    if (i < 0) return undefined;
    taken.add(i).add(i + 1);
    return rest[i + 1];
  };
  const benchmarksAt = option('--benchmarks');
  const benchmarks = benchmarksAt === undefined ? BENCHMARKS : path.resolve(benchmarksAt);
  if (command === 'generate' || command === 'select') {
    const pick =
      command === 'select'
        ? { localize: Number(option('--localize') ?? SELECT.localize), review: Number(option('--review') ?? SELECT.review) }
        : null;
    const out = command === 'select' ? CURATED_CASES : undefined;
    const forced = rest.includes('--forced');
    const { out: outDir, written, refused, selection } = generate({ benchmarks, out, pick, forced });
    for (const r of refused) console.log(`refused ${r.name}: ${r.reason}`);
    if (selection)
      for (const [side, kinds] of Object.entries(selection.sides))
        for (const [kind, s] of Object.entries(kinds))
          console.log(`${side} ${kind}: chose ${s.chosen.length} of ${s.eligible} eligible (${s.of} in all): ${s.chosen.map((c) => c.name).join(', ')}`);
    const bySide = {};
    for (const w of written) bySide[w.side] = (bySide[w.side] ?? 0) + 1;
    console.log(`wrote ${written.length} case(s) to ${outDir} (${Object.entries(bySide).map(([s, n]) => `${s} ${n}`).join(', ')}), refused ${refused.length}`);
    return 0;
  }
  if (command === 'run') {
    const set = option('--set') ?? 'curated';
    const pluginAt = option('--plugin');
    const walkIndex = rest.indexOf('--walk');
    if (walkIndex >= 0) taken.add(walkIndex);
    const positional = rest.filter((_, i) => !taken.has(i));
    const cases = set === 'full' ? path.join(benchmarks, CASES_DIRECTORY) : CURATED_CASES;
    if (!existsSync(cases)) throw new Error(`no generated cases at ${cases}: run \`npm run evals:${set === 'full' ? 'generate' : 'select'}\` first`);
    const args = runArgs(positional, { benchmarks, set, ...(pluginAt === undefined ? {} : { plugin: path.resolve(pluginAt) }) });
    const tracesDir = harvestDir(args);
    const child = spawn('claude', args, { stdio: 'inherit' });
    // A harvest failure is reported, never fatal to a paid sweep. Each distinct cause is printed once:
    // a pass every 2 s would flood the output, but a cause that changes mid-sweep must not hide.
    const harvestErrors = new Set();
    const pass = () => {
      try {
        harvestTraces(tracesDir);
      } catch (error) {
        if (!harvestErrors.has(error.message)) console.error(`trace harvest failing: ${error.message}`);
        harvestErrors.add(error.message);
      }
    };
    pass(); // setInterval's first tick is a whole interval away; a short-lived sandbox would be missed.
    const timer = setInterval(pass, HARVEST_INTERVAL_MS);
    const status = await new Promise((resolve) => {
      child.on('error', (error) => {
        console.error(error.message);
        resolve(1);
      });
      child.on('close', (code) => resolve(code ?? 1));
    });
    clearInterval(timer);
    pass();
    const kept = existsSync(tracesDir) ? readdirSync(tracesDir).filter((f) => f.endsWith('.jsonl')).length : 0;
    let completeness;
    try {
      const { named, harvested } = harvestedOfResult(args[args.indexOf('--json') + 1], tracesDir);
      completeness = `; the result names ${named}, ${harvested} of those harvested`;
    } catch (error) {
      completeness = `; harvest completeness unknown (${error.message})`;
    }
    console.log(
      `harvested ${kept} trace(s) to ${tracesDir}${completeness}` +
        `${harvestErrors.size ? ` (harvest reported ${harvestErrors.size} distinct failure(s): the set is incomplete)` : ''}`,
    );
    // Only this run's own result: a failed run that wrote none must not be walked as an older one.
    const json = args[args.indexOf('--json') + 1];
    if (walkIndex >= 0)
      if (existsSync(json)) console.log(`walkthrough: ${writeWalk(json, { benchmarks, tracesDir })}`);
      else console.error(`walkthrough: skipped, the run wrote no result at ${json}`);
    return status;
  }
  if (command === 'score' || command === 'walk') {
    const tracesAt = option('--traces');
    const baselinePath = command === 'score' ? option('--baseline') : undefined;
    const [file] = rest.filter((_, i) => !taken.has(i));
    if (!file || !statSync(file, { throwIfNoEntry: false }))
      throw new Error(`usage: evals-bench.mjs ${command} <eval-results.json> [--traces <dir>]${command === 'score' ? ' [--baseline <with-without-results.json>]' : ''}`);
    const tracesDir = tracesAt ?? path.join(path.dirname(path.resolve(file)), 'traces');
    if (command === 'walk') {
      console.log(`walkthrough: ${writeWalk(file, { benchmarks, tracesDir })}`);
      return 0;
    }
    let results = JSON.parse(readFileSync(file, 'utf8'));
    if (baselinePath !== undefined) results = withBaseline(results, JSON.parse(readFileSync(baselinePath, 'utf8')), { baselinePath });
    console.log(JSON.stringify(score(results, { benchmarks, tracesDir }).arms, null, 2));
    return 0;
  }
  throw new Error(
    'usage: evals-bench.mjs generate | select [--localize <n>] [--review <n>] [--forced] | run [--set curated|full] [--plugin <dir>] --model <m> --max-cost-usd <usd> [--walk] [options] | score <eval-results.json> [--traces <dir>] [--baseline <file>] | walk <eval-results.json> [--traces <dir>]',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
