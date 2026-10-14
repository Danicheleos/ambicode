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

// Addressable lines are every line a hunk shows (context included) on that side.
const sections = patch.split(/^(?=diff --git )/m).filter((part) => part.startsWith('diff --git '));
const files = sections.map((section) => {
  const header = (marker) => { const value = section.split('\n').find((line) => line.startsWith(marker))?.slice(4).split('\t')[0] ?? '/dev/null'; return value === '/dev/null' ? null : value.replace(/^[ab]\//, ''); };
  const [oldPath, newPath] = [header('--- '), header('+++ ')];
  const sides = { old: [], new: [] };
  let [o, n] = [0, 0];
  for (const line of section.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk !== null) { o = Number(hunk[1]); n = Number(hunk[2]); continue; }
    if (o === 0 && n === 0) continue;
    if (line.startsWith('+')) sides.new.push(n++);
    else if (line.startsWith('-')) sides.old.push(o++);
    else if (line.startsWith(' ')) { sides.old.push(o++); sides.new.push(n++); }
  }
  const where = newPath ?? oldPath ?? '(no path)';
  const kind = oldPath === null ? 'added' : newPath === null ? 'deleted' : oldPath === newPath ? 'modified' : 'renamed';
  return [`### ${kind === 'renamed' ? `${where} (was ${oldPath})` : where} [${kind}]`, `new-side lines: ${newPath === null ? '(file deleted)' : ranges(sides.new)}`, `old-side lines: ${oldPath === null ? '(file added)' : ranges(sides.old)}`, '```diff', section.trimEnd(), '```', ''];
});

// The saved policy payload of this step's own policy.stage call, when the route ran one.
let rules = '(none resolved)';
try {
  const saved = readdirSync(input.steps).filter((name) => name.endsWith('-policy-before-work.txt')).sort();
  const text = saved.length === 0 ? '' : (read(path.join(input.steps, saved.at(-1))) ?? '').trim();
  if (text !== '') rules = text;
} catch { /* no steps directory: no policy text */ }

// The saved payload of the review.callers step; empty when no changed declaration is used elsewhere.
let callers = '';
try {
  const saved = readdirSync(input.steps).filter((name) => name.endsWith('-review-callers.txt')).sort();
  callers = saved.length === 0 ? '' : (read(path.join(input.steps, saved.at(-1))) ?? '').trim();
} catch { /* no steps directory: no callers block */ }

const conventionsFile = path.join(input.repositoryRoot, '.ambicode', 'context', 'conventions.md');
const conventions = read(conventionsFile);
const target = result.target ?? {};
const checks = entries.filter((candidate) => candidate.kind === 'check');
const lines = [
  `# Review brief ${result.reviewId ?? ''}`, '',
  `Target: ${target.kind}${target.baseRef ? ` against ${target.baseRef}` : ''} (${target.snapshotId}).`,
  'The whole patch is below; the code is in the checkout.',
  'A finding may name only a line listed below, on the side listed. Any other line is dropped with its finding and the review stays partial.', '',
  '## Changed files', '', ...files.flat(),
  ...(callers === '' ? [] : ['## Callers outside the diff', '', 'Where the changed declarations are used elsewhere (by name; check each still holds):', callers, '']),
  '## Policy rules', '', rules, '',
  '## Project conventions', '', `Source: ${conventionsFile}`, '', conventions?.trim() ? conventions.trim().replace(/^#/gm, '###') : '(none recorded)', '',
  '## Requirements', '', ...((result.requirements ?? []).length === 0 ? ['(none supplied: quality review)'] : result.requirements.flatMap((source) => [`### ${source.id}: ${source.title}`, source.content, ''])),
  '## Check results', '', ...(checks.length === 0 ? ['No check recorded for this task: nothing was verified by execution. That is a gap, not a pass.'] : checks.map((check) => `- ${check.key} ${check.phase}: exit ${check.exit}${(check.files ?? []).length === 0 ? '' : `; on: ${check.files.join(' ')}`}${check.exit === 0 ? '' : ` FAILED; last output:\n\`\`\`\n${String(check.tail ?? '').split('\n').slice(-12).join('\n')}\n\`\`\``}`)), '',
];
writeFileSync(path.join(reviewDir, 'brief.md'), lines.join('\n'));
process.stdout.write(JSON.stringify({ payload: `brief: ${path.join(reviewDir, 'brief.md')}` }));
}
