import fs from 'node:fs';
import path from 'node:path';

const [ctx, out] = process.argv.slice(2);
if (!ctx || !out) { console.error('usage: node overview-index.mjs <contextDir> <outFile>'); process.exit(1); }
const modRoot = path.join(ctx, 'modules');

function walk(dir) {
  const r = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) r.push(...walk(p)); else if (e.name.endsWith('.md')) r.push(p);
  }
  return r;
}

let missing = 0;
function parse(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const h1 = lines.find((l) => /^# /.test(l));
  const title = h1 ? h1.slice(2).trim() : '';
  const i = lines.findIndex((l) => /^##\s+Purpose\s*$/.test(l));
  let purpose = '';
  if (i >= 0) {
    const body = [];
    for (let j = i + 1; j < lines.length && !/^##\s/.test(lines[j]); j++) {
      const t = lines[j].replace(/^\s*[-*]\s+/, '').trim();
      if (t) body.push(t);
    }
    purpose = body.join(' ').trim();
  }
  if (!purpose) missing++;
  return { title, purpose };
}

const rel = (p) => path.relative(ctx, p).split(path.sep).join('/');
const all = walk(modRoot);
const folders = new Map(); // dir (rel to modules) -> node
for (const f of all) {
  if (path.basename(f) !== 'overview.md') continue;
  const dir = rel(path.dirname(f)).replace(/^modules\//, '');
  const { title, purpose } = parse(f);
  const notes = all
    .filter((n) => path.dirname(n) === path.dirname(f) && path.basename(n) !== 'overview.md')
    .sort()
    .map((n) => parse(n).purpose);
  folders.set(dir, { dir, title, purpose, notes, children: [], file: rel(f) });
}
const top = [];
for (const node of [...folders.values()].sort((a, b) => a.dir.localeCompare(b.dir))) {
  let parent = null;
  const parts = node.dir.split('/');
  for (let k = parts.length - 1; k > 0 && !parent; k--) parent = folders.get(parts.slice(0, k).join('/'));
  (parent ? parent.children : top).push(node);
}

const lines = [];
let purposeLines = 0;
function emit(n, depth) {
  const pad = '  '.repeat(depth);
  lines.push(`${pad}[${n.dir}](${n.file}) - ${n.title} - ${n.purpose}`);
  for (const p of n.notes) { lines.push(`${pad}  - ${p}`); purposeLines++; }
  for (const c of n.children) emit(c, depth + 1);
}
for (const n of top) emit(n, 0);
const text = lines.join('\n') + '\n';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text);
const bytes = Buffer.byteLength(text);
console.log(JSON.stringify({ lines: lines.length, bytes, tokens: Math.round(bytes / 4), folders: folders.size, purposeLines, missing }));
