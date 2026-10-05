// Scores a "survey before you build" answer: which existing symbols it reuses, and whether it proposes to create
// something that already exists. No imports from the bench, so the bench can use it.

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const PATH = /\.(ts|tsx|js|mjs|html|json)$/;

function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^#{1,6}\\s*${heading}\\b`, 'i').test(l.trim()));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^#{1,6}\s/.test(l.trim()));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

/** Identifiers in the backticks of each bullet, paths set aside; `Class.method()` gives both halves. */
export function bullets(text, heading) {
  const lines = section(text, heading);
  if (lines === null) return null;
  return lines
    .filter((l) => /^\s*[-*]\s/.test(l))
    .map((l) => {
      const spans = [...l.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
      const names = spans.filter((s) => !PATH.test(s)).flatMap((s) => s.replace(/\(.*$/, '').split(/[.#:/\s,]+/)).filter((n) => IDENT.test(n));
      return { names, files: spans.filter((s) => PATH.test(s)) };
    });
}

const norm = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * `truth`: names the real change imported from existing modules. `exports`: every exported name of the snapshot's
 * non-test code, mapped to its files. A reuse bullet is real when it names an exported symbol; a new bullet is a
 * duplicate when its name, ignoring case and punctuation, is already exported.
 */
export function scoreReuse(answer, truth, exports) {
  const reuse = bullets(answer, 'reuse');
  const created = bullets(answer, 'new') ?? [];
  if (reuse === null) return { precision: 0, recall: 0, f1: 0, hit: 0, named: 0, dupes: 0, sectioned: false };
  const known = new Set(Object.keys(exports));
  const normalized = new Map();
  for (const name of known) normalized.set(norm(name), name);
  const named = new Set(reuse.flatMap((b) => b.names));
  const correct = truth.filter((name) => named.has(name)).length;
  const real = reuse.filter((b) => b.names.some((n) => known.has(n))).length;
  const precision = reuse.length ? real / reuse.length : 0;
  const recall = truth.length ? correct / truth.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const dupes = created.filter((b) => b.names.some((n) => normalized.has(norm(n)) && n.length > 3)).length;
  return { precision, recall, f1, hit: correct > 0 ? 1 : 0, named: reuse.length, dupes, created: created.length, sectioned: true };
}
