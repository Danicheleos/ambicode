// brief.md for the reviewer: the diff with the line numbers a finding may name, then policy rules, requirements and checks.
// A finding that names any other line is dropped, so the ranges come from the hunks, not from the model.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
const files = sections.map((section) => {
  const header = (marker) => { const value = section.split('\n').find((line) => line.startsWith(marker))?.slice(4).split('\t')[0] ?? '/dev/null'; return value === '/dev/null' ? null : value.replace(/^[ab]\//, ''); };
  const [oldPath, newPath] = [header('--- '), header('+++ ')];
  const sides = { old: [], new: [] };
  const rows = [];
  let [o, n] = [0, 0];
  for (const line of section.trimEnd().split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk !== null) { o = Number(hunk[1]); n = Number(hunk[2]); rows.push([null, line]); continue; }
    if (o === 0 && n === 0) { rows.push([null, line]); continue; }
    if (line.startsWith('+')) { sides.new.push(n); rows.push([n++, line]); }
    else if (line.startsWith('-')) { sides.old.push(o); rows.push([o++, line]); }
    else if (line.startsWith(' ')) { sides.old.push(o++); sides.new.push(n); rows.push([n++, line]); }
    else rows.push([null, line]);
  }
  const width = String(Math.max(0, ...sides.old, ...sides.new)).length;
  const shown = rows.map(([at, line]) => (at === null ? line : `${String(at).padStart(width)} ${line}`));
  const where = newPath ?? oldPath ?? '(no path)';
  const kind = oldPath === null ? 'added' : newPath === null ? 'deleted' : oldPath === newPath ? 'modified' : 'renamed';
  return [`### ${kind === 'renamed' ? `${where} (was ${oldPath})` : where} [${kind}]`, `new-side lines: ${newPath === null ? '(file deleted)' : ranges(sides.new)}`, `old-side lines: ${oldPath === null ? '(file added)' : ranges(sides.old)}`, '```diff', ...shown, '```', ''];
});

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
const lines = [
  `# Review brief ${result.reviewId ?? ''}`, '',
  `Target: ${target.kind}${target.baseRef ? ` against ${target.baseRef}` : ''} (${target.snapshotId}).`,
  'The whole patch is below; the code is in the checkout. Each diff line starts with its file line number (new side for + and context lines, old side for - lines): a finding names that number, not a position in this brief.',
  'A finding may name only a line listed below, on the side listed. Any other line is dropped with its finding and the review stays partial.', '',
  '## Changed files', '', ...files.flat(),
  '## Policy rules', '', rules, '',
  '## Project conventions', '', `Source: ${conventionsFile}`, '', conventions?.trim() ? conventions.trim().replace(/^#/gm, '###') : '(none recorded)', '',
  '## Requirements', '', ...((result.requirements ?? []).length === 0 ? ['(none supplied: quality review)'] : result.requirements.flatMap((source) => [`### ${source.id}: ${source.title}`, source.content, ''])),
  ...(plan === null ? [] : ['## Plan for this iteration', '', plan.trim(), '']),
  '## Check results', '', ...(checks.length === 0 ? ['No check recorded for this task: nothing was verified by execution. That is a gap, not a pass.'] : checks.map((check) => `- ${check.key}: ${check.exit === 0 ? 'passed' : `FAILED (exit ${check.exit})`}${(check.files ?? []).length === 0 ? '' : `; on: ${check.files.join(' ')}`}${check.exit === 0 ? '' : `; last output:\n\`\`\`\n${String(check.tail ?? '').split('\n').slice(-12).join('\n')}\n\`\`\``}`)), '',
];
writeFileSync(path.join(reviewDir, 'brief.md'), lines.join('\n'));
// ANSWER_FILE in src/skills/review/record-answer.ts and the guard's reviewer rule.
process.stdout.write(JSON.stringify({ payload: `brief: ${path.join(reviewDir, 'brief.md')}\nanswer: ${path.join(reviewDir, 'answer.json')}` }));
}
