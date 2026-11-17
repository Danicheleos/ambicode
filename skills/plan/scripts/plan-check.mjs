// Runs after the model's Write of the draft. It completes a partial path that names exactly one tracked file (a bare `service.ts:4`,
// an elided `a/.../b.kt`, an absolute or repository-prefixed path), so the plan the critic and the human read has real paths.
// It then lists the plan's absence and "only" claims with their backing search: the plan critic checks that list instead of picking its own targets.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { anchorPattern, BACKING, isAbsence, sentencesOf } from '../../investigate/scripts/anchors.mjs';

const started = Date.now();
const input = JSON.parse(readFileSync(0, 'utf8'));
// A path is rewritten only when its line range fits the file it resolves to; the line after the last one is allowed, an append point.
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
  process.stdout.write(JSON.stringify({ entries: [], failed: { code: 'plan-body-missing', message, recoverable: true } }));
  process.exit(0);
}

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

const resolved = [];
// Several files share a name: the one in a directory the plan already anchors is the one meant.
const cited = new Set(lines.filter(({ fenced }) => !fenced).flatMap(({ line }) => [...line.matchAll(ANCHOR)].map(([, file]) => file)).filter((file) => !path.isAbsolute(file) && lineCount(path.resolve(root, file)) !== null).map((file) => path.posix.dirname(file.replace(/\\/g, '/'))));
const text = lines.map(({ line, fenced }) => {
  if (fenced) return line;
  return line.replace(ANCHOR, (whole, file, spec) => {
    const [from, to = from] = spec.replace(/\s/g, '').split(/[-–]/).map(Number);
    const fits = (count) => count !== null && inRange(from, to, count);
    // An absolute path or a `<repo-dir>/` prefix names a file that exists, only not as written relative to the root.
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
const entries = resolved.length === 0 ? [] : [{ kind: 'worker', worker: 'plan-anchors', outcome: 'ran', ms: Date.now() - started, artifact: null, reason: `resolved: ${resolved.join('; ')}` }];

// A token is an identifier when it is CamelCase, snake_case, a path or a dotted file name.
const IDENTIFIER = /[A-Za-z_][\w.-]*(?:\/[\w.-]+)+\.\w+|[A-Za-z_]\w*(?:\.\w{2,})+|[A-Za-z_][A-Za-z0-9_]{3,}/g;
const identifiersOf = (sentence) => [...new Set((sentence.match(IDENTIFIER) ?? []).filter((token) => /[/.]|^.+[A-Z_]/.test(token)))];
// A removal names what goes: a backticked or dotted name beside the verb (delete, removing, is dropped from, `X` is removed). The spans are numbered, not dropped, so a verb inside code stays no claim.
// A name is a claim's target only with a path, a capital or an underscore in it: `x`, `config.yaml` and `console.log` were claims in the review of cd9bece4 (`x` printed "hits: no identifier"); lowercase dotted names are indistinguishable from `user.name`, a trade made on purpose.
const VERB = '(?:delet(?:e|es|ed|ing)|remov(?:e|es|ed|ing)|drop(?:s|ped|ping)?)';
const PASSIVE = '(?:is|are|be|gets?)\\s+(?:deleted|removed|dropped)';
const NAME = '(`\\d+`|[A-Za-z_]\\w*\\.\\w{2,})';
const REMOVALS = [`\\b${VERB}\\s+(?:the\\s+)?${NAME}`, `\\b${PASSIVE}\\s+from\\s+${NAME}`, `${NAME}[^.;]{0,40}\\b${PASSIVE}\\b`].map((source) => new RegExp(source, 'gi'));
const removes = (sentence) => {
  const spans = [];
  const masked = sentence.replace(/`([^`]*)`/g, (_, code) => `\`${spans.push(code) - 1}\``);
  return REMOVALS.some((pattern) => [...masked.matchAll(pattern)].some(([, name]) => identifiersOf(name.startsWith('`') ? spans[Number(name.slice(1, -1))] : name).some((id) => /[/A-Z_]/.test(id))));
};
const isClaim = (sentence) => isAbsence(sentence) || removes(sentence);
// The plan format's own label (`- *Goal*:`) is not part of the sentence after it.
const LABEL = /^\s*(?:[-*]\s+)?\*(?:Checks|Goal|Test)\*:?\s*/;

let section = '';
const claims = [];
text.split('\n').forEach((line, index) => {
  const heading = lines[index].fenced ? null : /^##\s+(.+?)\s*$/.exec(line);
  if (heading !== null) section = heading[1];
  if (lines[index].fenced || /^#/.test(line) || /^requirements$/i.test(section)) return;
  for (const raw of sentencesOf(line.replace(LABEL, ''))) {
    const sentence = raw.replace(/^[\s>*-]+/, '').replace(/\s+/g, ' ').trim();
    if (isClaim(sentence)) claims.push({ line: index + 1, sentence, backing: BACKING.exec(sentence)?.[0] ?? null });
  }
});
const unbacked = claims.filter((claim) => claim.backing === null).length;
// Hits are found here so the critic judges lines instead of choosing a scope: in the 2026-11-15 runs it searched one file for a claim another file disproved.
// The cap equals the map's candidate cap (TOP_ROWS, src/modules/search/map.ts); the total is printed.
const HIT_LINES = 20;
// Untracked files count (a new file is a real caller); the run folder holds the plan, which quotes every claim.
const grepHits = (ids) => {
  try {
    return execFileSync('git', ['grep', '-n', '-w', '-I', '-F', '--untracked', ...ids.flatMap((id) => ['-e', id]), '--', ':(exclude).ambicode'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean);
  } catch (error) { return error?.status === 1 ? [] : null; }
};
const hitLine = (raw) => { const [, where, rest] = /^([^:]+:\d+):(.*)$/.exec(raw) ?? [null, raw, '']; return `     ${where}: ${rest.trim().slice(0, 120)}`; };
const hitsOf = (sentence) => {
  const ids = identifiersOf(sentence);
  if (ids.length === 0) return ['   hits: no identifier in the claim'];
  const found = grepHits(ids);
  if (found === null) return ['   hits: unavailable'];
  if (found.length === 0) return ['   hits: none'];
  return [`   hits (${found.length} total, ${Math.min(found.length, HIT_LINES)} shown):`, ...found.slice(0, HIT_LINES).map(hitLine)];
};
// The map step's candidates (steps/<n>-map.md: a legend, then one JSON line; src/modules/search/map.ts).
// Returns null when there is no map file; a read or parse error throws.
const mapRows = () => {
  const saved = readdirSync(input.steps).filter((name) => /^\d+-map\.md$/.test(name)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  if (saved.length === 0) return null;
  return readFileSync(path.join(input.steps, saved.at(-1)), 'utf8').split('\n').filter((row) => row.startsWith('{"candidates"')).flatMap((row) => JSON.parse(row).candidates);
};
// Cited by the full path, or by the bare file name when not the tail of another path (`src/a.ts` is not cited by `data.ts` or `other/a.ts`).
const isCited = (file) => text.includes(file) || new RegExp(`(^|[^\\w/.-])${path.posix.basename(file).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
// A plan metric, not a critic task: two runs (haiku, sonnet) read none of 18 listed candidates. null: no map file or an unreadable one.
const uncitedMap = () => {
  try { return mapRows()?.filter(([file]) => !isCited(file)).length ?? null; } catch { return null; }
};
entries.push({ kind: 'worker', worker: 'plan-claims', outcome: 'ran', ms: Date.now() - started, artifact: null, summary: { claims: claims.length, unbacked, uncitedMap: uncitedMap() } });
const claimRows = claims.flatMap((claim, at) => [`${at + 1}. plan.md:${claim.line} "${claim.sentence}" — backing: ${claim.backing ?? 'none'}`, ...hitsOf(claim.sentence)]);
const payload = [`## Claims to check (${claims.length})`, ...claimRows].join('\n');
process.stdout.write(JSON.stringify({ entries, payload }));
