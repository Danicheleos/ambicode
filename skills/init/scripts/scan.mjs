// What the model judges a repository from: manifests, lockfiles, package scripts, tools, packs, rule sources, config state.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const input = JSON.parse(readFileSync(0, 'utf8'));
const root = input.repositoryRoot;
const SKIPPED = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.venv', 'venv', '__pycache__', '.ambicode']);
const MANIFEST = /^(package\.json|pyproject\.toml|setup\.py|requirements.*\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json|.+\.(csproj|sln))$/;
const LOCKFILE = /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|uv\.lock|Pipfile\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/;
const TOOLS = ['prettier', 'eslint', 'vitest', 'jest', 'playwright', 'tsc', 'black', 'ruff', 'pytest', 'mypy'];
const RULE_SOURCES = ['CLAUDE.md', 'CONTRIBUTING.md', 'docs', '.cursor/rules', '.github/instructions', '.github/copilot-instructions.md'];
const MAX_DEPTH = 3;
// A monorepo with hundreds of manifests must not bury the other sections; the model sees the count of what was cut.
const LIST_CAP = 40;

const files = [];
(function walk(relative, depth) {
  let entries = [];
  try { entries = readdirSync(path.join(root, relative), { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const name = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isFile()) files.push(name);
    else if (entry.isDirectory() && depth < MAX_DEPTH && !SKIPPED.has(entry.name)) walk(name, depth + 1);
  }
})('', 0);

const byDepth = (a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1);
const listed = (list) => (list.length === 0 ? 'none' : list.slice(0, LIST_CAP).join(', ') + (list.length > LIST_CAP ? `, +${list.length - LIST_CAP} more` : ''));
const manifests = files.filter((file) => MANIFEST.test(path.basename(file))).sort(byDepth);
const lockfiles = files.filter((file) => LOCKFILE.test(path.basename(file))).sort(byDepth);

const scripts = [];
for (const file of manifests.filter((candidate) => path.basename(candidate) === 'package.json')) {
  try {
    const block = JSON.parse(readFileSync(path.join(root, file), 'utf8')).scripts;
    if (block !== undefined) scripts.push(`${file}: ${JSON.stringify(block)}`);
  } catch { scripts.push(`${file}: unreadable`); }
}

const onPath = (tool) => [...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean), path.join(root, 'node_modules', '.bin')]
  .some((dir) => ['', '.cmd', '.exe'].some((suffix) => existsSync(path.join(dir, tool + suffix))));
const tools = TOOLS.filter(onPath);

const policies = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'policies');
const packs = [];
try {
  for (const name of readdirSync(policies).filter((file) => file.endsWith('.yaml')).sort()) {
    const text = readFileSync(path.join(policies, name), 'utf8');
    const applies = /^appliesTo:\n((?:\s+- .*\n)+)/m.exec(text)?.[1].split('\n').filter(Boolean).slice(0, 2).map((line) => line.replace(/^\s+- /, '').replace(/"/g, '')).join(',');
    packs.push(`builtin/${name.replace(/\.yaml$/, '')}: ${applies ?? '?'}`);
  }
} catch { /* a plugin without policies lists none */ }

let baseline = '';
try { baseline = execFileSync('git', ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().replace(/^refs\/remotes\//, ''); } catch { /* no origin/HEAD */ }

const configFile = path.join(root, '.ambicode', 'config.yaml');
const config = existsSync(configFile) ? `present (${statSync(configFile).size} bytes; read it and keep what the user set)` : 'absent';

const payload = [
  `manifests: ${listed(manifests)}`,
  `lockfiles: ${listed(lockfiles)}`,
  `package scripts:\n${scripts.join('\n') || 'none'}`,
  `tools on PATH or in node_modules/.bin: ${tools.join(', ') || 'none'}`,
  `packs (id: first appliesTo globs):\n${packs.join('\n') || 'none'}`,
  `rule sources: ${RULE_SOURCES.filter((candidate) => existsSync(path.join(root, candidate))).join(', ') || 'none'}`,
  `baseline: ${baseline === '' ? 'none (no refs/remotes/origin/HEAD); write baseline: ""' : baseline}`,
  `config: ${config}`,
].join('\n');
process.stdout.write(JSON.stringify({ payload }));
