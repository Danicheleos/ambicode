// brief.md for the reviewer: the diff with the line numbers a finding may name, then policy rules, requirements and checks.
// A finding that names any other line is dropped, so the ranges come from the hunks, not from the model.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const read = (file) => { try { return readFileSync(file, 'utf8'); } catch { return null; } };
const entries = (read(path.join(input.taskDir, 'ledger.jsonl')) ?? '').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
const entry = entries.findLast((candidate) => candidate.kind === 'review' && typeof candidate.result === 'string');
if (entry === undefined) { process.stdout.write(JSON.stringify({ failed: { code: 'review-missing', message: 'no review on record for this task; nothing to brief' } })); } else {
  try { brief(entry); } catch (error) { process.stdout.write(JSON.stringify({ failed: { code: 'brief-failed', message: String(error?.stack ?? error).split('\n').slice(0, 3).join(' | ') } })); }
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

// Code the patch does not show: a reviewer given only paths did not open them, so the content is inlined.
// Test files are never inlined: `testPatterns` are the route's own test-path patterns (src/util/path-classes.ts), the same ones that keep them out of the diff of a merge request.
// Caps: the brief is 5-7 KB without this section; 100 lines per file and 300 in total add about 10-14 KB, so it stays under ~3x.
// 12 files = 2 same-directory files for each of ~4 changed files + RELATED_SIBLINGS siblings. 64 KB is the largest file read at all (generated and vendored files).
const RELATED_MAX = 12;
const RELATED_FILE_LINES = 100;
const RELATED_TOTAL_LINES = 300;
const RELATED_FILE_BYTES = 64 * 1024;
// Extra cross-directory siblings, on top of the reserved same-directory ones: the top 4 of the whole repository by shared names fit a 300-line budget next to them.
const RELATED_SIBLINGS = 4;
// A name is noise once it is in more than 20% of the files, but never below 8 files: in a 30-file fixture 10% is 3 files and would drop a helper used by 3 callers.
const COMMON_SHARE = 0.2;
const COMMON_FLOOR = 8;
const NAMES_MAX = 300; // one git grep command line: 300 names stay far below the argument limit
const NAMES_SHOWN = 5;
const NEAR_PER_FILE = 2; // the old per-file same-directory count
const MIN_CONTENT_LINES = 3; // a package/doc stub of 1-2 lines beat the file holding the duplicated function for a sibling slot
const testPatterns = input.testPatterns.map((source) => new RegExp(source));
const isTest = (file) => testPatterns.some((pattern) => pattern.test(file));
// Whole-word names of the added and context lines (length >= 4), mapped to the files that contain them, as the shared-name counts of the candidate siblings.
const sharedNames = (tracked, excluded) => {
  const names = new Set();
  for (const line of patch.split('\n')) if ((line.startsWith('+') && !line.startsWith('+++')) || line.startsWith(' ')) for (const name of line.slice(1).match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) ?? []) names.add(name);
  if (names.size === 0) return new Map();
  const filesOf = new Map();
  const list = [...names].slice(0, NAMES_MAX);
  let out = '';
  try { out = execFileSync('git', ['grep', '-I', '-o', '-w', '-F', '--null', '--no-color', '--untracked', '--exclude-standard', ...list.flatMap((name) => ['-e', name]), '--', '.'], { cwd: checkoutRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }); } catch (error) { out = String(error?.stdout ?? ''); }
  for (const row of out.split('\n')) {
    const [file, name] = row.split('\0');
    if (name === undefined) continue;
    if (!filesOf.has(name)) filesOf.set(name, new Set());
    filesOf.get(name).add(file);
  }
  const common = Math.max(COMMON_FLOOR, Math.floor(tracked.length * COMMON_SHARE));
  const byFile = new Map();
  for (const [name, set] of filesOf) {
    if (set.size > common) continue;
    for (const file of set) { if (excluded(file)) continue; byFile.set(file, [...(byFile.get(file) ?? []), [name, set.size]]); }
  }
  return byFile;
};
const related = () => {
  if (diffOnly) return { blocks: [], names: [], omitted: [] };
  let tracked = [];
  try { tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: checkoutRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean); } catch { return { blocks: [], names: [], omitted: [] }; }
  const pathsIn = (marker) => sections.flatMap((section) => [...section.matchAll(new RegExp(`^${marker} [ab]/(.+?)\\t?$`, 'gm'))].map((match) => match[1]));
  const inDiff = new Set([...pathsIn('---'), ...pathsIn('\\+\\+\\+')]);
  const picked = { near: [], sibling: [] };
  // Same language as the change only: notes and docs share names with code and spent the line budget.
  const extensions = new Set(pathsIn('\\+\\+\\+').map((file) => path.extname(file)));
  const shared = sharedNames(tracked, (file) => inDiff.has(file) || isTest(file) || !extensions.has(path.extname(file)) || file.startsWith('.ambicode/')); // the review's own diff and brief carry every name of the patch
  const ranked = [...shared].map(([other, names]) => ({ other, names })).sort((a, b) => b.names.length - a.names.length || (a.other < b.other ? -1 : 1));
  const sharing = new Map(ranked.map((entry) => [entry.other, entry.names]));
  // Same-directory slots are reserved per changed file: a convention file ranks low by shared names because the change deviates from it,
  // so a global ranking alone would not reach the files the change should follow.
  for (const file of pathsIn('\\+\\+\\+').filter((candidate) => !isTest(candidate))) picked.near.push(...ranked.filter((entry) => path.dirname(entry.other) === path.dirname(file)).map((entry) => [entry.other, file]));
  picked.sibling.push(...ranked.map((entry) => [entry.other, '']));
  const out = [];
  const seen = new Set();
  let budget = RELATED_TOTAL_LINES;
  let files = 0;
  const omitted = [];
  const names_ = [];
  let siblings = 0;
  const nearCount = new Map();
  for (const [label, other, changed] of [...picked.near.map((pair) => ['near', ...pair]), ...picked.sibling.map((pair) => ['sibling', ...pair])]) {
    if (seen.has(other)) continue;
    seen.add(other);
    let text;
    try {
      const buffer = readFileSync(path.join(checkoutRoot, other));
      if (buffer.length > RELATED_FILE_BYTES || buffer.subarray(0, 8000).includes(0)) continue;
      text = buffer.toString('utf8');
    } catch { continue; }
    const all = text.replace(/\n$/, '').split('\n');
    if (text === '') continue;
    if (all.filter((line) => line.trim() !== '').length < MIN_CONTENT_LINES) continue;
    if (label === 'near' ? (nearCount.get(changed) ?? 0) >= NEAR_PER_FILE : label === 'sibling' && siblings >= RELATED_SIBLINGS) { seen.delete(other); continue; } // over the per-file cap, still eligible globally
    // The per-kind counts run before the global cap: a file the cap cuts still used its slot, so only selected files are ever reported as cut.
    if (label === 'near') nearCount.set(changed, (nearCount.get(changed) ?? 0) + 1);
    else if (label === 'sibling') siblings++;
    if (files >= RELATED_MAX || budget <= 0) { omitted.push(other); continue; }
    files++;
    const take = Math.min(RELATED_FILE_LINES, budget);
    budget -= Math.min(all.length, take);
    const width = String(Math.min(all.length, take)).length;
    const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((run) => run[0].length + 1)));
    const names = sharing.get(other) ?? [];
    const why = names.sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).slice(0, NAMES_SHOWN).map(([name]) => name).join(', ');
    names_.push(other);
    out.push([`### ${other} (related: shares ${names.length} names with the change: ${why})`, fence, ...all.slice(0, take).map((line, at) => `${String(at + 1).padStart(width)} ${line}`), ...(all.length > take ? [`… (first ${take} lines shown; ${all.length - take} more not included)`] : []), fence, '']);
  }
  return { blocks: out, names: names_, omitted };
};

// The saved policy payload of this step's own policy.stage call, when the route ran one.
let rules = '(none resolved)';
try {
  const saved = readdirSync(input.steps).filter((name) => name.endsWith('-policy-before-work-review.md')).sort();
  const text = saved.length === 0 ? '' : (read(path.join(input.steps, saved.at(-1))) ?? '').trim();
  if (text !== '') rules = text;
} catch { /* no steps directory: no policy text */ }

const conventionsFile = path.join(input.repositoryRoot, '.ambicode', 'context', 'conventions.md');
const conventions = read(conventionsFile);
const target = result.target ?? {};
// The reviewed iteration's checks, the latest run per key: an earlier iteration's red run is not this change's result.
const checks = [...new Map(entries.filter((candidate) => candidate.kind === 'check' && candidate.route === entry.route).map((check) => [check.key, check])).values()];
const plan = read(path.join(reviewDir, 'plan-iteration.md'));

// Other people's notes on the merge request, from mr-discussions.json beside the ledger. Unresolved first: those are the open points a finding would repeat.
// Caps are bounds, not measurements: real discussions were short (76 chars at most); 20 x 400 chars stays near 8 KB next to a 50 KB brief.
const DISCUSSIONS_MAX = 20;
const DISCUSSION_BODY_CHARS = 400;
const oneLine = (text) => { const flat = text.replace(/\s+/g, ' ').trim(); return flat.length > DISCUSSION_BODY_CHARS ? `${flat.slice(0, DISCUSSION_BODY_CHARS)}…` : flat; };
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
  const shown = ordered.slice(0, DISCUSSIONS_MAX).flatMap((discussion) => {
    const [first, ...replies] = discussion.notes ?? [];
    if (first === undefined) return [];
    const place = discussion.path === null || discussion.path === undefined ? 'general' : `${discussion.path}${discussion.line == null ? '' : `:${discussion.line}`}`;
    return [`- ${place}${discussion.resolved === true ? ' (resolved)' : ''} @${first.author}: ${oneLine(String(first.body))}`, ...replies.map((note) => `  - @${note.author}: ${oneLine(String(note.body))}`)];
  });
  return [...head, ...shown, ...(ordered.length > DISCUSSIONS_MAX ? [`… (${ordered.length - DISCUSSIONS_MAX} more discussions omitted)`] : []), ''];
};
// The commit list says who made a change (a bot's sync commit is not a hand edit); the reviewer reads the authors itself, so nothing here interprets a name.
const COMMITS_MAX = 30;
const commitLines = () => {
  const raw = read(path.join(input.taskDir, 'mr-commits.json'));
  if (raw === null) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { error: 'mr-commits.json is unreadable' }; }
  const head = ['## Commits of this merge request (untrusted, from other people): short sha, author, title', ''];
  if (typeof parsed.error === 'string') return [...head, `(not fetched: ${oneLine(parsed.error)}; who made a change is unknown)`, ''];
  const all = Array.isArray(parsed.commits) ? parsed.commits : [];
  if (all.length === 0) return [];
  return [...head, ...all.slice(0, COMMITS_MAX).map((commit) => `- ${commit.sha} ${oneLine(String(commit.author))}: ${oneLine(String(commit.title))}`), ...(all.length > COMMITS_MAX ? [`… (${all.length - COMMITS_MAX} more commits)`] : []), ''];
};
// A tracker capture is JSON: its description was about a third of the bytes, the rest wrapper metadata and API URLs.
// The requirement is the title and the description (or body) found in it; anything that is not JSON, or has neither, stays as captured.
const adfText = (node) => (typeof node === 'string' ? node : node === null || typeof node !== 'object' ? '' : typeof node.text === 'string' ? node.text : Array.isArray(node.content) ? node.content.map(adfText).join(['paragraph', 'heading', 'listItem', 'bulletList', 'orderedList', 'codeBlock'].includes(node.type) || node.type === 'doc' ? '\n' : '') : '');
const issuesIn = (value, depth = 0) => {
  if (value === null || typeof value !== 'object' || depth > 6) return [];
  const fields = value.fields !== null && typeof value.fields === 'object' ? value.fields : value;
  const summary = fields.summary ?? fields.title;
  const body = fields.description ?? fields.body;
  if ((typeof summary === 'string' || summary === undefined) && (body !== undefined && body !== null) && (typeof body === 'string' || typeof body === 'object')) return [{ key: typeof value.key === 'string' ? value.key : null, summary: summary ?? null, body: adfText(body).trim() }];
  return Object.values(value).flatMap((child) => issuesIn(child, depth + 1));
};
const requirementText = (source) => {
  let parsed;
  try { parsed = JSON.parse(source.content); } catch { return source.content; }
  const found = issuesIn(parsed);
  if (found.length === 0) return source.content;
  return found.map((issue) => `${found.length === 1 ? '' : `${issue.key ?? ''} ${issue.summary ?? ''}\n\n`}${issue.body === '' ? '(the ticket has no description)' : issue.body}`).join('\n\n');
};
// Claude Code's Read returns at most 25,000 tokens: a 59 KB brief was cut at byte 37,847, so the requirements, rules and discussions after it were never seen.
// 32 KB is 15% under that point, because tokens per byte vary with the content.
// A brief over it is written as several parts, each under it, and the work file makes the reviewer read every one: the diff is never cut for size.
const PART_BUDGET_BYTES = 32 * 1024;
// Room in each part for its own heading and the line that points at the next part.
const PART_RESERVE_BYTES = 400;
// The related files are context and the only thing cut: the whole brief stays near 60 KB and the related files beyond it are named as omitted.
const TOTAL_BUDGET_BYTES = 60 * 1024;
const bytesOf = (parts) => Buffer.byteLength(parts.join('\n')) + 1;
const RELATED_INTRO = 'Related code the patch does not show, for comparison: duplication of an existing helper and a sibling convention the change breaks are findings.';
// A merge request leaves its test files out of the diff; without this list the reviewer saw no spec and reported "no test covers it" for changes that added several.
const TEST_FILES_MAX = 30;
const testFileLines = () => {
  const tests = (result.changedFiles ?? []).filter((file) => typeof file.exclusionReason === 'string' && file.exclusionReason.startsWith('test code'));
  if (tests.length === 0) return [];
  return ['## Test files changed in this merge request (not under review, content not shown)', '', ...tests.slice(0, TEST_FILES_MAX).map((file) => `- ${file.newPath ?? file.oldPath} +${file.addedLines}/-${file.removedLines}`), ...(tests.length > TEST_FILES_MAX ? [`… (${tests.length - TEST_FILES_MAX} more)`] : []), ''];
};
const LINE_NUMBERS = 'Each diff line starts with its file line number (new side for + and context lines, old side for - lines): a finding names that number, not a position in this brief.';
const front = [
  `# Review brief ${result.reviewId ?? ''}`, '',
  `Target: ${target.kind}${target.baseRef ? ` against ${target.baseRef}` : ''} (${target.snapshotId}).`,
  diffOnly ? `This is a merge request whose head is not checked out: the working tree is not its code, so read nothing there; the patch below is all of the change you have. ${LINE_NUMBERS}` : checkoutRoot !== input.repositoryRoot ? `The patch is below; the rest of the code is in the checkout of the merge request head at ${checkoutRoot}: Read, Grep and Glob there, not in the working directory. ${LINE_NUMBERS}` : `The patch is below; the rest of the code is in the checkout. ${LINE_NUMBERS}`,
  'A finding may name only a line listed below, on the side listed. Any other line is dropped with its finding and the review stays partial.', '',
  ...testFileLines(),
  '## Requirements', '', ...((result.requirements ?? []).length === 0 ? ['(none supplied: quality review)'] : result.requirements.flatMap((source) => [`### ${source.id}: ${source.title}`, requirementText(source), ''])),
  ...commitLines(),
  ...discussionLines(),
  '## Policy rules', '', rules, '',
  '## Project conventions', '', `Source: ${conventionsFile}`, '', conventions?.trim() ? conventions.trim().replace(/^#/gm, '###') : '(none recorded)', '',
  ...(plan === null ? [] : ['## Plan for this iteration', '', plan.trim(), '']),
  '## Check results', '', ...(checks.length === 0 ? ['No check recorded for this task: nothing was verified by execution. That is a gap, not a pass.'] : checks.map((check) => `- ${check.key}: ${check.exit === 0 ? 'passed' : `FAILED (exit ${check.exit})`}${(check.files ?? []).length === 0 ? '' : `; on: ${check.files.join(' ')}`}${check.exit === 0 ? '' : `; last output:\n\`\`\`\n${String(check.tail ?? '').split('\n').slice(-12).join('\n')}\n\`\`\``}`)), '',
];
const related_ = related();
// Parts are packed in order: the front matter, the diff file by file, then the related files. A file that does not fit what is left of a part but fits a part of its own starts the next one;
// a larger file is split at a hunk boundary, and at a row boundary only when one hunk is larger than a part.
// Front matter that alone exceeds a part (a long requirement or conventions file) is split across the first parts on line boundaries; one that fits stays whole in part 1.
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
// The related files that keep the whole brief under the total budget, in related()'s rank order.
const relatedUsed = () => parts.reduce((sum, lines) => sum + bytesOf(lines), splitFront ? bytesOf(frontHead) : bytesOf(front));
let relatedKept = 0;
let relatedBytes = relatedUsed() + bytesOf(['## Related files (not in the diff)', '', RELATED_INTRO, '']);
for (const block of related_.blocks) { if (relatedBytes + bytesOf(block) > TOTAL_BUDGET_BYTES) break; relatedBytes += bytesOf(block); relatedKept++; }
const droppedRelated = [...related_.names.slice(relatedKept), ...related_.omitted];
if (relatedKept === 0 && droppedRelated.length > 0) place(['related files: none (brief size budget reached)', '']);
else if (relatedKept > 0 || droppedRelated.length > 0) {
  place(['## Related files (not in the diff)', '', RELATED_INTRO, '']);
  for (const block of related_.blocks.slice(0, relatedKept)) { if (!fits(block) && parts.at(-1).length > 0) nextPart(); place(block); }
  if (droppedRelated.length > 0) place([`… (${droppedRelated.length} related file${droppedRelated.length === 1 ? '' : 's'} omitted (size budget): ${droppedRelated.join(', ')})`, '']);
}
// The cut is context, not a coverage gap: it is recorded as scope here so the reviewer's own notes do not carry it into "Needs attention". A rerun replaces the note.
const CUT_NOTE = ' related file';
const scopeNote = droppedRelated.length === 0 ? null : relatedKept === 0 ? "no related file fit the brief's size budget, so none was read." : `${droppedRelated.length} related file${droppedRelated.length === 1 ? ' was' : 's were'} cut from the brief (size budget) and not read: ${droppedRelated.join(', ')}.`;
if (Array.isArray(result.omissions) || scopeNote !== null) {
  const kept = (result.omissions ?? []).filter((entry) => !(entry.kind === 'scope' && (entry.text.includes(CUT_NOTE) && entry.text.includes('size budget'))));
  writeFileSync(resultFile, `${JSON.stringify({ ...result, omissions: scopeNote === null ? kept : [...kept, { kind: 'scope', text: scopeNote }] }, null, 2)}\n`);
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
