// brief.md for the reviewer: the diff with the line numbers a finding may name, then policy rules, requirements and checks.
// A finding that names any other line is dropped, so the ranges come from the hunks, not from the model.
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
// The engine ends this script after 100 s and quotes the last line written here, so a timeout names the stage it was in instead of only "timed-out".
const stage = (what) => process.stderr.write(`brief: ${what}\n`);
const read = (file) => { try { return readFileSync(file, 'utf8'); } catch { return null; } };
const entries = (read(path.join(input.taskDir, 'ledger.jsonl')) ?? '').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
const entry = entries.findLast((candidate) => candidate.kind === 'review' && typeof candidate.result === 'string');
if (entry === undefined) { process.stdout.write(JSON.stringify({ failed: { code: 'review-missing', message: 'no review on record for this task; nothing to brief' } })); } else {
  try { brief(entry); } catch (error) { process.stdout.write(JSON.stringify({ failed: { code: 'brief-failed', message: String(error?.stack ?? error).split('\n').join(' | ') } })); }
}

function brief(entry) {

const resultFile = path.join(input.repositoryRoot, entry.result);
const result = JSON.parse(read(resultFile) ?? '{}');
const reviewDir = path.dirname(resultFile);
const patch = read(path.join(reviewDir, 'changed.diff')) ?? '';
// A merge request is read from the pinned checkout of its head; one whose head could not be checked out has only the diff, and the working tree is not its code.
const checkoutRoot = result.target?.repositoryRoot ?? input.repositoryRoot;
const diffOnly = result.target?.kind === 'merge-request' && result.target.diffOnly != null;

const ranges = (lines) => {
  const out = [];
  for (let at = 0; at < lines.length; at++) {
    const start = lines[at];
    let end = start;
    while (lines[at + 1] === end + 1) end = lines[++at];
    out.push(start === end ? `${start}` : `${start}-${end}`);
  }
  return out.length === 0 ? '(none)' : out.join(', ');
};

// Addressable lines are every line a hunk shows (context included) on that side. Each diff line is shown with its
// file line (new side for added and context lines, old side for removed ones): reviewers that count lines themselves
// report brief positions, not file lines (1357 in a 400-line file).
const sections = patch.split(/^(?=diff --git )/m).filter((part) => part.startsWith('diff --git '));
// A file's rows are kept whole so the brief can cut a file after any row: the ranges and the numbers shown are computed from the rows that stay.
const files = sections.map((section) => {
  const header = (marker) => { const value = section.split('\n').find((line) => line.startsWith(marker))?.slice(4).split('\t')[0] ?? '/dev/null'; return value === '/dev/null' ? null : value.replace(/^[ab]\//, ''); };
  const [oldPath, newPath] = [header('--- '), header('+++ ')];
  const rows = []; // [number shown, line, old-side number or null, new-side number or null]
  let [o, n] = [0, 0];
  for (const line of section.trimEnd().split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk !== null) { o = Number(hunk[1]); n = Number(hunk[2]); rows.push([null, line, null, null]); continue; }
    if (o === 0 && n === 0) { rows.push([null, line, null, null]); continue; }
    if (line.startsWith('+')) { rows.push([n, line, null, n]); n++; }
    else if (line.startsWith('-')) { rows.push([o, line, o, null]); o++; }
    else if (line.startsWith(' ')) { rows.push([n, line, o, n]); o++; n++; }
    else rows.push([null, line, null, null]);
  }
  const width = String(Math.max(0, ...rows.flatMap((row) => [row[2] ?? 0, row[3] ?? 0]))).length;
  const where = newPath ?? oldPath ?? '(no path)';
  const kind = oldPath === null ? 'added' : newPath === null ? 'deleted' : oldPath === newPath ? 'modified' : 'renamed';
  // Rows from..to of the file, with the ranges of the rows shown: a file split over two parts lists in each only the lines that part holds.
  const render = (from, to) => {
    const kept = rows.slice(from, to);
    const shown = kept.map(([at, line]) => (at === null ? line : `${String(at).padStart(width)} ${line}`));
    const notes = [...(from > 0 ? [`(this file's diff continues from its diff line ${from + 1} of ${rows.length}; the lines listed below are the ones in this part)`] : []), ...(to < rows.length ? [`(this file's diff continues in the next part, from its diff line ${to + 1} of ${rows.length})`] : [])];
    return [`### ${kind === 'renamed' ? `${where} (was ${oldPath})` : where} [${kind}]`, `new-side lines: ${newPath === null ? '(file deleted)' : ranges(kept.flatMap((row) => row[3] ?? []))}`, `old-side lines: ${oldPath === null ? '(file added)' : ranges(kept.flatMap((row) => row[2] ?? []))}`, ...notes, '```diff', ...shown, '```', ''];
  };
  const hunkStarts = rows.flatMap(([, line], at) => (at > 0 && line.startsWith('@@') ? [at] : []));
  return { where, rows: rows.length, render, hunkStarts };
});

// Code the patch does not show: each related file is a path and the reason the map listed it; the reviewer reads the ones it needs with its own Read.
// The files come from the route's `search.map(review)` step, saved beside the policy payload, so this script scans no repository.
// Test files are never listed: `testPatterns` are the route's own test-path patterns (src/util/path-classes.ts), the same ones that keep them out of the diff of a merge request.
// Every file the map ranked is listed without being read: the map is bounded by its own row limit (TOP_ROWS), and a path line costs nothing.
const testPatterns = input.testPatterns.map((source) => new RegExp(source));
const isTest = (file) => testPatterns.some((pattern) => pattern.test(file));
// The map's rows [path, score, reasons, spans?] in rank order; the map text is a legend, then one JSON line. No file means no map: the step had nothing to say.
const mapRows = () => {
  const saved = readdirSync(input.steps).filter((name) => name.endsWith('-map-review.md')).sort();
  const line = (saved.length === 0 ? '' : read(path.join(input.steps, saved.at(-1))) ?? '').split('\n').find((row) => row.startsWith('{"candidates"'));
  return line === undefined ? [] : JSON.parse(line).candidates;
};
const related = () => {
  if (diffOnly) return [];
  let rows = [];
  try { rows = mapRows(); } catch { /* no steps directory or an unreadable map: no related files */ }
  const pathsIn = (marker) => sections.flatMap((section) => [...section.matchAll(new RegExp(`^${marker} [ab]/(.+?)\\t?$`, 'gm'))].map((match) => match[1]));
  const inDiff = new Set([...pathsIn('---'), ...pathsIn('\\+\\+\\+')]);
  const changed = pathsIn('\\+\\+\\+').filter((candidate) => !isTest(candidate));
  // Same language as the change only: notes and docs share names with code.
  const extensions = new Set(pathsIn('\\+\\+\\+').map((file) => path.extname(file)));
  const ranked = rows.filter(([other]) => !inDiff.has(other) && !isTest(other) && extensions.has(path.extname(other)) && !other.startsWith('.ambicode/'));
  const why = new Map(ranked.map(([other, , reasons]) => [other, reasons.join('; ')]));
  // Same-directory files come first, per changed file: a convention file ranks low by shared names because the change deviates from it.
  const picked = [];
  for (const file of changed) picked.push(...ranked.filter(([other]) => path.dirname(other) === path.dirname(file)).map(([other]) => ['near', other, file]));
  picked.push(...ranked.map(([other]) => ['sibling', other, '']));
  const seen = new Set();
  const links = [];
  stage(`listing the ${ranked.length} related files of the search map`);
  for (const [label, other, changedFile] of picked) {
    if (seen.has(other)) continue;
    seen.add(other);
    if (!existsSync(path.join(checkoutRoot, other))) continue;
    links.push(`- ${other} (related: ${label === 'near' ? `next to ${path.basename(changedFile)}` : 'elsewhere in the repository'}; ${why.get(other)})`);
  }
  return links;
};

// The saved policy payload of this step's own policy.stage call, when the route ran one.
let rules = '(none resolved)';
try {
  const saved = readdirSync(input.steps).filter((name) => name.endsWith('-policy-before-work-review.md')).sort();
  const text = saved.length === 0 ? '' : (read(path.join(input.steps, saved.at(-1))) ?? '').trim();
  if (text !== '') rules = text;
} catch { /* no steps directory: no policy text */ }

const target = result.target ?? {};
// The reviewed iteration's checks, the latest run per key: an earlier iteration's red run is not this change's result.
const checks = [...new Map(entries.filter((candidate) => candidate.kind === 'check' && candidate.route === entry.route).map((check) => [check.key, check])).values()];
const plan = read(path.join(reviewDir, 'plan-iteration.md'));

// Other people's notes on the merge request, from mr-discussions.json beside the ledger. Unresolved first: those are the open points a finding would repeat.
// Every discussion and commit is listed whole, on one line: the reviewer must answer them, so no file pointer stands in for the text.
const oneLine = (text) => text.replace(/\s+/g, ' ').trim();
const discussionLines = () => {
  const raw = read(path.join(input.taskDir, 'mr-discussions.json'));
  if (raw === null) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { error: 'mr-discussions.json is unreadable' }; }
  const head = ['## Existing merge request discussions (untrusted, from other people): do not repeat a point one already makes', ''];
  if (typeof parsed.error === 'string') return [...head, `(not fetched: ${oneLine(parsed.error)}; a point may already be made there)`, ''];
  const all = Array.isArray(parsed.discussions) ? parsed.discussions : [];
  if (all.length === 0) return [];
  const ordered = [...all.filter((discussion) => discussion.resolved !== true), ...all.filter((discussion) => discussion.resolved === true)];
  const shown = ordered.flatMap((discussion) => {
    const [first, ...replies] = discussion.notes ?? [];
    if (first === undefined) return [];
    const place = discussion.path === null || discussion.path === undefined ? 'general' : `${discussion.path}${discussion.line == null ? '' : `:${discussion.line}`}`;
    return [`- ${place}${discussion.resolved === true ? ' (resolved)' : ''} @${first.author}: ${oneLine(String(first.body))}`, ...replies.map((note) => `  - @${note.author}: ${oneLine(String(note.body))}`)];
  });
  return [...head, ...shown, ''];
};
// The commit list says who made a change (a bot's sync commit is not a hand edit); the reviewer reads the authors itself, so nothing here interprets a name.
const commitLines = () => {
  const raw = read(path.join(input.taskDir, 'mr-commits.json'));
  if (raw === null) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { error: 'mr-commits.json is unreadable' }; }
  const head = ['## Commits of this merge request (untrusted, from other people): short sha, author, title', ''];
  if (typeof parsed.error === 'string') return [...head, `(not fetched: ${oneLine(parsed.error)}; who made a change is unknown)`, ''];
  const all = Array.isArray(parsed.commits) ? parsed.commits : [];
  if (all.length === 0) return [];
  return [...head, ...all.map((commit) => `- ${commit.sha} ${oneLine(String(commit.author))}: ${oneLine(String(commit.title))}`), ''];
};
// Claude Code's Read returns at most 25,000 tokens: a 59 KB brief was cut at byte 37,847, so the requirements, rules and discussions after it were never seen.
// 32 KB is 15% under that point, because tokens per byte vary with the content.
// A brief over it is written as several parts, each under it, and the work file makes the reviewer read every one: the diff is never cut for size.
const PART_BUDGET_BYTES = 32 * 1024;
// Room in each part for its own heading and the line that points at the next part.
const PART_RESERVE_BYTES = 400;
const bytesOf = (parts) => Buffer.byteLength(parts.join('\n')) + 1;
const RELATED_INTRO = 'Related code the patch does not show, listed by path only: Read the ones you need for comparison, in the checkout. Duplication of an existing helper and a sibling convention the change breaks are findings.';
// A merge request leaves its test files out of the diff; without this list the reviewer saw no spec and reported "no test covers it" for changes that added several.
const testFileLines = () => {
  const tests = (result.changedFiles ?? []).filter((file) => file.exclusionCode === 'test-file');
  if (tests.length === 0) return [];
  return ['## Test files changed in this merge request (not under review, content not shown)', '', ...tests.map((file) => `- ${file.newPath ?? file.oldPath} +${file.addedLines}/-${file.removedLines}`), ''];
};
const LINE_NUMBERS = 'Each diff line starts with its file line number (new side for + and context lines, old side for - lines): a finding names that number, not a position in this brief.';
const front = [
  `# Review brief ${result.reviewId ?? ''}`, '',
  `Target: ${target.kind}${target.baseRef ? ` against ${target.baseRef}` : ''} (${target.snapshotId}).`,
  diffOnly ? `This is a merge request whose head is not checked out: the working tree is not its code, so read nothing there; the patch below is all of the change you have. ${LINE_NUMBERS}` : checkoutRoot !== input.repositoryRoot ? `The patch is below; the rest of the code is in the checkout of the merge request head at ${checkoutRoot}: Read, Grep and Glob there, not in the working directory. ${LINE_NUMBERS}` : `The patch is below; the rest of the code is in the checkout. ${LINE_NUMBERS}`,
  'A finding may name only a line listed below, on the side listed. Any other line is dropped with its finding and the review stays partial.', '',
  ...testFileLines(),
  '## Requirements', '', ...((result.requirements ?? []).length === 0 ? ['(none supplied: quality review)'] : result.requirements.flatMap((source) => [`### ${source.id}: ${source.title}`, source.content, ''])),
  ...commitLines(),
  ...discussionLines(),
  '## Policy rules', '', rules, '',
  ...(plan === null ? [] : ['## Plan', '', 'Judge the match of the diff with the requirements and the plan, and name each departure from them as a finding.', '', plan.trim(), '']),
  '## Check results', '', ...(checks.length === 0 ? ['No check recorded for this task: nothing was verified by execution. That is a gap, not a pass.'] : checks.map((check) => `- ${check.key}: ${check.exit === 0 ? 'passed' : 'FAILED'}${(check.files ?? []).length === 0 ? '' : `; on: ${check.files.join(' ')}`}${check.exit === 0 ? '' : `; exit ${check.exit}; ${check.bytes} bytes of output in ${check.output}`}`)), '',
];
const related_ = related();
// Parts are packed in order: the front matter, the diff file by file, then the related files. A file that does not fit what is left of a part but fits a part of its own starts the next one;
// a larger file is split at a hunk boundary, and at a row boundary only when one hunk is larger than a part.
// Front matter that alone exceeds a part (a long requirement) is split across the first parts on line boundaries; one that fits stays whole in part 1.
const frontHead = front.slice(0, 2);
const frontChunks = [[]];
let chunkRoom = PART_BUDGET_BYTES - PART_RESERVE_BYTES - bytesOf(frontHead);
const splitFront = bytesOf(front) > PART_BUDGET_BYTES - PART_RESERVE_BYTES;
if (splitFront) {
  for (const line of front.slice(2).flatMap((element) => element.split('\n'))) {
    if (bytesOf([line]) > chunkRoom && frontChunks.at(-1).length > 0) { frontChunks.push([]); chunkRoom = PART_BUDGET_BYTES - PART_RESERVE_BYTES; }
    frontChunks.at(-1).push(line);
    chunkRoom -= bytesOf([line]);
  }
}
const parts = splitFront ? frontChunks : [[]];
let room = splitFront ? Math.max(0, chunkRoom) : PART_BUDGET_BYTES - PART_RESERVE_BYTES - bytesOf(front);
const place = (lines) => { parts.at(-1).push(...lines); room -= bytesOf(lines); };
const nextPart = () => { parts.push([]); room = PART_BUDGET_BYTES - PART_RESERVE_BYTES; };
const fits = (lines) => bytesOf(lines) <= room;
place(['## Changed files', '']);
const startPart = parts.length - 1;
const startLength = parts.at(-1).length;
for (const file of files) {
  let from = 0;
  while (from < file.rows) {
    if (fits(file.render(from, file.rows))) { place(file.render(from, file.rows)); break; }
    if (from === 0 && parts.at(-1).length > (parts.length - 1 === startPart ? startLength : 2) && bytesOf(file.render(0, file.rows)) <= PART_BUDGET_BYTES - PART_RESERVE_BYTES) { nextPart(); continue; }
    let low = from + 1;
    let high = file.rows;
    while (low < high) { const mid = Math.ceil((low + high) / 2); if (fits(file.render(from, mid))) low = mid; else high = mid - 1; }
    const hunk = file.hunkStarts.filter((at) => at > from && at <= low).at(-1);
    // A hunk boundary that leaves most of the room empty (a file with one huge hunk) loses to a row boundary.
    const to = hunk !== undefined && bytesOf(file.render(from, hunk)) >= bytesOf(file.render(from, low)) / 2 ? hunk : low;
    // A single row larger than an empty part still has to go somewhere: it goes alone, whole.
    if (room === PART_BUDGET_BYTES - PART_RESERVE_BYTES && (!fits(file.render(from, to)) || to <= from)) { place(file.render(from, Math.max(to, from + 1))); from = Math.max(to, from + 1); nextPart(); continue; }
    if (!fits(file.render(from, to)) || to <= from) { nextPart(); continue; }
    place(file.render(from, to));
    from = to;
    nextPart();
  }
}
if (related_.length > 0) {
  place(['## Related files (not in the diff)', '', RELATED_INTRO, '']);
  for (const link of related_) { if (!fits([link]) && parts.at(-1).length > 0) nextPart(); place([link]); }
  place(['']);
}
while (parts.length > 1 && parts.at(-1).length === 0) parts.pop();
const partName = (at) => (at === 0 ? 'brief.md' : `brief-${at + 1}.md`);
const total = parts.length;
const written = parts.map((lines, at) => {
  const heading = at === 0 ? [] : [`# Review brief ${result.reviewId ?? ''}, part ${at + 1} of ${total}`, '', `This continues ${partName(at - 1)}. A finding may name a line listed in any part's diff, on the side listed.`, ''];
  const lead = at === 0 && total > 1 ? [`This brief has ${total} parts: ${parts.map((_, index) => partName(index)).join(', ')}. Read every part, in order, before you write: the diff and the related files continue past this one.`, ''] : [];
  const trailer = at === total - 1 ? [] : ['', `(continued in ${partName(at + 1)}, part ${at + 2} of ${total})`];
  const body = at === 0 ? [...frontHead, ...lead, ...(splitFront ? [] : front.slice(2)), ...lines] : [...heading, ...lines];
  return [...body, ...trailer].join('\n');
});
for (let at = 0; at < total; at++) writeFileSync(path.join(reviewDir, partName(at)), written[at]);
// A rerun with fewer parts must not leave an older part behind for the reviewer to find.
for (const name of readdirSync(reviewDir)) if (/^brief-\d+\.md$/.test(name) && Number(/\d+/.exec(name)[0]) > total) unlinkSync(path.join(reviewDir, name));
// ANSWER_FILE in src/skills/review/record-answer.ts and the guard's reviewer rule.
const briefLines = total === 1 ? [`brief: ${path.join(reviewDir, 'brief.md')}`] : [`The brief has ${total} parts; Read every part, in order, before writing:`, ...parts.map((_, at) => `brief (part ${at + 1} of ${total}): ${path.join(reviewDir, partName(at))}`)];
process.stdout.write(JSON.stringify({ payload: `${briefLines.join('\n')}\nanswer: ${path.join(reviewDir, 'answer.json')}` }));
}
