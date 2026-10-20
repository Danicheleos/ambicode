import { evaluate, DEV, HOLD, BASE, cases, rank, files, folderFiles, imports, importers, importEdges, index, buildMs } from './lib.mjs';
const C = {
  'A tf+joins': { tf: 1, joins: 1, bigrams: 1 },
  'B A+share3%+hop': { tf: 1, joins: 1, bigrams: 1, dirShare: 0.03, hop: 0.5, hopTop: 25 },
  'C B(2%)+folders': { tf: 1, joins: 1, bigrams: 1, dirShare: 0.02, hop: 0.5, hopTop: 25, folders: 1, fcov: 1, stage2: 1, dedupe: 1, beta: 0.1 },
  'D C@3%': { tf: 1, joins: 1, bigrams: 1, dirShare: 0.03, hop: 0.5, hopTop: 25, folders: 1, fcov: 1, stage2: 1, dedupe: 1, beta: 0.1 },
  'E C@5%': { tf: 1, joins: 1, bigrams: 1, dirShare: 0.05, hop: 0.5, hopTop: 25, folders: 1, fcov: 1, stage2: 1, dedupe: 1, beta: 0.1 },
};
const f = (x) => x.toFixed(2);
for (const [n, o] of Object.entries(C)) {
  const d = evaluate(o, DEV), h = evaluate(o, HOLD);
  console.log(`\n== ${n}  dev @25/50/100/fcov ${f(d.r25)} ${f(d.r50)} ${f(d.r100)} ${f(d.fcov)} | holdout ${f(h.r25)} ${f(h.r50)} ${f(h.r100)} ${f(h.fcov)}`);
  if (process.env.PER && (n.startsWith('C') || n.startsWith('A') || n.startsWith('D'))) for (const [id, p] of Object.entries({ ...d.per, ...h.per })) console.log(`  ${id}${DEV.includes(id) ? ' dev ' : ' HOLD'} n=${p.tn} top25 ${p.n25} top50 ${p.n50} top100 ${p.n100} | r25 ${f(p.r25)} r50 ${f(p.r50)} r100 ${f(p.r100)} fcov ${f(p.fcov)} | plugin ${BASE.plugin[id]} bare ${BASE.bare[id]} | ${p.ms}ms`);
}
const mean = (o) => Object.values(o).reduce((a, b) => a + b, 0) / 10;
console.log('\nbaselines mean: plugin', f(mean(BASE.plugin)), 'bare', f(mean(BASE.bare)), 'dev-only plugin', f(DEV.reduce((a, i) => a + BASE.plugin[i], 0) / 6), 'bare', f(DEV.reduce((a, i) => a + BASE.bare[i], 0) / 6), '| hold plugin', f(HOLD.reduce((a, i) => a + BASE.plugin[i], 0) / 4), 'bare', f(HOLD.reduce((a, i) => a + BASE.bare[i], 0) / 4));
// storage
const ix = index(true);
const dirDfB = JSON.stringify([...ix.dirDf]).length, fileDfB = JSON.stringify([...ix.fileDf]).length;
const edgesB = [...imports].map(([a, s]) => a + '>' + [...s].join(',')).join('\n').length;
const treeB = [...folderFiles.keys()].join('\n').length;
console.log(`index: build(import graph+words) ${buildMs}ms; files ${files.length} dirs ${ix.D}; dirDf ${dirDfB}B (${ix.dirDf.size} words) fileDf ${fileDfB}B (${ix.fileDf.size} words) import edges ${importEdges} -> ${edgesB}B; file list ${files.join('\n').length}B; dir list ${treeB}B`);
// 6141 detail
const c = cases.find((x) => x.id === '6141'); const o = C['C B(2%)+folders'];
const r = rank(c.ticket, o); const pos = new Map(r.order.map((x, i) => [x, i + 1]));
console.log('6141 truth ranks', c.truth.map((t) => pos.get(t) ?? 'none').sort((a, b) => (a === 'none' ? 1e9 : a) - (b === 'none' ? 1e9 : b)).join(' '));
console.log('6141 top words', [...r.words.wDir].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, x]) => w + ':' + x.toFixed(1)).join(' '), '| file words', [...r.words.wFile].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w, x]) => w + ':' + x.toFixed(1)).join(' '));
console.log('6141 top folders', r.folders.slice(0, 8).map((x) => `${x.d.split('/').slice(-3).join('/')}(${x.n},t${c.truth.filter((t) => t.startsWith(x.d + '/')).length})`).join(' ; '));
console.log('6141 top25', r.order.slice(0, 25).map((x) => (c.truth.includes(x) ? 'T' : '-') + x.split('/').slice(-2).join('/')).join('\n  '));
const miss = c.truth.filter((t) => (pos.get(t) ?? 1e9) > 100); console.log('6141 truth >100:', miss.length, miss.slice(0, 6).map((t) => t.split('/').slice(-3).join('/')).join(' ; '));
let t = Date.now(); for (let i = 0; i < 10; i++) rank(c.ticket, o); console.log('rank call ms (avg of 10, 6141, folders+hop):', (Date.now() - t) / 10);
