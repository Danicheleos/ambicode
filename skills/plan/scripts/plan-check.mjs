// The mechanical part of reviewing a plan draft: every path:line anchor exists.
// With the `resolve` param it runs before the draft is saved and completes a partial path that names exactly one
// tracked file: a bare `service.ts:4` failed the check, and the model patched the body instead of rewriting it.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const started = Date.now();
const input = JSON.parse(readFileSync(0, 'utf8'));
// The line after the last one is an append point: 9 of 14 bad anchors in eval plans were exactly that.
const inRange = (from, to, count) => from >= 1 && from <= to && to <= count + 1;
const root = path.resolve(input.repositoryRoot);
const bodyFile = path.join(input.steps, 'plan-body.md');
let body;
try {
  body = readFileSync(bodyFile, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  // A rejected Write leaves no file; an uncaught ENOENT exited 1 and the route sent the model back with nothing to act on.
  const message = `${bodyFile} does not exist: Write the plan there with the Write tool, then run the Then command.`;
  process.stdout.write(JSON.stringify({ entries: [], failed: { code: 'plan-body-missing', message, recoverable: true, revise: { args: { 'plan body': [message] } } } }));
  process.exit(0);
}
// The first ten bad anchors are listed, enough for one fix round; the count is exact.
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

if (input.params?.[0] === 'resolve') {
  let tracked = null;
  const resolved = [];
  // Several files share a name: the one in a directory the plan already anchors is the one meant.
  const cited = new Set([...body.matchAll(ANCHOR)].map(([, file]) => file).filter((file) => !path.isAbsolute(file) && lineCount(path.resolve(root, file)) !== null).map((file) => path.posix.dirname(file.replace(/\\/g, '/'))));
  const text = body.split('\n').map((line, at, all) => {
    const fenced = all.slice(0, at).filter((before) => /^\s*```/.test(before)).length % 2 === 1;
    if (fenced || /^\s*```/.test(line)) return line;
    return line.replace(ANCHOR, (whole, file, spec) => {
      const [from, to = from] = spec.replace(/\s/g, '').split(/[-–]/).map(Number);
      const fits = (count) => count !== null && inRange(from, to, count);
      // 9 of 10 failed checks were this form, not a missing file: an absolute path or a `<repo-dir>/` prefix.
      const slashed = file.replace(/\\/g, '/');
      const rooted = path.isAbsolute(file) ? path.relative(root, file).replace(/\\/g, '/') : slashed.startsWith(`${path.basename(root)}/`) && lineCount(path.resolve(root, file)) === null ? slashed.slice(path.basename(root).length + 1) : null;
      if (rooted !== null && !rooted.startsWith('..') && !path.isAbsolute(rooted) && fits(lineCount(path.resolve(root, rooted)))) {
        resolved.push(`${file}:${spec} → ${rooted}:${spec}`);
        return `${rooted}:${spec}`;
      }
      if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || lineCount(path.resolve(root, file)) !== null) return whole;
      try { tracked ??= execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n'); } catch { tracked = []; }
      const suffix = `/${file.replace(/\\/g, '/').replace(/^\.\//, '')}`;
      const named = tracked.filter((candidate) => `/${candidate}`.endsWith(suffix));
      const matches = named.length > 1 ? named.filter((candidate) => cited.has(path.posix.dirname(candidate))) : named;
      const count = matches.length === 1 ? lineCount(path.join(root, matches[0])) : null;
      if (!fits(count)) return whole;
      resolved.push(`${file}:${spec} → ${matches[0]}:${spec}`);
      return `${matches[0]}:${spec}`;
    });
  }).join('\n');
  if (resolved.length > 0) writeFileSync(path.join(input.steps, 'plan-body.md'), text);
  const entries = resolved.length === 0 ? [] : [{ kind: 'worker', worker: 'plan-anchors', outcome: 'ran', ms: Date.now() - started, artifact: null, reason: `resolved: ${resolved.join('; ')}`.slice(0, 500) }];
  process.stdout.write(JSON.stringify({ entries }));
  process.exit(0);
}

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
    const reason = count === undefined ? 'outside-repository' : count === null ? 'missing-file' : inRange(from, to, count) ? null : `line-out-of-range (file has ${count} lines)`;
    if (reason === null) continue;
    anchorsBad += 1;
    if (badAnchors.length < LISTED) badAnchors.push(`${file}:${spec} ${reason}`);
  }
}

const failed = anchorsBad > 0;
const summary = { failed, anchorsBad, ...(badAnchors.length === 0 ? {} : { anchors: badAnchors }) };
const out = { entries: [{ kind: 'worker', worker: 'plan-check', outcome: 'ran', ms: Date.now() - started, artifact: null, summary }] };
if (failed) out.failed = { code: 'plan-check-failed', message: `${anchorsBad} bad anchors: ${badAnchors.slice(0, 3).join('; ')}`, recoverable: true, revise: { args: { 'bad anchors': badAnchors } } };
process.stdout.write(JSON.stringify(out));
