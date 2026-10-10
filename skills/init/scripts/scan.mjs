// What the model judges a repository from: manifests, lockfiles, package scripts, tools, packs, rule sources, config state.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = JSON.parse(readFileSync(0, 'utf8')).repositoryRoot;
const SKIPPED = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.venv', 'venv', '__pycache__', '.ambicode']);
const MANIFEST = /^(package\.json|pyproject\.toml|setup\.py|requirements.*\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json|.+\.(csproj|sln))$/;
const LOCKFILE = /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|uv\.lock|Pipfile\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/;
const TOOLS = ['prettier', 'eslint', 'vitest', 'jest', 'playwright', 'tsc', 'black', 'ruff', 'pytest', 'mypy'];
const RULE_SOURCES = ['CLAUDE.md', 'CONTRIBUTING.md', 'docs', '.cursor/rules', '.github/instructions', '.github/copilot-instructions.md'];
// A monorepo with hundreds of manifests must not bury the other sections; the model sees the count of what was cut.
const LIST_CAP = 40;

// Pruned while walking: a recursive listing would read all of node_modules before the filter ran.
const files = [];
const walk = (relative, depth) => {
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const name = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isFile()) files.push(name);
    else if (entry.isDirectory() && depth < 3 && !SKIPPED.has(entry.name)) walk(name, depth + 1);
  }
};
walk('', 0);
const find = (pattern) => files.filter((file) => pattern.test(path.basename(file))).sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1));
const listed = (list) => (list.length === 0 ? 'none' : list.slice(0, LIST_CAP).join(', ') + (list.length > LIST_CAP ? `, +${list.length - LIST_CAP} more` : ''));
const manifests = find(MANIFEST);
const scripts = find(/^package\.json$/).map((file) => {
  try { return `${file}: ${JSON.stringify(JSON.parse(readFileSync(path.join(root, file), 'utf8')).scripts)}`; } catch { return `${file}: unreadable`; }
});
const onPath = (tool) => [...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean), path.join(root, 'node_modules', '.bin')]
  .some((dir) => ['', '.cmd', '.exe'].some((suffix) => existsSync(path.join(dir, tool + suffix))));
const policies = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'policies');
let packs = [];
try { packs = readdirSync(policies).filter((file) => file.endsWith('.yaml')).sort().map((file) => `builtin/${file.replace(/\.yaml$/, '')}`); } catch { /* a plugin without policies lists none */ }
let baseline = '';
try { baseline = execFileSync('git', ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().replace(/^refs\/remotes\//, ''); } catch { /* no origin/HEAD */ }

process.stdout.write(JSON.stringify({ payload: [
  `manifests: ${listed(manifests)}`,
  `lockfiles: ${listed(find(LOCKFILE))}`,
  `package scripts:\n${scripts.join('\n') || 'none'}`,
  `tools on PATH or in node_modules/.bin: ${TOOLS.filter(onPath).join(', ') || 'none'}`,
  `packs (read policies/<id>.yaml for appliesTo): ${packs.join(', ') || 'none'}`,
  `rule sources: ${RULE_SOURCES.filter((candidate) => existsSync(path.join(root, candidate))).join(', ') || 'none'}`,
  `baseline: ${baseline === '' ? 'none (no refs/remotes/origin/HEAD); write baseline: ""' : baseline}`,
  `config: ${existsSync(path.join(root, '.ambicode', 'config.yaml')) ? 'present (read it and keep what the user set)' : 'absent'}`,
].join('\n') }));
