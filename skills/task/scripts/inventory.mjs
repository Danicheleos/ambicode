// Callers of the code-shaped names in the brief, by `git grep -w -n`; and whether the brief describes a defect (the stop hook then asks for a regression test).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const read = (file) => { try { return readFileSync(file, 'utf8'); } catch { return null; } };
const entries = (read(path.join(input.taskDir, 'ledger.jsonl')) ?? '').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });

const text0 = input.args?.text ?? '';
const planPath = input.args?.plan ?? entries.findLast((entry) => entry.kind === 'note' && entry.note === 'plan')?.path ?? null;
const plan = planPath === null ? null : read(path.resolve(input.repositoryRoot, planPath));
const done = entries.findLast((entry) => entry.kind === 'note' && entry.note === 'notes' && typeof entry.iteration === 'number')?.iteration;
const named = /^\s*iteration\s+(\d+)\b/i.exec(text0);
const iteration = named === null ? (done ?? 0) + 1 : Number(named[1]);
const headings = plan === null ? [] : [...plan.matchAll(/^##\s+Iteration\s+(\d+)\b.*$/gim)];
const at = headings.findIndex((heading) => Number(heading[1]) === iteration);
const brief = plan === null ? null : headings.length === 0 ? plan : at < 0 ? null : plan.slice(headings[at].index, headings[at + 1]?.index ?? plan.length);
const text = brief ?? text0;

const DEFECT = /\bdefect\b|\b(?:issue\s*)?type\W{0,3}(?:bug|defect)\b/i;
const sources = JSON.stringify(entries.filter((entry) => entry.kind === 'envelope').map((entry) => entry.sources));
const defectBrief = DEFECT.test(text) || DEFECT.test(text0) || DEFECT.test(sources);

const CODE_SHAPED = /`([^`\s]{2,80})`|\b([A-Za-z_$][\w$]*(?:[a-z0-9][A-Z]|_[A-Za-z0-9])[\w$]*)\b/g;
const names = [...new Set([...text.matchAll(CODE_SHAPED)].map((match) => (match[1] ?? match[2]).replace(/\(\)$/, '').split('.').at(-1)).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name)))].slice(0, 8);

const lines = ['Callers (git grep -w -n, first 6 per name):'];
if (names.length === 0) lines.push('  no code-shaped name in the brief');
for (const name of names) {
  const found = spawnSync('git', ['grep', '-w', '-n', '-I', '--', name], { cwd: input.repositoryRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const hits = (found.stdout ?? '').split('\n').filter(Boolean);
  lines.push(`  ${name} — ${hits.length} refs`, ...hits.slice(0, 6).map((hit) => `    ${hit.slice(0, 120)}`));
}
// Whole lines are cut, never half a hit: the payload stays under 4 KB.
let payload = lines.join('\n');
while (Buffer.byteLength(payload) > 4096) payload = payload.slice(0, payload.lastIndexOf('\n'));
process.stdout.write(JSON.stringify({ payload, record: defectBrief ? { defectBrief } : {} }));
