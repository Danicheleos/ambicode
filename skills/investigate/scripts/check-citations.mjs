// The mechanical part of an investigation: every path:line citation in the saved note exists.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const started = Date.now();
const input = JSON.parse(readFileSync(0, 'utf8'));
const root = path.resolve(input.repositoryRoot);
const ledger = readFileSync(path.join(input.taskDir, 'ledger.jsonl'), 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
const note = ledger.findLast((entry) => entry.kind === 'note' && entry.note === 'investigation');
const body = note === undefined ? '' : readFileSync(path.resolve(root, note.path), 'utf8');
// The first ten bad citations are listed in the summary; the count is exact.
const LISTED = 10;

// An extension holds a letter: `v1.2:3` and `10.0.0.1:80` are versions and addresses, not files, and failed as missing-file.
const PATH = '[\\w@./\\\\-]+\\.(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]+';
const CITATION = new RegExp(`(?<![\\w./-])(${PATH}):(\\d+(?:\\s*[-–]\\s*\\d+)?)`, 'g');
// A model cites from the session directory, which can be the parent of the repository: `repo/src/x.ts`.
const sessionDir = typeof input.cwd === 'string' ? path.resolve(input.cwd) : null;
const fromSession = (file) => {
  if (sessionDir === null) return null;
  const relative = path.relative(root, path.resolve(sessionDir, file.replaceAll('\\', '/')));
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative) ? null : relative;
};
// Stage A traces: 7 of 10 plugin runs cited a bare `Wiring.kt:42`-style name. A name or partial path that is the tail of
// exactly one repository file is unambiguous, so it is rewritten to the full path instead of failing as missing-file.
// git first; a plain walk when git cannot run (the eval sandbox's git shim fails).
let tracked = null;
const repositoryFiles = () => {
  if (tracked !== null) return tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).split('\0').filter((name) => name !== '');
  } catch {
    tracked = [];
    const walk = (dir) => {
      for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.ambicode') continue;
        const rel = dir === '' ? entry.name : `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel); else tracked.push(rel);
      }
    };
    try { walk(''); } catch { /* keep what was found */ }
  }
  return tracked;
};
const uniqueTail = (file) => {
  const tail = file.replaceAll('\\', '/').replace(/^\.\//, '');
  const hits = repositoryFiles().filter((name) => name === tail || name.endsWith(`/${tail}`));
  return hits.length === 1 ? hits[0] : null;
};
const files = new Map();
const lineCount = (abs) => {
  if (!files.has(abs)) {
    try { const lines = readFileSync(abs, 'utf8').split('\n'); files.set(abs, lines.at(-1) === '' ? lines.length - 1 : lines.length); } catch { files.set(abs, null); }
  }
  return files.get(abs);
};

const bad = [];
const resolved = [];
let badCount = 0;
let fence = false;
const rewritten = body.split('\n').map((line) => {
  if (/^\s*```/.test(line)) { fence = !fence; return line; }
  if (fence) return line;
  return line.replace(CITATION, (whole, file, spec) => {
    const [from, to = from] = spec.replace(/\s/g, '').split(/[-–]/).map(Number);
    const abs = path.resolve(root, file);
    const outside = path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || !(abs + path.sep).startsWith(root + path.sep);
    let count = outside ? undefined : lineCount(abs);
    let full = null;
    if (count === null) {
      const relative = fromSession(file);
      if (relative !== null) count = lineCount(path.resolve(root, relative));
    }
    if (count === null) {
      full = uniqueTail(file);
      if (full !== null) count = lineCount(path.resolve(root, full));
    }
    const reason = count === undefined ? 'outside-repository' : count === null ? 'missing-file' : from >= 1 && from <= to && to <= count ? null : `line-out-of-range (file has ${count} lines)`;
    if (reason === null) {
      if (full === null) return whole;
      resolved.push(`${file} → ${full}`);
      return `${full}:${spec}`;
    }
    badCount += 1;
    if (bad.length < LISTED) bad.push(`${file}:${spec} ${reason}`);
    return whole;
  });
}).join('\n');
if (resolved.length > 0) writeFileSync(path.resolve(root, note.path), rewritten);

const failed = badCount > 0;
const summary = { failed, anchorsBad: badCount, ...(bad.length === 0 ? {} : { anchors: bad }), ...(resolved.length === 0 ? {} : { resolved }) };
const out = { entries: [{ kind: 'worker', worker: 'check-citations', outcome: 'ran', ms: Date.now() - started, artifact: null, summary }] };
if (failed) {
  out.failed = { code: 'citations-failed', message: `${badCount} bad citations: ${bad.slice(0, 3).join('; ')}`, recoverable: true };
}
process.stdout.write(JSON.stringify(out));
