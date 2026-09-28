// The benchmark eval set: real tickets against real code, graded by the files
// the merged change actually touched.
//
// The data lives in `benchmarks/` and never in git: it is under NDA, and
// `.gitignore` excludes the whole directory. This file carries no word of it.
// It reads, per side (one directory per codebase, e.g. `benchmarks/BE`):
//
//   <side>/src/                   a snapshot of the code
//   <side>/.ambicode/config.yaml  the configuration the team uses on it
//   <side>/assets/<ticket>.md     "## build:context prompt" (the ticket) and
//                                 "## TRUE RELATED CODE" (the grader)
//
// and generates one `claude plugin eval` case per ticket under
// `benchmarks/cases/`, so the cases stay inside the excluded directory too.
// Running with `--eval-dir benchmarks` also puts the whole tree — snapshot,
// tickets, ground truth — under the sandbox's `denyRead` for the evaluated
// agent (it names `<plugin>/<eval dir>`; evals-archived/typescript/README.md),
// so neither arm can read the answer. The scaffold copies the snapshot into
// the run as the operator, outside the sandbox.
//
// The harness scores pass/fail only, with no custom scorer (Claude Code
// 2.1.283), so the in-harness score is coarse: did the answer name any true
// file. `score` computes the measures that matter — precision, recall and F1 of
// the answer's file list — from each run's final message, which the `llm`
// grader's evidence carries whole (72 of 72 identical to the trace's final
// result in the 2026-09-28 sweep, up to 5,082 characters).
//
// usage:
//   node evals-bench.mjs generate [--benchmarks <dir>]
//   node evals-bench.mjs run [claude plugin eval options...]
//   node evals-bench.mjs score <eval-results.json> [--benchmarks <dir>]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const BENCHMARKS = path.join(ROOT, 'benchmarks');
export const CASES_DIRECTORY = 'cases';
/** Relative to the plugin root, as `--eval-dir` takes it. */
export const BENCH_EVAL_DIR = 'benchmarks';

const PROMPT_HEADING = '## build:context prompt';
const TRUTH_HEADING = '## TRUE RELATED CODE';

// The ground-truth lists were pasted from a tool's console output, and some
// carry its status lines as list items. They are not paths.
const NOT_A_PATH = /^(Exit code:|Wall time:|Output:)/;

// Same date as the fixtures (fixtures/materialize.mjs FIXTURE_DATE): a scaffold
// built at any time has the same HEAD.
const SNAPSHOT_DATE = '2026-01-01T00:00:00Z';

/** A ticket's text and its ground-truth paths, or the reason it has none. */
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
 * The directory the snapshot sits under in the repository the truth was taken
 * from: the first path segment most ground-truth paths share, when the rest of
 * such a path exists in the snapshot. The snapshot is placed there, so the
 * truth's paths are the repository's paths unchanged.
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

const yamlString = (value) => JSON.stringify(value);
const regexEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function promptFile(name, side, text) {
  return `---
name: ${name}
description: Localize the files a real ticket's change touches, in a real codebase.
tags: ["bench", "localize", ${yamlString(side.toLowerCase())}]
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

function scaffoldFile(side, root) {
  return `#!/bin/sh
# Generated by evals-bench.mjs; regenerate rather than edit.
#
# Copies the benchmark snapshot to repo/${root}/ (where the ground truth's
# paths put it) with the team's configuration, and commits it, so both arms
# start from the same clean tree. Only config.yaml is copied from .ambicode/:
# task notes and saved reviews there are earlier sessions' conclusions about
# this code, and could hand an arm the answer.
set -e
SIDE="$(cd "$(dirname "$0")/../../${side}" && pwd)"
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
  // The investigate skill writes its note under .ambicode/task/; only a write
  // into the code counts as an edit.
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

function reviewPromptFile(name, side, text) {
  return `---
name: ${name}
description: Review a real merged change, as it stood when a human reviewed it.
tags: ["bench", "review", ${yamlString(side.toLowerCase())}]
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

Review the change before it merges: report the problems a reviewer should
raise, each with its file and line.

\`repo/\` is the repository under review. Change into it with \`cd repo\` before
running anything, and run every command from there.

Do not edit anything.
`;
}

function reviewScaffoldFile(side, root, versionPath) {
  return `#!/bin/sh
# Generated by evals-bench.mjs; regenerate rather than edit.
#
# The snapshot, with every file the change touches put back as it was at the
# change's base, committed; then the change as the human reviewer saw it,
# applied and left uncommitted. The touched files are exact; the rest of the
# tree is the snapshot, which is newer than the change.
set -e
SIDE="$(cd "$(dirname "$0")/../../${side}" && pwd)"
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
signs in (evals-archived/typescript/README.md).
`;
  return files;
}

/** Review versions prepared under <side>/reviews/<ticket>/<version>/. */
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

/** Writes every case; returns what it wrote and what it refused, with reasons. */
export function generate({ benchmarks = BENCHMARKS } = {}) {
  const out = path.join(benchmarks, CASES_DIRECTORY);
  // Generated output only: a stale case from a removed ticket must not run.
  rmSync(out, { recursive: true, force: true });
  const written = [];
  const refused = [];
  const sides = readdirSync(benchmarks, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(benchmarks, e.name, 'assets')))
    .map((e) => e.name)
    .sort();
  if (sides.length === 0) throw new Error(`no <side>/assets/ under ${benchmarks}`);
  for (const side of sides) {
    const base = path.join(benchmarks, side);
    for (const required of ['src', path.join('.ambicode', 'config.yaml')])
      if (!existsSync(path.join(base, required))) throw new Error(`${side}: ${required} is missing`);
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
      // A file the snapshot no longer has cannot be found; it is recorded,
      // not graded.
      const truth = ticket.truth.filter((p) => present.has(p));
      if (truth.length === 0) {
        refused.push({ name, reason: `none of its ${ticket.truth.length} true file(s) exists in the snapshot` });
        continue;
      }
      const directory = path.join(out, name);
      mkdirSync(path.join(directory, 'graders'), { recursive: true });
      writeFileSync(path.join(directory, 'case.yaml'), `schema_version: "1.1"\nname: ${name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
      writeFileSync(path.join(directory, 'prompt.md'), promptFile(name, side, ticket.text));
      writeFileSync(path.join(directory, 'scaffold.sh'), scaffoldFile(side, root), { mode: 0o755 });
      for (const [file, body] of Object.entries(graderFiles(truth, root))) writeFileSync(path.join(directory, 'graders', file), body);
      writeFileSync(
        path.join(directory, 'truth.json'),
        JSON.stringify({ kind: 'localize', side, ticket: ticket.id, root, truth, missingFromSnapshot: ticket.truth.filter((p) => !present.has(p)) }, null, 2),
      );
      written.push({ kind: 'localize', name, side, truth: truth.length, missing: ticket.truth.length - truth.length });
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
      const directory = path.join(out, name);
      mkdirSync(path.join(directory, 'graders'), { recursive: true });
      writeFileSync(path.join(directory, 'case.yaml'), `schema_version: "1.1"\nname: ${name}\ncontext:\n  scaffold_script: scaffold.sh\n`);
      writeFileSync(path.join(directory, 'prompt.md'), reviewPromptFile(name, side, texts.get(v.ticket)));
      writeFileSync(path.join(directory, 'scaffold.sh'), reviewScaffoldFile(side, root, v.relative), { mode: 0o755 });
      for (const [file, body] of Object.entries(reviewGraderFiles(threads))) writeFileSync(path.join(directory, 'graders', file), body);
      writeFileSync(path.join(directory, 'truth.json'), JSON.stringify({ kind: 'review', side, ticket: v.ticket, version: v.version, root, threads: threads.length }, null, 2));
      written.push({ kind: 'review', name, side, threads: threads.length });
    }
  }
  return { out, written, refused };
}

/** The part of an answer that is its file list: the last `Files` heading's section, else all of it. */
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
 * The files an answer names, mapped onto the truth where they mean the same
 * file: `./`, `repo/` and absolute prefixes are dropped, and a path missing
 * only the code root (`controllers/x.ts` for `src/controllers/x.ts`) matches
 * when exactly one true path ends that way.
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

/** Per-run and per-arm measures for a `claude plugin eval --json` result. */
export function score(results, { benchmarks = BENCHMARKS } = {}) {
  const runs = [];
  for (const evalCase of results.cases ?? []) {
    const truthFile = path.join(benchmarks, CASES_DIRECTORY, evalCase.name, 'truth.json');
    if (!existsSync(truthFile)) continue;
    const meta = JSON.parse(readFileSync(truthFile, 'utf8'));
    const kind = meta.kind ?? 'localize';
    for (const [arm, armRuns] of Object.entries(evalCase.arms ?? {}))
      armRuns.forEach((run, index) => {
        const graders = Object.fromEntries((run.graders ?? []).map((g) => [g.name, g.passed]));
        const base = { case: evalCase.name, kind, side: meta.side, arm, run: index, error: run.error ?? null, costUsd: run.costUsd ?? null, turns: run.turns ?? null, graders };
        if (kind === 'review') {
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
        // No final message is reported as absent, never as an empty answer
        // that scored zero.
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
    return out;
  };
  const groups = {};
  for (const r of runs) for (const key of [`${r.kind}/${r.arm}`, `${r.kind}/${r.arm}/${r.side}`]) (groups[key] ??= []).push(r);
  return { runs, arms: Object.fromEntries(Object.entries(groups).sort().map(([k, rows]) => [k, summarize(rows)])) };
}

/**
 * The `claude plugin eval` argument vector, after `claude`. Never publishes,
 * and keeps the result JSON — which holds every prompt and final answer — in
 * the excluded directory: by default under benchmarks/results/, and a
 * `--json` outside benchmarks/ is refused.
 */
export function runArgs(extra = [], { now = new Date(), benchmarks = BENCHMARKS } = {}) {
  if (extra.includes('--publish-report')) throw new Error('--publish-report is refused: the benchmark set is under NDA');
  if (extra.includes('--eval-dir')) throw new Error('--eval-dir is fixed to the benchmark set');
  for (const flag of ['--json', '--report', '--output-dir']) {
    const i = extra.indexOf(flag);
    if (i < 0) continue;
    const target = extra[i + 1];
    if (!target || target.startsWith('--')) throw new Error(`${flag} needs a path under ${benchmarks}`);
    if (path.relative(benchmarks, path.resolve(target)).startsWith('..')) throw new Error(`${flag} must stay under ${benchmarks}: the result holds the benchmark's prompts and answers`);
  }
  const json = extra.includes('--json') ? [] : ['--json', path.join(benchmarks, 'results', `eval-${now.toISOString().replace(/[:.]/g, '-')}.json`)];
  return ['plugin', 'eval', ROOT, '--eval-dir', BENCH_EVAL_DIR, '--scaffold', '--allow-tools', 'Bash', '--no-publish', ...json, ...extra];
}

function main(argv) {
  const [command, ...rest] = argv;
  const flagAt = rest.indexOf('--benchmarks');
  const benchmarks = flagAt < 0 ? BENCHMARKS : path.resolve(rest[flagAt + 1] ?? '');
  const positional = rest.filter((_, i) => flagAt < 0 || (i !== flagAt && i !== flagAt + 1));
  if (command === 'generate') {
    const { out, written, refused } = generate({ benchmarks });
    for (const r of refused) console.log(`refused ${r.name}: ${r.reason}`);
    const bySide = {};
    for (const w of written) bySide[w.side] = (bySide[w.side] ?? 0) + 1;
    console.log(`wrote ${written.length} case(s) to ${out} (${Object.entries(bySide).map(([s, n]) => `${s} ${n}`).join(', ')}), refused ${refused.length}`);
    return 0;
  }
  if (command === 'run') {
    if (!existsSync(path.join(benchmarks, CASES_DIRECTORY))) throw new Error('no generated cases: run `node evals-bench.mjs generate` first');
    return spawnSync('claude', runArgs(positional), { stdio: 'inherit' }).status ?? 1;
  }
  if (command === 'score') {
    const [file] = positional;
    if (!file || !statSync(file, { throwIfNoEntry: false })) throw new Error('usage: evals-bench.mjs score <eval-results.json>');
    console.log(JSON.stringify(score(JSON.parse(readFileSync(file, 'utf8')), { benchmarks }).arms, null, 2));
    return 0;
  }
  throw new Error('usage: evals-bench.mjs generate | run [options] | score <eval-results.json>');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
