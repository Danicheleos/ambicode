// The mechanical part of reviewing a plan draft: every path:line anchor exists. The result is recorded; nothing here sends the draft back.
// With the `resolve` param it runs after the model's Write of the draft and completes a partial path that names exactly one
// tracked file: a bare `service.ts:4` failed the check, and the model patched the body instead of rewriting it.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { anchorPattern } from '../../investigate/scripts/anchors.mjs';

const started = Date.now();
const input = JSON.parse(readFileSync(0, 'utf8'));
// The line after the last one is an append point: 9 of 14 bad anchors in eval plans were exactly that.
const inRange = (from, to, count) => from >= 1 && from <= to && to <= count + 1;
const root = path.resolve(input.repositoryRoot);
const bodyFile = path.join(input.taskDir, 'plan.md');
let body;
try {
  body = readFileSync(bodyFile, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  // A rejected Write leaves no file; an uncaught ENOENT exited 1 and the route sent the model back with nothing to act on.
  const message = `${bodyFile} does not exist: the plan was not written there.`;
  // The worker entry is what the step produces: without it the step re-ran until the engine's turn limit.
  const entries = [{ kind: 'worker', worker: 'plan-check', outcome: 'ran', ms: Date.now() - started, artifact: null, summary: { failed: true, anchorsBad: 0, anchors: [message] } }];
  process.stdout.write(JSON.stringify({ entries, failed: { code: 'plan-body-missing', message, recoverable: true } }));
  process.exit(0);
}
// The first ten bad anchors, and the first ten requirements not word for word, are listed, enough for one fix round; the counts are exact.
const LISTED = 10;

const ANCHOR = anchorPattern();
const files = new Map();
let trackedFiles = null;
const tracked = () => {
  try { trackedFiles ??= execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n'); } catch { trackedFiles = []; }
  return trackedFiles;
};
const lineCount = (abs) => {
  if (!files.has(abs)) {
    try { const lines = readFileSync(abs, 'utf8').split('\n'); files.set(abs, lines.at(-1) === '' ? lines.length - 1 : lines.length); } catch { files.set(abs, null); }
  }
  return files.get(abs);
};

// `planFences` are the plan's fenced code ranges from the engine (src/modules/evidence/task/iterations.ts): a fenced line is example text, never an anchor.
const fencedAt = (at) => (input.planFences ?? []).some(([from, to]) => at >= from && at < to);
let offset = 0;
const lines = body.split('\n').map((line) => {
  const at = offset;
  offset += line.length + 1;
  return { line, fenced: fencedAt(at) };
});

if (input.params?.[0] === 'resolve') {
  const resolved = [];
  // Several files share a name: the one in a directory the plan already anchors is the one meant.
  const cited = new Set(lines.filter(({ fenced }) => !fenced).flatMap(({ line }) => [...line.matchAll(ANCHOR)].map(([, file]) => file)).filter((file) => !path.isAbsolute(file) && lineCount(path.resolve(root, file)) !== null).map((file) => path.posix.dirname(file.replace(/\\/g, '/'))));
  const text = lines.map(({ line, fenced }) => {
    if (fenced) return line;
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
      // The model elides the middle of a long path as `a/.../b.kt`: the tracked files starting with a and ending with b.
      const elided = /^(.*?)\/?\.\.\.\/?(.*)$/.exec(slashed);
      const suffix = `/${slashed.replace(/^\.\//, '')}`;
      const named = tracked().filter((candidate) => elided === null ? `/${candidate}`.endsWith(suffix) : (elided[1] === '' || candidate.startsWith(`${elided[1]}/`)) && (elided[2] === '' || `/${candidate}`.endsWith(`/${elided[2]}`)) && candidate.length > elided[1].length + elided[2].length);
      const matches = named.length > 1 ? named.filter((candidate) => cited.has(path.posix.dirname(candidate))) : named;
      const count = matches.length === 1 ? lineCount(path.join(root, matches[0])) : null;
      if (!fits(count)) return whole;
      resolved.push(`${file}:${spec} → ${matches[0]}:${spec}`);
      return `${matches[0]}:${spec}`;
    });
  }).join('\n');
  if (resolved.length > 0) writeFileSync(bodyFile, text);
  const entries = resolved.length === 0 ? [] : [{ kind: 'worker', worker: 'plan-anchors', outcome: 'ran', ms: Date.now() - started, artifact: null, reason: `resolved: ${resolved.join('; ')}`.slice(0, 500) }];
  process.stdout.write(JSON.stringify({ entries }));
  process.exit(0);
}

// A bare name is looked up among the tracked files: several homes make it ambiguous (the file exists), one is a miss with a hint.
const homes = (file) => (file.includes('/') ? [] : tracked().filter((candidate) => candidate === file || candidate.endsWith(`/${file}`)));
const missingReason = (file) => {
  const found = homes(file);
  return found.length > 1 ? `ambiguous (candidates: ${found.join(', ')})` : found.length === 1 ? `missing-file (tracked: ${found[0]})` : 'missing-file';
};
const badAnchors = [];
let anchorsBad = 0;
for (const { line, fenced } of lines) {
  if (fenced) continue;
  for (const [, file, spec] of line.matchAll(ANCHOR)) {
    const [from, to = from] = spec.replace(/\s/g, '').split(/[-–]/).map(Number);
    const abs = path.resolve(root, file);
    const count = (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || !(abs + path.sep).startsWith(root + path.sep)) ? undefined : lineCount(abs);
    const reason = count === undefined ? 'outside-repository' : count === null ? missingReason(file) : inRange(from, to, count) ? null : `line-out-of-range (file has ${count} lines)`;
    if (reason === null) continue;
    anchorsBad += 1;
    if (badAnchors.length < LISTED) badAnchors.push(`${file}:${spec} ${reason}`);
  }
}

// In the plan's `## Requirements`, every quoted piece (or an unquoted bullet as a whole) must be in the captured ticket; a paraphrase is a miss listed beside the closest ticket line.
const plain = (text) => text.replace(/[*`]|__/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const ticketText = () => (input.captured ?? []).map((capture) => JSON.parse(readFileSync(capture.path, 'utf8')).content).join('\n');
// `planSections` are the plan's level-2 sections from the engine (src/modules/evidence/task/iterations.ts), each with its offset and starting with its heading line; fenced lines are example text.
const requirements = (input.planSections ?? []).filter(({ text }) => /^##\s+Requirements\s*$/i.test(text.split('\n')[0]));
const hasSection = requirements.length > 0;
const section = requirements.flatMap(({ start, text }) => {
  let at = start;
  return text.split('\n').flatMap((line) => {
    const here = at;
    at += line.length + 1;
    return here === start || fencedAt(here) ? [] : [line];
  });
});
// A bullet with quotes is its quoted pieces (a leading `LABEL:` inside a piece left out): the plan's own words around them are not checked.
// An unquoted bullet is its text without the trailing `(Iteration N)` or `(already met: path:line)`: the real paraphrases (eval 22-20-25) were unquoted.
const entries = section.flatMap((line) => {
  const bullet = /^\s*[-*]\s+(.+?)\s*$/.exec(line)?.[1];
  if (bullet === undefined) return [];
  const quoted = [...bullet.matchAll(/["“](.*?)["”]/g)];
  const texts = quoted.length > 0 ? quoted.map(([, piece]) => piece.replace(/^\s*[A-Za-z][\w-]*:\s*/, '')) : [bullet.replace(/(?:\s*\((?:Iterations?|already met)\b[^()]*\))+$/i, '')];
  // An empty piece would pass `includes('')` and count as checked.
  const pieces = texts.map((text) => text.replace(/\s+/g, ' ').trim()).filter((text) => text !== '');
  return pieces.length === 0 ? [] : [pieces];
});
const ticket = entries.length === 0 ? '' : ticketText();
const requirementsChecked = entries.length > 0 && ticket.trim() !== '';
const requirementsReason = requirementsChecked ? null : !hasSection ? 'no ## Requirements section' : entries.length === 0 ? 'no entries under ## Requirements' : 'no captured ticket';
const requirementsMissing = [];
const missedEntries = [];
if (requirementsChecked) {
  const haystack = plain(ticket);
  const pieces = ticket.split('\n').flatMap((line) => [line, ...line.split(/(?<=[.!?])\s+/)]).map((piece) => piece.replace(/\s+/g, ' ').trim()).filter((piece) => piece !== '');
  const words = (text) => new Set(plain(text).split(/[^\p{L}\p{N}]+/u).filter((word) => word !== ''));
  const closest = (entry) => {
    const own = words(entry);
    let best = ''; let bestScore = -1;
    for (const piece of pieces) {
      const theirs = words(piece);
      const shared = [...own].filter((word) => theirs.has(word)).length;
      const score = shared / (own.size + theirs.size - shared || 1);
      if (score > bestScore) { best = piece; bestScore = score; }
    }
    return best;
  };
  // One miss per bullet; the message names the pieces not found.
  for (const pieces of entries) {
    const missed = pieces.filter((piece) => !haystack.includes(plain(piece)));
    if (missed.length === 0) continue;
    const shown = missed.join('" and "');
    missedEntries.push(shown);
    requirementsMissing.push(`requirement not word for word: plan "${shown}" vs ticket "${closest(missed[0])}"`);
  }
}
const requirementsBad = requirementsMissing.length;

const failed = anchorsBad > 0 || requirementsBad > 0;
// The count is exact (anchorsBad, requirementsBad); an unchecked section is requirementsChecked: false, not a zero.
const summary = { failed, anchorsBad, requirementsChecked, ...(requirementsChecked ? { requirementsBad } : { requirementsReason }), ...(badAnchors.length === 0 ? {} : { anchors: badAnchors }), ...(requirementsBad === 0 ? {} : { requirements: requirementsMissing.slice(0, LISTED) }) };
const out = { entries: [{ kind: 'worker', worker: 'plan-check', outcome: 'ran', ms: Date.now() - started, artifact: null, summary }] };
// The step records a failure and the route goes on to the gate: nothing here sends the model back, and at Accept the count is recorded and the plan accepted.
if (failed && input.params?.[0] !== 'accept') {
  // Both counts lead the message: the counts stay first so a reader of the opening sees both; the report shows the whole message.
  const head = [anchorsBad > 0 ? `${anchorsBad} bad anchors` : '', requirementsBad > 0 ? `${requirementsBad} requirements not word for word` : ''].filter(Boolean).join(', ');
  const details = [...badAnchors, ...missedEntries.map((entry) => `"${entry}"`)].join('; ');
  out.failed = { code: 'plan-check-failed', message: `${head}: ${details}`, recoverable: true };
}
process.stdout.write(JSON.stringify(out));
