#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = process.argv.indexOf('--root');
const root = path.resolve(arg > 0 ? process.argv[arg + 1] : process.cwd());
const fail = (error) => { console.log(JSON.stringify({ error })); process.exit(2); };

let top = '';
try { top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { fail('not a git repository'); }
// realpath: macOS /var is /private/var, so a plain compare rejects a real root.
const same = (a, b) => realpathSync(a) === realpathSync(b);
if (!same(top, root)) fail(`not the git root (root is ${top})`);

const created = [];
const existing = [];
for (const dir of ['.ambicode/tasks', '.ambicode/reviews', '.ambicode/context']) {
  const full = path.join(root, dir);
  if (existsSync(full)) existing.push(dir);
  else { mkdirSync(full, { recursive: true }); created.push(dir); }
}

const configPath = path.join(root, '.ambicode', 'config.yaml');
const configExisted = existsSync(configPath);
if (!configExisted) {
  const id = path.basename(root).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
  const template = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'config.yaml'), 'utf8');
  writeFileSync(configPath, template.replaceAll('__PROJECT_ID__', id));
  created.push('.ambicode/config.yaml');
}

const ignorePath = path.join(root, '.gitignore');
let gitignore = 'present';
if (!existsSync(ignorePath)) { writeFileSync(ignorePath, '.ambicode/\n'); gitignore = 'created'; }
else {
  const text = readFileSync(ignorePath, 'utf8');
  if (!text.split(/\r?\n/).some((line) => ['.ambicode', '.ambicode/', '/.ambicode', '/.ambicode/'].includes(line.trim()))) {
    writeFileSync(ignorePath, `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}.ambicode/\n`);
    gitignore = 'added';
  }
}
console.log(JSON.stringify({ created, existing, gitignore, configExisted }));
