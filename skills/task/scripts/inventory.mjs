// Whether the brief describes a defect (the stop hook then asks for a regression test).
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

process.stdout.write(JSON.stringify({ payload: null, record: defectBrief ? { defectBrief } : {} }));
