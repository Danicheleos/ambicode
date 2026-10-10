// Candidate rule files for /ambicode:rules: what a team usually writes rules in. The model reads them; this only lists paths.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const root = input.repositoryRoot;
const SKIPPED = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.ambicode']);
// The model reads each candidate; 40 paths is a screenful, the rest are counted so nothing is silently dropped.
const MAX_PATHS = 40;
const MAX_DEPTH = 4;

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

// Listed first means more likely to hold rules: agent instructions and contribution guides before general docs.
const TIERS = [
  /^(CLAUDE|AGENTS)\.md$|(^|\/)CONTRIBUTING[^/]*$|^\.github\/(copilot-instructions\.md|instructions\/)|^\.cursor\/rules\//i,
  /(^|\/)(adrs?|decisions?)\/[^/]*\.md$/i,
  /^\.github\/.*\.md$/i,
  /^docs\/.*\.md$/i,
];
const candidates = TIERS.flatMap((tier, index) => files.filter((file) => tier.test(file) && !TIERS.slice(0, index).some((earlier) => earlier.test(file))).sort());

// A request or a `revise discover --source` answer may name files or pages in the user's words.
const words = [input.args?.text ?? '', ...(input.revise?.args?.source ?? [])].join(' ').split(/[\s,]+/).filter(Boolean);
const urls = words.filter((word) => word.startsWith('https://'));
const named = words.filter((word) => !word.startsWith('https://') && existsSync(path.join(root, word)) && !path.isAbsolute(word) && !word.split('/').includes('..'));
const missing = words.filter((word) => /[./]/.test(word) && !word.startsWith('https://') && !named.includes(word) && /\.\w+$/.test(word));

const shown = candidates.slice(0, MAX_PATHS);
const payload = [
  `Rule sources found: ${shown.join(', ') || 'none'}${candidates.length > MAX_PATHS ? ` (+${candidates.length - MAX_PATHS} more)` : ''}`,
  ...(named.length === 0 ? [] : [`Named in the request: ${named.join(', ')}`]),
  ...(urls.length === 0 ? [] : [`Pages named in the request: ${urls.join(', ')}. Read each with the Atlassian MCP tools you can see; a rule from a page cites its https URL as \`location\`.`]),
  ...(missing.length === 0 ? [] : [`Not found: ${missing.join(', ')}`]),
].join('\n');
process.stdout.write(JSON.stringify({ payload }));
