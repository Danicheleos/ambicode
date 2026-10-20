// Offline prototype: rank files/folders of a repo from ticket text by path-name word rarity. No product code touched.
// usage: node rank.mjs [--json] ; env NAV_BENCH, NAV_CASES
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { harvest } from '#modules/search/harvest';
import { isTestPath } from '#util/path-classes';

const BENCH = process.env.NAV_BENCH ?? '/Users/KillBill/Documents/projects/mine/ai/ambicode-evals-assets/bench/fe-angular';
const CASES = process.env.NAV_CASES ?? 'evals/cases/navigator';

const all = execFileSync('git', ['ls-files'], { cwd: BENCH, maxBuffer: 1e8 }).toString().split('\n').filter(Boolean);
const DATA = new Set(['json', 'lock', 'map', 'woff', 'woff2', 'ttf', 'eot', 'ico']);
const ext = (f) => f.split('.').pop().toLowerCase();
// candidates: what a navigator could be asked to change: no tests/specs/mocks/i18n, no data/binary assets
const files = all.filter((f) => !isTestPath(f) && !/\.(spec|test|mock)\./.test(f) && !/(^|\/)(i18n|mocks?)\//.test(f) && !DATA.has(ext(f)));

const split = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).map((w) => w.toLowerCase()).filter((w) => w.length >= 2 && !/^\d+$/.test(w));
// crude stemmer: plural/gerund/past endings; applied to both sides so only equality matters
const stem = (w) => w.length > 4 ? w.replace(/(ies)$/, 'y').replace(/(sses)$/, 'ss').replace(/(ing|ed|es|s)$/, '') : w.replace(/s$/, (m) => (w.length > 3 ? '' : m));
const noExt = (f) => f.replace(/\.[^/]+$/, '').replace(/\.[^/.]+$/, (m) => m); // keep inner dots (x.component) as words
const pathWords = (f, stemmed) => { const w = new Set(split(f.replace(/\.[A-Za-z0-9]+$/, ''))); return stemmed ? new Set([...w].map(stem)) : w; };

// declared names
const fsPort = { stat: async (p) => ({ size: readFileSync(p).length }), readText: async (p) => readFileSync(p, 'utf8') };
const decls = await harvest(fsPort, BENCH, files.filter((f) => /\.(ts|tsx|js|mjs|py|go|rs|java|kt|cs)$/.test(f)));
const namesOf = new Map();
for (const d of decls) { (namesOf.get(d.path) ?? namesOf.set(d.path, new Set()).get(d.path)); for (const w of split(d.name)) namesOf.get(d.path).add(w); }

const FILESET = new Set(files);
// content df: files whose text contains the word; common English ("the", "an") is in thousands of files but in a path by chance
const contentDf = new Map();
for (const f of files) {
  let t; try { t = readFileSync(path.join(BENCH, f), 'utf8'); } catch { continue; }
  if (t.length > 300000) continue;
  const seen = new Set(split(t)); for (const w of seen) { contentDf.set(w, (contentDf.get(w) ?? 0) + 1); }
}
const stemmedContentDf = new Map();
for (const [w, c] of contentDf) { const k = stem(w); stemmedContentDf.set(k, Math.max(stemmedContentDf.get(k) ?? 0, c)); }
const dirsOf = (f) => { const p = f.split('/'); p.pop(); return p.map((_, i) => p.slice(0, i + 1).join('/')); };
const folderFiles = new Map();
for (const f of files) for (const d of dirsOf(f)) (folderFiles.get(d) ?? folderFiles.set(d, []).get(d)).push(f);

function build(o) {
  const docs = new Map(); const nameDocs = new Map();
  for (const f of files) {
    const w = pathWords(f, o.stem);
    if (o.names) for (const n of namesOf.get(f) ?? []) w.add(o.stem ? stem(n) : n);
    if (o.names2) { const nw = new Set([...(namesOf.get(f) ?? [])].map((n) => (o.stem ? stem(n) : n))); nameDocs.set(f, nw); }
    docs.set(f, w);
  }
  const df = new Map();
  for (const w of docs.values()) for (const x of w) df.set(x, (df.get(x) ?? 0) + 1);
  return { docs, df, nameDocs };
}

function ticketWords(text, o) {
  const tf = new Map();
  for (const w of split(text)) { const s = o.stem ? stem(w) : w; tf.set(s, (tf.get(s) ?? 0) + 1); }
  return tf;
}

function rank(text, o) {
  const { docs, df, nameDocs } = build(o);
  const N = files.length;
  const idf = (w) => Math.log(N / (df.get(w) ?? N));
  const tf = ticketWords(text, o);
  const title = o.title ? new Set(split(text.split('\n')[0]).map((w) => (o.stem ? stem(w) : w))) : new Set();
  const words = new Map(); // word -> weight
  for (const [w, c] of tf) {
    const d = df.get(w); if (!d || w.length < (o.minLen ?? 0)) continue;
    if (o.maxDf && d / N > o.maxDf) continue;
    let wt = o.count ? 1 : idf(w) * (o.tf ? 1 + Math.log(c) : 1);
    if (o.sup) wt *= Math.min(1, Math.log2(1 + d) / Math.log2(1 + o.sup)); // a word in one path is chance, in a folder's worth is a name
    if (o.content) wt *= Math.log(N / Math.min(N, (o.stem ? stemmedContentDf : contentDf).get(w) ?? 1)) / Math.log(N);
    if (title.has(w)) wt *= o.title;
    words.set(w, wt);
  }
  const fscore = new Map();
  for (const [f, w] of docs) { let s = 0; for (const [t, wt] of words) if (w.has(t)) s += wt; if (o.names2) for (const [t, wt] of words) if (!w.has(t) && nameDocs.get(f)?.has(t)) s += o.names2 * wt;
    if (s > 0) fscore.set(f, s); }
  // folder score: sum of file scores / sqrt(size), folders of 2..MAXF files
  const folders = [];
  if (o.folders) {
    for (const [d, fs] of folderFiles) {
      if (fs.length < 2 || fs.length > o.maxFolder) continue;
      let s = 0; for (const f of fs) s += fscore.get(f) ?? 0;
      if (o.cover) { s = 0; for (const [t, wt] of words) { let c = 0; for (const f of fs) if (docs.get(f).has(t)) c++; s += wt * (c / fs.length); } s *= Math.log2(1 + fs.length); }
      else s = s / Math.pow(fs.length, o.pow ?? 0.5);
      if (s > 0) folders.push({ d, score: s, n: fs.length });
    }
    folders.sort((a, b) => b.score - a.score);
  }
  let ranked = [...fscore].map(([f, s]) => ({ f, s })).sort((a, b) => b.s - a.s || (a.f < b.f ? -1 : 1));
  if (o.folders) {
    const top = new Map(); // file -> best folder rank boost among top folders
    const topN = folders.slice(0, o.topFolders ?? 8);
    topN.forEach((fd, i) => { for (const f of folderFiles.get(fd.d)) top.set(f, Math.max(top.get(f) ?? 0, 1 / (1 + i))); });
    const max = ranked[0]?.s ?? 1;
    // every file in a top folder is eligible (zero own score too), boosted by folder rank
    const pool = new Set([...fscore.keys(), ...top.keys()]);
    ranked = [...pool].map((f) => ({ f, s: (fscore.get(f) ?? 0) / max + (o.boost ?? 1) * (top.get(f) ?? 0) })).sort((a, b) => b.s - a.s || (a.f < b.f ? -1 : 1));
  }
  return { ranked, folders, words };
}

const cases = readdirSync(CASES).sort().filter((d) => /^\d/.test(d)).map((d) => {
  const md = readFileSync(path.join(CASES, d, 'prompt.md'), 'utf8');
  const ticket = /<ticket>\n([\s\S]*?)\n<\/ticket>/.exec(md)?.[1] ?? md.split('\n---\n').pop().replace(/Do not change anything[\s\S]*$/, '');
  const truthAll = JSON.parse(readFileSync(path.join(CASES, d, 'truth.json'), 'utf8')).relevant;
  const truth = truthAll.filter((t) => FILESET.has(t)); // files created by the fix do not exist in the bench; no ranking can find them
  return { id: d.match(/vs-(\d+)/)[1], ticket, truth, lost: truthAll.length - truth.length };
});

const BASE = { plugin: { 438: .667, 6141: .107, 5948: .474, 6292: .103, 5967: .130, 5164: 1, 6404: .364, 3571: .327, 6406: .211, 6086: .316 }, bare: { 438: 1, 6141: .554, 5948: .684, 6292: .069, 5967: .174, 5164: 0, 6404: .455, 3571: .347, 6406: .211, 6086: .316 } };
const Ks = [10, 25, 50, 100];
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const variants = {
  'a plain count': { count: 1 },
  'a2 plain count+stem': { count: 1, stem: 1 },
  'b idf': {},
  'b2 idf+stem': { stem: 1 },
  'b3 idf+stem+maxDf10%': { stem: 1, maxDf: .1 },
  'b4 idf+stem+maxDf3%': { stem: 1, maxDf: .03 },
  'e1 b2+sup5': { stem: 1, sup: 5 },
  'e2 b2+sup10': { stem: 1, sup: 10 },
  'e3 b2+content': { stem: 1, content: 1 },
  'e4 b2+content+sup5': { stem: 1, content: 1, sup: 5 },
  'e5 b2+content+sup5+len3': { stem: 1, content: 1, sup: 5, minLen: 3 },
  'c idf+stem+folders': { stem: 1, folders: 1, maxFolder: 150 },
  'c2 +maxDf10%': { stem: 1, folders: 1, maxFolder: 150, maxDf: .1 },
  'c3 +maxDf10% top3 folders': { stem: 1, folders: 1, maxFolder: 150, maxDf: .1, topFolders: 3 },
  'c4 +maxDf10% pow1': { stem: 1, folders: 1, maxFolder: 150, maxDf: .1, pow: 1 },
  'f1 e4+cover folders': { stem: 1, content: 1, sup: 5, folders: 1, cover: 1, maxFolder: 150, boost: 0.3 },
  'f2 e4+cover folders boost1': { stem: 1, content: 1, sup: 5, folders: 1, cover: 1, maxFolder: 150, boost: 1 },
  'f3 e4+pow1 folders': { stem: 1, content: 1, sup: 5, folders: 1, pow: 1, maxFolder: 150, boost: 0.3 },
  'g1 e4+names': { stem: 1, content: 1, sup: 5, names: 1 },
  'g2 e4+names+cover folders': { stem: 1, content: 1, sup: 5, names: 1, folders: 1, cover: 1, maxFolder: 150, boost: 0.3 },
  'h1 f1+title2': { stem: 1, content: 1, sup: 5, folders: 1, cover: 1, maxFolder: 150, boost: 0.3, title: 2 },
  'h2 f1+title2+tf': { stem: 1, content: 1, sup: 5, folders: 1, cover: 1, maxFolder: 150, boost: 0.3, title: 2, tf: 1 },
  'h3 f1+names0.5': { stem: 1, content: 1, sup: 5, folders: 1, cover: 1, maxFolder: 150, boost: 0.3, names2: 0.5 },
  'h4 f1+names0.25+title2': { stem: 1, content: 1, sup: 5, folders: 1, cover: 1, maxFolder: 150, boost: 0.3, names2: 0.25, title: 2 },
  'h5 e4+title2': { stem: 1, content: 1, sup: 5, title: 2 },
  'd names+stem': { stem: 1, names: 1 },
  'd2 names+stem+maxDf10%': { stem: 1, names: 1, maxDf: .1 },
  'd3 names+folders+maxDf10%': { stem: 1, names: 1, folders: 1, maxFolder: 150, maxDf: .1 },
  'd4 names+folders+maxDf10%+tf': { stem: 1, names: 1, folders: 1, maxFolder: 150, maxDf: .1, tf: 1 },
};
const only = process.argv[2];
const rows = [];
const perCase = {};
for (const [name, o] of Object.entries(variants)) {
  const rec = Ks.map(() => []); const fh3 = []; const fh5 = []; const fc5 = [];
  perCase[name] = {};
  for (const c of cases) {
    const r = rank(c.ticket, o);
    const order = r.ranked.map((x) => x.f);
    const truthIn = c.truth.filter((t) => files.includes(t));
    Ks.forEach((K, i) => rec[i].push(c.truth.filter((t) => order.slice(0, K).includes(t)).length / c.truth.length));
    // folders: use explicit folder ranking when present, else derive from file ranking (parent dir of top files, deduped)
    let fl = r.folders.map((x) => x.d);
    if (!o.folders) { fl = []; for (const f of order) { const d = path.dirname(f); if (!fl.includes(d) && (folderFiles.get(d)?.length ?? 0) >= 2) fl.push(d); if (fl.length >= 5) break; } }
    const hit = (n) => fl.slice(0, n).some((d) => c.truth.filter((t) => t.startsWith(d + '/')).length >= c.truth.length / 2 && folderFiles.get(d).length <= 150);
    fc5.push(c.truth.filter((t) => fl.slice(0, 5).some((d) => folderFiles.get(d).length <= 150 && t.startsWith(d + '/'))).length / c.truth.length);
    fh3.push(hit(3) ? 1 : 0); fh5.push(hit(5) ? 1 : 0);
    perCase[name][c.id] = { r25: c.truth.filter((t) => order.slice(0, 25).includes(t)).length / c.truth.length, r50: c.truth.filter((t) => order.slice(0, 50).includes(t)).length / c.truth.length, fh3: hit(3), fh5: hit(5) };
  }
  rows.push(`${name.padEnd(32)} ${rec.map((x) => mean(x).toFixed(3)).join('  ')}   fh3 ${mean(fh3).toFixed(1)} fh5 ${mean(fh5).toFixed(1)} fcov5 ${mean(fc5).toFixed(2)}`);
}
console.log(`candidates ${files.length}/${all.length}; truth files not in candidates (new files or filtered): ${cases.map((c) => c.id + ':' + c.lost).join(' ')}`);
console.log('variant (mean recall @10 @25 @50 @100 over 10 cases)');
console.log(rows.join('\n'));
console.log(`baselines mean: plugin ${mean(Object.values(BASE.plugin)).toFixed(3)} bare ${mean(Object.values(BASE.bare)).toFixed(3)}`);
const best = process.argv[2] ?? 'd3 names+folders+maxDf10%';
console.log(`\nper case, ${best}: id truthN r@25 r@50 fh3 fh5 | plugin bare`);
for (const c of cases) { const p = perCase[best][c.id]; console.log(c.id, c.truth.length, p.r25.toFixed(2), p.r50.toFixed(2), p.fh3 ? 1 : 0, p.fh5 ? 1 : 0, '|', BASE.plugin[c.id], BASE.bare[c.id]); }
if (process.argv[3]) {
  for (const c of cases) {
    const o = variants[best]; const r = rank(c.ticket, o); const order = r.ranked.map((x) => x.f);
    console.log(`\n== ${c.id} top words:`, [...r.words].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w, x]) => `${w}:${x.toFixed(1)}`).join(' '));
    console.log(' top folders:', r.folders.slice(0, 3).map((x) => `${x.d}(${x.n})`).join(' ; '));
    for (const t of c.truth) console.log('  rank', order.indexOf(t) + 1 || 'none', t.split('/').slice(-3).join('/'));
  }
}
