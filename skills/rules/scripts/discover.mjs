// Candidate rule files for /ambicode:rules: paths only, the model reads them.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const root = input.repositoryRoot;
// 40 paths is a screenful; the rest are counted so nothing is silently dropped.
const MAX_PATHS = 40;
// One level only: a docs tree of thousands of pages is a source the user names, not one to list.
const md = (dir) => { try { return readdirSync(path.join(root, dir)).filter((name) => name.endsWith('.md')).map((name) => `${dir}/${name}`).sort(); } catch { return []; } };
const candidates = [
  ...['CLAUDE.md', 'AGENTS.md', 'CONTRIBUTING.md', '.github/copilot-instructions.md'].filter((file) => existsSync(path.join(root, file))),
  ...md('.cursor/rules'), ...md('.github/instructions'), ...md('docs'),
];

// A request or a `revise discover --source` answer may name files or pages in the user's words.
const words = [input.args?.text ?? '', ...(input.revise?.args?.source ?? [])].join(' ').split(/[\s,]+/).filter(Boolean);
const urls = words.filter((word) => word.startsWith('https://'));
const named = words.filter((word) => !word.startsWith('https://') && !path.isAbsolute(word) && !word.split('/').includes('..') && existsSync(path.join(root, word)));
const payload = [
  `Rule sources found: ${candidates.slice(0, MAX_PATHS).join(', ') || 'none'}${candidates.length > MAX_PATHS ? ` (+${candidates.length - MAX_PATHS} more)` : ''}`,
  ...(named.length === 0 ? [] : [`Named in the request: ${named.join(', ')}`]),
  ...(urls.length === 0 ? [] : [`Pages named in the request: ${urls.join(', ')}. Read each with the Atlassian MCP tools you can see; a rule from a page cites its https URL as \`location\`.`]),
].join('\n');
process.stdout.write(JSON.stringify({ payload }));
