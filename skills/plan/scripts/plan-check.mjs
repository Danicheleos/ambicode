// The mechanical part of reviewing a plan draft: every path:line anchor exists, and every delivered rule the Changes paths reach is cited.
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
const bodyFile = path.join(input.taskDir, 'plan.md');
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

if (input.params?.[0] === 'resolve') {
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

// A bare name with a few tracked homes is a miss the model can fix in one round when it sees them; more than this is noise.
const HOMES = 3;
const homes = (file) => {
  if (file.includes('/')) return '';
  const found = tracked().filter((candidate) => candidate === file || candidate.endsWith(`/${file}`));
  return found.length === 0 || found.length > HOMES ? '' : ` (tracked: ${found.join(', ')})`;
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
    const reason = count === undefined ? 'outside-repository' : count === null ? `missing-file${homes(file)}` : inRange(from, to, count) ? null : `line-out-of-range (file has ${count} lines)`;
    if (reason === null) continue;
    anchorsBad += 1;
    if (badAnchors.length < LISTED) badAnchors.push(`${file}:${spec} ${reason}`);
  }
}

// `policy.required` (the step's previous call) recorded the delivered rules the plan's Changes paths reach. A rule is cited by a line
// `<rule-id>: applied at <path:line>` (the anchor is judged above) or `<rule-id>: not applicable: <reason>`; the rule text is not repeated.
const requiredIds = () => {
  let ids = [];
  try {
    for (const line of readFileSync(path.join(input.taskDir, 'ledger.jsonl'), 'utf8').split('\n')) {
      if (!line.includes('"required"')) continue;
      try { const entry = JSON.parse(line); if (entry.kind === 'policy' && entry.stage === 'required' && Array.isArray(entry.ids)) ids = entry.ids.map(String); } catch { /* a torn line */ }
    }
  } catch { /* no ledger: nothing required */ }
  return ids;
};
const unfenced = [];
fence = false;
for (const line of body.split('\n')) {
  if (/^\s*```/.test(line)) { fence = !fence; continue; }
  if (!fence) unfenced.push(line);
}
// A file the plan creates has no line (draft.md: "A new file has no line"): a bare path counts when nothing exists there yet and the plan names it on another line.
// An existing file still needs path:line, which the anchor check above judges.
const createdByPlan = (file, own) => lineCount(path.resolve(root, file)) === null && unfenced.some((line) => line !== own && line.includes(file));
const citedLines = (id) => {
  const head = new RegExp(`(?<![\\w/.-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\`*_]*:\\s*(applied at\\s+[\`(]?(?=${PATH})|not applicable:\\s*\\S)`);
  const place = new RegExp(`(?<![\\w./-])(${PATH})(:\\d)?`, 'g');
  return unfenced.filter((line) => {
    const found = head.exec(line);
    if (found === null) return false;
    if (found[1].startsWith('not')) return true;
    return [...line.slice(found.index + found[0].length).matchAll(place)].some(([, file, lined]) => lined !== undefined || createdByPlan(file, line));
  }).length;
};
const required = requiredIds();
const missingCitations = required.filter((id) => citedLines(id) === 0);
// One line per rule with every location on it, so the Policies section is as long as the rule list, not as long as the number of files.
const repeatedCitations = required.filter((id) => citedLines(id) > 1);

const failed = anchorsBad > 0 || missingCitations.length > 0 || repeatedCitations.length > 0;
const summary = { failed, anchorsBad, ...(badAnchors.length === 0 ? {} : { anchors: badAnchors }), ...(missingCitations.length === 0 ? {} : { policyMissing: missingCitations }), ...(repeatedCitations.length === 0 ? {} : { policyRepeated: repeatedCitations }) };
const out = { entries: [{ kind: 'worker', worker: 'plan-check', outcome: 'ran', ms: Date.now() - started, artifact: null, summary }] };
// At Accept the user has seen the failure (or edited the file since): the count is recorded and the plan accepted, so Accept has no loop.
if (failed && input.params?.[0] !== 'accept') {
  const message = [anchorsBad > 0 ? `${anchorsBad} bad anchors: ${badAnchors.slice(0, 3).join('; ')}` : '', missingCitations.length > 0 ? `${missingCitations.length} policy rules not cited: ${missingCitations.join(', ')}` : '', repeatedCitations.length > 0 ? `${repeatedCitations.length} policy rules cited on more than one line: ${repeatedCitations.join(', ')}` : ''].filter((part) => part !== '').join('; ');
  const args = { ...(anchorsBad > 0 ? { 'bad anchors': badAnchors } : {}), ...(missingCitations.length + repeatedCitations.length > 0 ? { 'policy citations': [...(missingCitations.length > 0 ? [`Add one line each under Policies: \`<rule-id>: applied at <path:line>\` or \`<rule-id>: not applicable: <reason>\`.`, ...missingCitations] : []), ...(repeatedCitations.length > 0 ? [`Merge into one line per rule, every location on it: \`<rule-id>: applied at <path:line>, <path:line>\`.`, ...repeatedCitations] : [])] } : {}) };
  out.failed = { code: 'plan-check-failed', message, recoverable: true, revise: { args } };
}
process.stdout.write(JSON.stringify(out));
