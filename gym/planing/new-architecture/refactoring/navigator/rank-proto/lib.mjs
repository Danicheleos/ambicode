// Ranking pipeline v2 (offline prototype). Index is built once per repo; rank() is the per-ticket call.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { isTestPath } from '#util/path-classes';
import { importsOf, resolveImport } from '#modules/navigator/structure';

export const BENCH = process.env.NAV_BENCH ?? '/Users/KillBill/Documents/projects/mine/ai/ambicode-evals-assets/bench/fe-angular';
export const CASES = 'evals/cases/navigator';
export const split = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).map((w) => w.toLowerCase()).filter((w) => w.length >= 2 && !/^\d+$/.test(w));
export const stem = (w) => (w.length > 4 ? w.replace(/(ies)$/, 'y').replace(/(sses)$/, 'ss').replace(/(ing|ed|es|s)$/, '') : w.length > 3 ? w.replace(/s$/, '') : w);

const t0 = Date.now();
const all = execFileSync('git', ['ls-files'], { cwd: BENCH, maxBuffer: 1e8 }).toString().split('\n').filter(Boolean);
const DATA = new Set(['json', 'lock', 'map', 'woff', 'woff2', 'ttf', 'eot', 'ico']);
export const files = all.filter((f) => !isTestPath(f) && !/\.(spec|test|mock)\./.test(f) && !/(^|\/)(i18n|mocks?)\//.test(f) && !DATA.has(f.split('.').pop().toLowerCase()));
const FILESET = new Set(files);

const baseOf = (f) => path.posix.basename(f).replace(/\.[A-Za-z0-9]+$/, '');
const dirsOf = (f) => { const p = f.split('/'); p.pop(); return p.map((_, i) => p.slice(0, i + 1).join('/')); };
const uniq = (a) => [...new Set(a)];
// words of one name; with joins, adjacent words also join ("score","card" -> "scorecard")
const wordsOfName = (name, joins) => { const w = split(name).map(stem); const out = [...w]; if (joins) for (let i = 0; i + 1 < w.length; i++) out.push(stem(split(name)[i] + split(name)[i + 1])); return uniq(out); };

export const folderFiles = new Map();
for (const f of files) for (const d of dirsOf(f)) (folderFiles.get(d) ?? folderFiles.set(d, []).get(d)).push(f);

// import graph over all candidate files (regex over text, existing resolver)
const byBase = new Map();
for (const f of files) { const b = path.posix.basename(f, path.posix.extname(f)); byBase.set(b, [...(byBase.get(b) ?? []), f]); }
export const imports = new Map(); export const importers = new Map();
let edges = 0;
for (const f of files) {
  if (!/\.(ts|tsx|js|mjs|jsx)$/.test(f)) continue;
  let t; try { t = readFileSync(path.join(BENCH, f), 'utf8'); } catch { continue; }
  for (const e of importsOf(t)) {
    const r = resolveImport(e.spec, f, FILESET, byBase);
    if (r === null || r === f) continue;
    (imports.get(f) ?? imports.set(f, new Set()).get(f)).add(r);
    (importers.get(r) ?? importers.set(r, new Set()).get(r)).add(f); edges++;
  }
}
export const importEdges = edges;
const sibKey = (f) => `${path.posix.dirname(f)}/${path.posix.basename(f).split('.')[0]}`;
const siblings = new Map();
for (const f of files) (siblings.get(sibKey(f)) ?? siblings.set(sibKey(f), []).get(sibKey(f))).push(f);

const indexCache = new Map();
export function index(joins) {
  if (indexCache.has(joins)) return indexCache.get(joins);
  const dirWords = new Map(); // dir path -> own-segment words
  for (const d of folderFiles.keys()) dirWords.set(d, wordsOfName(d.split('/').pop(), joins));
  const dirDf = new Map(); for (const w of dirWords.values()) for (const x of w) dirDf.set(x, (dirDf.get(x) ?? 0) + 1);
  const fileWords = new Map(); const fileDf = new Map();
  for (const f of files) { const w = wordsOfName(baseOf(f), joins); fileWords.set(f, new Set(w)); for (const x of w) fileDf.set(x, (fileDf.get(x) ?? 0) + 1); }
  const pathDirWords = new Map(); // file -> union of ancestor dir words
  for (const f of files) { const s = new Set(); for (const d of dirsOf(f)) for (const w of dirWords.get(d)) s.add(w); pathDirWords.set(f, s); }
  const dirCarry = new Map(); for (const w of pathDirWords.values()) for (const x of w) dirCarry.set(x, (dirCarry.get(x) ?? 0) + 1);
  const pathDf = new Map(); for (const f of files) { const s = new Set([...fileWords.get(f), ...pathDirWords.get(f)]); for (const x of s) pathDf.set(x, (pathDf.get(x) ?? 0) + 1); }
  const r = { dirCarry, dirWords, dirDf, fileWords, fileDf, pathDirWords, pathDf, D: dirWords.size, N: files.length };
  indexCache.set(joins, r); return r;
}

export function rank(text, o) {
  const ix = index(!!o.joins);
  const { dirDf, fileDf, pathDf, dirCarry, D, N } = ix;
  const tws = split(text).map(stem);
  const wAny = (w) => Math.max(wDir.get(w) ?? 0, wFile.get(w) ?? 0);
  const titleLine = text.split('\n').find((l) => l.trim()) ?? '';
  const titleSet = new Set(split(titleLine).map(stem));
  const tf = new Map(); for (const w of tws) tf.set(w, (tf.get(w) ?? 0) + 1);
  if (o.bigrams) { const raw = split(text); for (let i = 0; i + 1 < raw.length; i++) { const j = stem(raw[i] + raw[i + 1]); if (dirDf.has(j) || fileDf.has(j)) { tf.set(j, (tf.get(j) ?? 0) + 1); if (titleSet.has(stem(raw[i])) && titleSet.has(stem(raw[i + 1]))) titleSet.add(j); } } }
  // weights: dir-name rarity and file-name rarity kept separate; a word in no path segment is dropped (no stopword list)
  const wDir = new Map(); const wFile = new Map(); const wPath = new Map();
  for (const [w, c] of tf) {
    const dd = dirDf.get(w) ?? 0; const fd = fileDf.get(w) ?? 0;
    if (dd === 0 && fd === 0) continue;
    if (w.length < (o.minLen ?? 2)) continue;
    let m = 1;
    if (o.tf) m *= 1 + o.tf * Math.log(c);
    if (o.title && titleSet.has(w)) m *= o.title;
    if (dd > 0) wDir.set(w, m * (o.sup ? Math.pow(Math.log(1 + dirCarry.get(w)), o.sup) : 1) * (o.dirIdf === 'ln1' ? Math.log(1 + D / dd) : Math.log(D / dd + 1e-9) + (o.dirBias ?? 0)) );
    if (fd > 0) wFile.set(w, m * Math.log(N / fd) * (o.fileScale ?? 1));
    if (o.pathIdf) wPath.set(w, m * Math.log(N / (pathDf.get(w) ?? 1)));
  }
  if (o.dirShare) for (const [w] of [...wDir]) if (dirDf.get(w) / D > o.dirShare) wDir.delete(w);
  if (o.fileShare) for (const [w] of [...wFile]) if (fileDf.get(w) / N > o.fileShare) wFile.delete(w);
  const g = new Map();
  const score = (f) => {
    let s = 0; const fw = ix.fileWords.get(f); const dw = ix.pathDirWords.get(f);
    if (o.pathIdf) { for (const [w, x] of wPath) if (fw.has(w) || dw.has(w)) s += x; return s; }
    const seen = new Set();
    for (const [w, x] of wFile) if (fw.has(w)) { s += x; seen.add(w); }
    for (const [w, x] of wDir) if (dw.has(w) && !(seen.has(w) && wFile.get(w) >= x)) { s += seen.has(w) ? Math.max(0, x - wFile.get(w)) : x; }
    return s;
  };
  for (const f of files) { let s = score(f); if (s > 0 && o.lnorm) s /= Math.pow(ix.fileWords.get(f).size + ix.pathDirWords.get(f).size, o.lnorm); if (s > 0) g.set(f, s); }
  const gmax = Math.max(1e-9, ...g.values());
  // folders
  let folders = [];
  if (o.folders) {
    const minF = o.minFolder ?? 2; const maxF = o.maxFolder ?? 150;
    for (const [d, fs] of folderFiles) {
      if (fs.length < minF || fs.length > maxF) continue;
      let ps = 0; const dwAll = new Set(); for (const a of dirsOf(d + '/x')) for (const w of ix.dirWords.get(a)) dwAll.add(w);
      for (const [w, x] of wDir) if (dwAll.has(w)) ps += x;
      if (o.fcov) {
        const carry = new Map(); for (const f of fs) { for (const w of ix.fileWords.get(f)) carry.set(w, (carry.get(w) ?? 0) + 1); for (const w of ix.pathDirWords.get(f)) if (!ix.fileWords.get(f).has(w)) carry.set(w, (carry.get(w) ?? 0) + 1); }
        let sc = 0; for (const w of new Set([...wDir.keys(), ...wFile.keys()])) sc += wAny(w) * ((carry.get(w) ?? 0) / fs.length);
        if (sc > 0) folders.push({ d, score: sc * Math.pow(Math.log2(1 + fs.length), o.fLog ?? 1), n: fs.length });
        continue;
      }
      let cover = 0;
      if (o.cover) { for (const [w, x] of wFile) { let c = 0; for (const f of fs) if (ix.fileWords.get(f).has(w)) c++; cover += x * c / fs.length; } }
      let sum = 0; for (const f of fs) sum += g.get(f) ?? 0;
      const s = ((o.fPath ?? 1) * ps + (o.fCover ?? 0) * cover + (o.fSum ?? 0) * sum / Math.pow(fs.length, o.fPow ?? 0.5)) / Math.pow(fs.length, o.fSize ?? 0);
      if (s > 0) folders.push({ d, score: s, n: fs.length });
    }
    folders.sort((a, b) => b.score - a.score || a.n - b.n);
  }
  let final = new Map();
  if (o.folders && o.stage2) {
    const sel = []; const nested = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
    for (const fd of folders) { if (o.dedupe && sel.some((s) => nested(s.d, fd.d))) continue; sel.push(fd); if (sel.length >= (o.topFolders ?? 8)) break; }
    const boost = new Map(); sel.forEach((fd, i) => { const b = o.boostFlat ? 1 : 1 / (1 + i * (o.boostDecay ?? 1)); for (const f of folderFiles.get(fd.d)) boost.set(f, Math.max(boost.get(f) ?? 0, b)); });
    for (const f of new Set([...g.keys(), ...boost.keys()])) final.set(f, (o.gW ?? 1) * (g.get(f) ?? 0) / gmax + (o.beta ?? 0.5) * (boost.get(f) ?? 0));
  } else for (const [f, s] of g) final.set(f, s / gmax);
  let order = [...final].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (o.hop || o.sib) {
    const M = o.hopTop ?? 25; const top = order.slice(0, M); const add = new Map();
    const put = (f, s) => { if (!final.has(f) && s > (add.get(f) ?? 0)) add.set(f, s); };
    for (const [f, s] of top) {
      if (o.hop) { for (const n of imports.get(f) ?? []) put(n, s * o.hop); for (const n of importers.get(f) ?? []) put(n, s * o.hop * (o.hopIn ?? 1)); }
      if (o.sib) for (const n of siblings.get(sibKey(f)) ?? []) put(n, s * o.sib);
    }
    // existing files also gain from being a neighbour of a top file
    if (o.hopBoost) for (const [f, s] of top) for (const n of [...(imports.get(f) ?? []), ...(importers.get(f) ?? [])]) if (final.has(n)) final.set(n, final.get(n) + o.hopBoost * s);
    for (const [f, s] of add) final.set(f, s);
    order = [...final].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  }
  return { order: order.map((x) => x[0]), scores: final, folders, words: { wDir, wFile } };
}

export const cases = readdirSync(CASES).sort().filter((d) => /^\d/.test(d)).map((d) => {
  const md = readFileSync(path.join(CASES, d, 'prompt.md'), 'utf8');
  const ticket = /<ticket>\n([\s\S]*?)\n<\/ticket>/.exec(md)?.[1] ?? md.split('\n---\n').pop().replace(/Do not change anything[\s\S]*$/, '').trim();
  const truthAll = JSON.parse(readFileSync(path.join(CASES, d, 'truth.json'), 'utf8')).relevant;
  return { id: d.match(/vs-(\d+)/)[1], ticket, truth: truthAll.filter((t) => FILESET.has(t)) };
});
export const DEV = ['6141', '5967', '6292', '5948', '3571', '6086']; export const HOLD = ['438', '5164', '6404', '6406'];
export const BASE = { plugin: { 438: .667, 6141: .107, 5948: .474, 6292: .103, 5967: .130, 5164: 1, 6404: .364, 3571: .327, 6406: .211, 6086: .316 }, bare: { 438: 1, 6141: .554, 5948: .684, 6292: .069, 5967: .174, 5164: 0, 6404: .455, 3571: .347, 6406: .211, 6086: .316 } };

const nestedPair = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
export function evaluate(o, ids) {
  const per = {};
  for (const c of cases.filter((x) => ids.includes(x.id))) {
    const t1 = Date.now();
    const r = rank(c.ticket, o); const pos = new Map(r.order.map((f, i) => [f, i + 1]));
    const rec = (K) => c.truth.filter((t) => (pos.get(t) ?? 1e9) <= K).length / c.truth.length;
    let fl = r.folders.map((x) => x.d);
    if (!o.folders) { fl = []; for (const f of r.order) { const d = path.posix.dirname(f); if (!fl.includes(d) && (folderFiles.get(d)?.length ?? 0) >= 2 && folderFiles.get(d).length <= 150) fl.push(d); if (fl.length >= 40) break; } }
    const sel = []; for (const d of fl) { if (sel.some((s) => nestedPair(s, d))) continue; sel.push(d); if (sel.length >= 5) break; }
    const fcov = c.truth.filter((t) => sel.some((d) => t.startsWith(d + '/'))).length / c.truth.length;
    per[c.id] = { r25: rec(25), r50: rec(50), r100: rec(100), fcov, ms: Date.now() - t1, n25: Math.round(rec(25) * c.truth.length), n50: Math.round(rec(50) * c.truth.length), n100: Math.round(rec(100) * c.truth.length), tn: c.truth.length };
  }
  const m = (k) => Object.values(per).reduce((a, p) => a + p[k], 0) / Object.keys(per).length;
  return { per, r25: m('r25'), r50: m('r50'), r100: m('r100'), fcov: m('fcov') };
}
export const buildMs = Date.now() - t0;
