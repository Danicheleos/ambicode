// Retrieval metrics of one run: which files its final answer names, scored against the case's known sets.
// Two sources, both explicit claims rather than every path the text mentions (answers name decoys to rule them out):
// - `files-section`: the paths under a `## Files` heading (the case's prompt asks for that section);
// - `files-block`: the paths in the first ```files block (the map cases' truth.source label);
// - `citations`: every `path:line` citation.
import path from 'node:path';
import { events } from './trace.mjs';

/** The main session's last text: the answer the user reads. */
export function finalTextOf(traceText) {
  let last = '';
  for (const event of events(traceText)) {
    if (event.type !== 'assistant' || event.parent_tool_use_id) continue;
    const text = (event.message?.content ?? []).filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim();
    if (text) last = text;
  }
  return last;
}

const PATH = /(?:^|[\s`*([])((?:\/|\.\/)?[\w@.-]+(?:\/[\w@.-]+)*\.[A-Za-z0-9]+)(:\d+(?:[-–]\d+)?)?/g;

/** Repository-relative: drops `./`, a leading `repo/` and anything up to `/repo/` (absolute sandbox paths). */
export function normalize(file) {
  let out = file.replace(/\\/g, '/').replace(/^\.\//, '');
  const at = out.lastIndexOf('/repo/');
  if (at >= 0) out = out.slice(at + '/repo/'.length);
  else if (out.startsWith('repo/')) out = out.slice('repo/'.length);
  return path.posix.normalize(out);
}

export function foundPaths(text, source) {
  let body = text;
  if (source === 'files-section') {
    const lines = text.split('\n');
    // Exactly `Files`: "Files that look relevant but are not" is another section. The last one is the answer's closing list.
    const start = lines.findLastIndex((line) => /^#{1,6}\s*files\s*:?\s*$/i.test(line.trim()));
    if (start < 0) return null; // no section: the run broke the contract, which is not an empty list
    const end = lines.findIndex((line, index) => index > start && /^#{1,6}\s/.test(line.trim()));
    body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
  }
  if (source === 'files-block') {
    const block = /```files[ \t]*\r?\n([\s\S]*?)```/.exec(text);
    if (block === null) return null;
    body = block[1];
  }
  const found = new Set();
  if (source === 'files-block') {
    // A line naming a directory (trailing `/`, or a bare extensionless path): kept with one trailing `/`, the directory-item form.
    const rest = [];
    for (const line of body.split('\n')) {
      const entry = line.trim().replace(/^[-*]\s+/, '').replace(/^`|`$/g, '');
      if (/^(?:\.\/)?[\w@.-]+(?:\/[\w@.-]+)*\/$/.test(entry) || /^(?:\.\/)?[\w@-]+(?:\/[\w@-]+)+$/.test(entry)) found.add(`${normalize(entry).replace(/\/$/, '')}/`);
      else rest.push(line);
    }
    body = rest.join('\n');
  }
  for (const match of body.matchAll(PATH)) {
    if (source === 'citations' && match[2] === undefined) continue;
    found.add(normalize(match[1]));
  }
  return [...found].sort();
}

const ratio = (a, b) => (b === 0 ? null : Number((a / b).toFixed(3)));

/**
 * `relevant` are the files a right answer names; `allowed` may be named without being wrong (neither hit nor miss).
 * Recall: share of relevant named. Precision: share of named that are relevant or allowed. Null when undefined.
 * An `allowed` item ending in `/` allows every file under that directory (a repository's tests tree).
 * `spec.ignore` (optional predicate): matching paths are dropped from the answer before precision, neither hit nor extra.
 * A `relevant` item ending in `/` is a directory item: hit by that directory in the answer (trailing `/`) or by a file directly
 * inside it. An answer directory is correct when it is a directory item or the directory of a relevant file; a file directly in
 * a directory item is correct too, since it is what satisfies the item.
 */
export function scoreFiles(spec, named) {
  const found = named === null || !spec.ignore ? named : named.filter((file) => !spec.ignore(file));
  // No list at all retrieves nothing: recall and F1 are 0, as for an empty list; precision has nothing to measure.
  if (found === null) return { found: null, missed: spec.relevant, extra: [], recall: 0, precision: null, f1: 0, contract: false };
  const relevant = new Set(spec.relevant);
  const allowed = new Set(spec.allowed ?? []);
  const allowedDirs = [...allowed].filter((item) => item.endsWith('/'));
  const dirOf = (file) => `${path.posix.dirname(file)}/`;
  const dirItems = new Set(spec.relevant.filter((item) => item.endsWith('/')));
  const fileDirs = new Set(spec.relevant.filter((item) => !item.endsWith('/')).map(dirOf));
  const isNamed = (item) => found.includes(item) || (dirItems.has(item) && found.some((file) => !file.endsWith('/') && dirOf(file) === item));
  const hits = spec.relevant.filter(isNamed);
  const extra = found.filter((file) => (file.endsWith('/') ? !dirItems.has(file) && !fileDirs.has(file) : !relevant.has(file) && !allowed.has(file) && !allowedDirs.some((dir) => file.startsWith(dir)) && !dirItems.has(dirOf(file))));
  const recall = ratio(hits.length, relevant.size);
  const precision = ratio(found.length - extra.length, found.length);
  const f1 = recall === null || precision === null || recall + precision === 0 ? (recall === 0 || precision === 0 ? 0 : null) : Number(((2 * recall * precision) / (recall + precision)).toFixed(3));
  return { found, missed: spec.relevant.filter((item) => !isNamed(item)), extra, recall, precision, f1, contract: true };
}

export const metricsOf = (spec, traceText) => scoreFiles(spec, foundPaths(finalTextOf(traceText), spec.source));
