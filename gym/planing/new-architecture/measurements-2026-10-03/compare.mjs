// Reference-set precision/recall of cheap tools against the TypeScript language service, on one symbol per repo.
// Usage: node compare.mjs <repoDir> <symbol> <definingFile> <codeindexIndexDir> <binDir>
import ts from '/Users/KillBill/Documents/projects/mine/ai/ambicode/node_modules/typescript/lib/typescript.js';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [dir, SYM, FILE, INDEX, BIN] = process.argv.slice(2);
const TSCONFIG = { target: 'es2022', module: 'commonjs', noEmit: true, skipLibCheck: true, strict: false, experimentalDecorators: true, resolveJsonModule: true, esModuleInterop: true, baseUrl: '.' };

function walk(d, p = '') {
  const out = [];
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const rel = p ? `${p}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(d, e.name), rel));
    else if (e.name.endsWith('.ts')) out.push(rel);
  }
  return out;
}
const files = walk(dir);
const abs = (f) => path.join(dir, f);
const t0 = Date.now();
const host = {
  getScriptFileNames: () => files.map(abs),
  getScriptVersion: () => '1',
  getScriptSnapshot: (f) => (ts.sys.fileExists(f) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(f)) : undefined),
  getCurrentDirectory: () => dir,
  getCompilationSettings: () => ts.convertCompilerOptionsFromJson(TSCONFIG, dir).options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
};
const svc = ts.createLanguageService(host);
const text = readFileSync(abs(FILE), 'utf8');
const sf = ts.createSourceFile(FILE, text, ts.ScriptTarget.ES2022, true);
let pos = -1;
const visit = (n) => {
  if (pos >= 0) return;
  if ((ts.isClassDeclaration(n) || ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isEnumDeclaration(n)) && n.name && n.name.text === SYM) { pos = n.name.getStart(sf); return; }
  ts.forEachChild(n, visit);
};
visit(sf);
const t1 = Date.now();
const refs = svc.getReferencesAtPosition(abs(FILE), pos) ?? [];
const t2 = Date.now();
svc.getReferencesAtPosition(abs(FILE), pos);
const t3 = Date.now();
const tsFiles = new Set(refs.map((r) => path.relative(dir, r.fileName)).filter((f) => f !== FILE));

const timed = (label, fn) => { const s = Date.now(); let v; try { v = fn(); } catch (e) { v = { error: String(e.stderr ?? e.message).slice(0, 160) }; } return { ms: Date.now() - s, v, label }; };
const grep = timed('git grep -w -l', () => new Set(execFileSync('git', ['grep', '-w', '-l', SYM, '--', '*.ts'], { cwd: dir }).toString().trim().split('\n').filter((f) => f && f !== FILE)));
const am = timed('agentmap --relates dependents', () => {
  const j = JSON.parse(execFileSync(path.join(BIN, 'agentmap'), ['--relates', FILE, '--json'], { cwd: dir }).toString());
  const deps = j.dependents ?? j.importedBy ?? j.relates?.dependents ?? [];
  return new Set((Array.isArray(deps) ? deps : []).map((d) => (typeof d === 'string' ? d.split(' ')[0] : d.path ?? d.file ?? JSON.stringify(d))));
});
let ciRaw = '';
const ci = timed('codeindex refs', () => {
  ciRaw = execFileSync(path.join(BIN, 'codeindex'), ['refs', SYM, '--repo', '.', '--index', INDEX], { cwd: dir }).toString();
  const j = JSON.parse(ciRaw);
  const arr = Array.isArray(j) ? j : j.referencingFiles ?? j.references ?? j.refs ?? [];
  return new Set(arr.map((x) => (typeof x === "string" ? x : x.file ?? x.path ?? JSON.stringify(x).slice(0, 60))).filter((f) => f !== FILE));
});
const cmp = ({ label, v, ms }) => {
  if (!(v instanceof Set)) return `${label}: ${JSON.stringify(v)} (${ms} ms)`;
  const tp = [...v].filter((f) => tsFiles.has(f)).length;
  return `${label}: ${ms} ms files=${v.size} tp=${tp} precision=${v.size ? (tp / v.size).toFixed(2) : '-'} recall=${tsFiles.size ? (tp / tsFiles.size).toFixed(2) : '-'}`;
};
console.log(JSON.stringify({ repo: path.basename(dir), symbol: SYM, tsFiles: files.length, createServiceMs: t1 - t0, firstReferencesMs: t2 - t1, secondReferencesMs: t3 - t2, tsReferencingFiles: tsFiles.size, rssMB: Math.round(process.memoryUsage().rss / 1048576) }));
console.log(cmp(grep)); console.log(cmp(am)); console.log(cmp(ci));
console.log('codeindex raw head:', ciRaw.slice(0, 400).replace(/\n/g, ' '));
console.log('ts refs sample:', [...tsFiles].slice(0, 4).join(', '));
