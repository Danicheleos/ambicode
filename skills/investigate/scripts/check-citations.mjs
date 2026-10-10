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

const bad = [];
let badCount = 0;
let fence = false;
for (const line of body.split('\n')) {
  if (/^\s*```/.test(line)) { fence = !fence; continue; }
  if (fence) continue;
  for (const [, file, spec] of line.matchAll(CITATION)) {
    const [from, to = from] = spec.replace(/\s/g, '').split(/[-–]/).map(Number);
    const abs = path.resolve(root, file);
    const count = (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || !(abs + path.sep).startsWith(root + path.sep)) ? undefined : lineCount(abs);
    const reason = count === undefined ? 'outside-repository' : count === null ? 'missing-file' : from >= 1 && from <= to && to <= count ? null : `line-out-of-range (file has ${count} lines)`;
    if (reason === null) continue;
    badCount += 1;
    if (bad.length < LISTED) bad.push(`${file}:${spec} ${reason}`);
  }
}

const failed = badCount > 0;
const summary = { failed, anchorsBad: badCount, ...(bad.length === 0 ? {} : { anchors: bad }) };
const out = { entries: [{ kind: 'worker', worker: 'check-citations', outcome: 'ran', ms: Date.now() - started, artifact: null, summary }] };
if (failed) {
  out.failed = {
    code: 'citations-failed',
    message: `${badCount} bad citations.`,
    recoverable: true,
    revise: { args: { 'Citation check failed': bad.map((line) => `bad citation: ${line}`) }, lastRound: 'This is the last revision: the answer goes to the user as it is.' },
  };
}
process.stdout.write(JSON.stringify(out));
