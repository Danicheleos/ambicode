import { writeFileSync } from 'node:fs';
import { evaluate, DEV } from './lib.mjs';
const steps = JSON.parse(process.env.STEPS ?? 'null') ?? (await import('./steps.mjs')).default;
let cur = JSON.parse(process.env.START ?? '{}'); let best = null; const log = [];
const f = (x) => x.toFixed(3);
const run = (name, hyp, patch, base) => {
  const o = { ...base, ...patch }; const e = evaluate(o, DEV);
  return { name, hyp, o, e };
};
const ref = evaluate({ pathIdf: 1 }, DEV);
log.push(`| 0a | old design: file-level path idf (no dir df) | ${f(ref.r25)} | ${f(ref.r50)} | ${f(ref.r100)} | ${f(ref.fcov)} | reference |`);
best = evaluate(cur, DEV);
log.push(`| 0b | H1 base: dir-name df for dirs + file-name df for names, drop words in no path | ${f(best.r25)} | ${f(best.r50)} | ${f(best.r100)} | ${f(best.fcov)} | start |`);
const ex = (e) => Object.entries(e.per).filter(([k]) => k !== '6141').reduce((a, [, v]) => a + v.r50, 0) / (Object.keys(e.per).length - 1);
let bestEx = ex(best);
for (const [name, hyp, patch, why] of steps) {
  const r = run(name, hyp, patch, cur); const gain = r.e.r50 - best.r50;
  const gex = ex(r.e) - bestEx; const keep = gain >= 0.01 && gex >= 0;
  log.push(`| ${name} | ${hyp} | ${f(r.e.r25)} | ${f(r.e.r50)} | ${f(r.e.r100)} | ${f(r.e.fcov)} | ${keep ? 'KEPT' : 'rejected'} (d@50 ${gain >= 0 ? '+' : ''}${f(gain)}; without 6141 ${gex >= 0 ? '+' : ''}${f(gex)}) ${keep && why ? '. Universal because: ' + why : ''} |`);
  if (keep) { cur = r.o; best = r.e; bestEx = ex(r.e); }
}
console.log(log.join('\n')); console.log('FINAL CONFIG', JSON.stringify(cur)); console.log('dev per case', JSON.stringify(Object.fromEntries(Object.entries(best.per).map(([k, v]) => [k, [v.n25, v.n50, v.n100, v.tn]]))));
writeFileSync(new URL(process.env.OUT ?? './iterations.md', import.meta.url), `# Ranking iterations (dev = ${DEV.join(', ')}; mean recall of reachable truth; fcov = share of truth under top-5 deduped folders)\n\n| # | hypothesis | dev @25 | dev @50 | dev @100 | fcov | decision |\n|---|---|---|---|---|---|---|\n${log.join('\n')}\n\nFinal config: ${JSON.stringify(cur)}\n`);
