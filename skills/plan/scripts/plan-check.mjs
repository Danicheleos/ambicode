// The mechanical part of reviewing a plan draft: every path:line anchor exists.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const started = Date.now();
const input = JSON.parse(readFileSync(0, 'utf8'));
const root = path.resolve(input.repositoryRoot);
const body = readFileSync(path.join(input.steps, 'plan-body.md'), 'utf8');
// The first ten bad anchors are listed to the model; the count is exact. Ten fit one revise section.
const LISTED = 10;

const PATH = '[\\w@./\\\\-]+\\.[A-Za-z0-9]+';
const ANCHOR = new RegExp(`(?<![\\w./-])(${PATH}):(\\d+(?:\\s*[-–]\\s*\\d+)?)`, 'g');
const files = new Map();
const lineCount = (abs) => {
  if (!files.has(abs)) {
    try { const lines = readFileSync(abs, 'utf8').split('\n'); files.set(abs, lines.at(-1) === '' ? lines.length - 1 : lines.length); } catch { files.set(abs, null); }
  }
  return files.get(abs);
};

const badAnchors = [];
let anchorsBad = 0;
let fence = false;
for (const line of body.split('\n')) {
  if (/^\s*```/.test(line)) { fence = !fence; continue; }
  if (fence) continue;
  for (const [, file, spec] of line.matchAll(ANCHOR)) {
    const [from, to = from] = spec.replace(/\s/g, '').split(/[-–]/).map(Number);
    const abs = path.resolve(root, file);
    const count = (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || !(abs + path.sep).startsWith(root + path.sep)) ? undefined : lineCount(abs);
    const reason = count === undefined ? 'outside-repository' : count === null ? 'missing-file' : from >= 1 && from <= to && to <= count ? null : `line-out-of-range (file has ${count} lines)`;
    if (reason === null) continue;
    anchorsBad += 1;
    if (badAnchors.length < LISTED) badAnchors.push(`${file}:${spec} ${reason}`);
  }
}

const failed = anchorsBad > 0;
const summary = { failed, anchorsBad, ...(badAnchors.length === 0 ? {} : { anchors: badAnchors }) };
const out = { entries: [{ kind: 'worker', worker: 'plan-check', outcome: 'ran', ms: Date.now() - started, artifact: null, summary }] };
if (failed) {
  const lines = badAnchors.map((line) => `bad anchor: ${line}`);
  out.failed = {
    code: 'plan-check-failed',
    message: `${anchorsBad} bad anchors.`,
    recoverable: true,
    revise: { args: { 'Plan check failed': lines }, lastRound: 'This is the last revision: the next draft goes to the user as it is, with the failures listed.' },
  };
}
process.stdout.write(JSON.stringify(out));
