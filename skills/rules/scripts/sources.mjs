// Shared by discover (the list at the sources gate) and chosen (what the drafter reads).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

// 40 paths is a screenful; the rest are counted so nothing is silently dropped.
const MAX_PATHS = 40;
export const DRAFTS = '.ambicode/policies/drafts';

// One level only: a docs tree of thousands of pages is a source the user names, not one to list.
const md = (root, dir) => { try { return readdirSync(path.join(root, dir)).filter((name) => name.endsWith('.md')).map((name) => `${dir}/${name}`).sort(); } catch { return []; } };

const nestedClaude = (root) => {
  try {
    return execFileSync('git', ['ls-files', '-z', '--', '*CLAUDE.md'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 20, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter((file) => file.includes('/') && path.basename(file) === 'CLAUDE.md' && !file.startsWith('.claude/')).sort();
  } catch { return []; }
};

export const candidatesOf = (root) => [
  ...['CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md', 'CONTRIBUTING.md', '.github/copilot-instructions.md'].filter((file) => existsSync(path.join(root, file))),
  ...md(root, '.claude/rules'), ...md(root, '.cursor/rules'), ...md(root, '.github/instructions'), ...md(root, 'docs'), ...nestedClaude(root),
];

/** The found list (only when `list`), then the files and pages the user's words name. */
export function sourcesText(root, texts, list = true) {
  const found = candidatesOf(root);
  const words = texts.join(' ').split(/[\s,]+/).filter(Boolean);
  const urls = words.filter((word) => word.startsWith('https://'));
  const named = words.filter((word) => !word.startsWith('https://') && !path.isAbsolute(word) && !word.split('/').includes('..') && existsSync(path.join(root, word)));
  return [
    ...(list ? [`Rule sources found: ${found.slice(0, MAX_PATHS).join(', ') || 'none'}${found.length > MAX_PATHS ? ` (+${found.length - MAX_PATHS} more)` : ''}`] : []),
    ...(named.length === 0 ? [] : [`Named in the request: ${named.join(', ')}`]),
    ...(urls.length === 0 ? [] : [`Pages named in the request: ${urls.join(', ')}. Read each with the Atlassian MCP tools you can see; a rule from a page cites its https URL as \`location\`.`]),
  ];
}
