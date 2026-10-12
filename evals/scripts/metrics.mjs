// Retrieval metrics of one run: which files its final answer names, scored against the case's known sets.
// Two sources, both explicit claims rather than every path the text mentions (answers name decoys to rule them out):
// - `files-section`: the paths under a `## Files` heading (the case's prompt asks for that section);
// - `citations`: every `path:line` citation.
import path from 'node:path';

/** The main session's last text: the answer the user reads. */
export function finalTextOf(traceText) {
  let last = '';
  for (const line of traceText.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
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
    const start = lines.findIndex((line) => /^#{1,6}\s*files\b/i.test(line.trim()));
    if (start < 0) return null; // no section: the run broke the contract, which is not an empty list
    const end = lines.findIndex((line, index) => index > start && /^#{1,6}\s/.test(line.trim()));
    body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
  }
  const found = new Set();
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
 */
export function scoreFiles(spec, found) {
  // No list at all retrieves nothing: recall and F1 are 0, as for an empty list; precision has nothing to measure.
  if (found === null) return { found: null, missed: spec.relevant, extra: [], recall: 0, precision: null, f1: 0, contract: false };
  const relevant = new Set(spec.relevant);
  const allowed = new Set(spec.allowed ?? []);
  const hits = found.filter((file) => relevant.has(file));
  const extra = found.filter((file) => !relevant.has(file) && !allowed.has(file));
  const recall = ratio(hits.length, relevant.size);
  const precision = ratio(found.length - extra.length, found.length);
  const f1 = recall === null || precision === null || recall + precision === 0 ? (recall === 0 || precision === 0 ? 0 : null) : Number(((2 * recall * precision) / (recall + precision)).toFixed(3));
  return { found, missed: spec.relevant.filter((file) => !found.includes(file)), extra, recall, precision, f1, contract: true };
}

export const metricsOf = (spec, traceText) => scoreFiles(spec, foundPaths(finalTextOf(traceText), spec.source));
