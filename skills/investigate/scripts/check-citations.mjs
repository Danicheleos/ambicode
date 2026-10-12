// The mechanical part of an investigation: every path:line citation in the saved note exists.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const started = Date.now();
const input = JSON.parse(readFileSync(0, 'utf8'));
const root = path.resolve(input.repositoryRoot);
const ledger = readFileSync(path.join(input.taskDir, 'ledger.jsonl'), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
const note = ledger.findLast((entry) => entry.kind === 'note' && entry.note === 'investigation');
const body = note === undefined ? '' : readFileSync(path.resolve(root, note.path), 'utf8');
// The first ten bad citations are listed to the model; the count is exact. Ten fit one revise section.
const LISTED = 10;

const PATH = '[\\w@./\\\\-]+\\.[A-Za-z0-9]+';
const CITATION = new RegExp(`(?<![\\w./-])(${PATH}):(\\d+(?:\\s*[-–]\\s*\\d+)?)`, 'g');
const files = new Map();
const lineCount = (abs) => {
  if (!files.has(abs)) {
    try { const lines = readFileSync(abs, 'utf8').split('\n'); files.set(abs, lines.at(-1) === '' ? lines.length - 1 : lines.length); } catch { files.set(abs, null); }
  }
  return files.get(abs);
};

const cited = [];
let fence = false;
for (const line of body.split('\n')) {
  if (/^\s*```/.test(line)) { fence = !fence; continue; }
  if (!fence) cited.push(...line.matchAll(CITATION));
}
// A bare `service.ts:4` after `src/invoices/service.ts:3-5` names that file; the note's own full citations are the only place it may resolve.
const fullByName = new Map();
for (const [, file] of cited) {
  if (!/[\\/]/.test(file)) continue;
  const name = file.split(/[\\/]/).at(-1);
  fullByName.set(name, new Set([...(fullByName.get(name) ?? []), file]));
}

const bad = [];
let badCount = 0;
let resolved = 0;
for (const [, cite, spec] of cited) {
  let file = cite;
  const [from, to = from] = spec.replace(/\s/g, '').split(/[-–]/).map(Number);
  let abs = path.resolve(root, file);
  let ambiguous = null;
  if (!/[\\/]/.test(file) && lineCount(abs) === null) {
    const same = [...(fullByName.get(file) ?? [])];
    if (same.length === 1) { file = same[0]; abs = path.resolve(root, file); resolved += 1; }
    else if (same.length > 1) ambiguous = same;
  }
  const count = (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || !(abs + path.sep).startsWith(root + path.sep)) ? undefined : lineCount(abs);
  const reason = ambiguous !== null ? `ambiguous-file (${ambiguous.join(', ')})` : count === undefined ? 'outside-repository' : count === null ? 'missing-file' : from >= 1 && from <= to && to <= count ? null : `line-out-of-range (file has ${count} lines)`;
  if (reason === null) continue;
  badCount += 1;
  if (bad.length < LISTED) bad.push(`${cite}:${spec} ${reason}`);
}

const failed = badCount > 0;
const summary = { failed, anchorsBad: badCount, ...(resolved > 0 ? { resolved } : {}), ...(bad.length === 0 ? {} : { anchors: bad }) };
const out = { entries: [{ kind: 'worker', worker: 'check-citations', outcome: 'ran', ms: Date.now() - started, artifact: null, summary }] };
if (failed) {
  out.failed = {
    code: 'citations-failed',
    message: `${badCount} bad citations.`,
    recoverable: true,
    revise: { args: { 'Citation check failed': bad.map((line) => `bad citation: ${line}`) }, lastRound: 'This is the last revision. Save the corrected note again with the same command; the answer then goes to the user as it is.' },
  };
}
process.stdout.write(JSON.stringify(out));
