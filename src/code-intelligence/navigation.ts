import type { Ecosystem } from '../contracts/primitives.ts';

/**
 * AMBICODE never starts a language server; only the current session knows
 * whether its LSP tools are active, so consumers report what they observed.
 */
export interface NavigationGuidance {
  strategy: 'shortlist-then-known-paths-then-lsp-then-targeted-search';
  ecosystem: Ecosystem;
  plugin: string;
  serverCommand: string;
  setupCommands: string[];
  statusSource: 'current-session';
  evidenceRequirement: string;
  readGuidance: string;
}

// Sent on every call; context-cost.test.ts caps it under 100 chars.
const EVIDENCE_REQUIREMENT =
  'Report the LSP operations used. "No LSP tools" counts only if ToolSearch select:LSP found none.';

// Delivered in the hook message: skills/shared/prepare-output.md is read on demand, and the order went unread there.
export const READING_ORDER = [
  "How to read code (a link-block is path:lineA-lineB or path:lineA, one symbol's range):",
  '1. ToolSearch select:LSP (deferred). workspaceSymbol and documentSymbol turn the terms and the shortlist into link-blocks. Absolute paths; retry a failed call once.',
  '2. LSP finds nothing: stop. Your whole reply is one question asking the user for the scope. No Grep, no Bash search, no note. Search code with LSP before any Grep.',
  '3. Read link-blocks with offset/limit. A related type, method or call you cannot place: goToDefinition, findReferences or workspaceSymbol on it, read the new link-blocks, repeat until the feature is understood. Before writing something new, workspaceSymbol for an existing one.',
  '4. LSP returns only paths: Grep -n that file for lines and structure, then Read chunks.',
  '5. Whole-file Read is the last resort: steps 1-4 failed and the file is under 300 lines.',
].join('\n');

const GUIDANCE: Record<Ecosystem, Omit<NavigationGuidance, 'ecosystem'>> = {
  typescript: {
    strategy: 'shortlist-then-known-paths-then-lsp-then-targeted-search',
    plugin: 'typescript-lsp@claude-plugins-official',
    serverCommand: 'typescript-language-server',
    setupCommands: [
      'claude plugin install typescript-lsp@claude-plugins-official --scope user',
      'npm install -g typescript-language-server typescript@6',
    ],
    statusSource: 'current-session',
    evidenceRequirement: EVIDENCE_REQUIREMENT,
    readGuidance: 'Read spans with offset/limit. LSP: ToolSearch select:LSP first, filePath absolute.',
  },
  python: {
    strategy: 'shortlist-then-known-paths-then-lsp-then-targeted-search',
    plugin: 'pyright-lsp@claude-plugins-official',
    serverCommand: 'pyright-langserver',
    setupCommands: [
      'claude plugin install pyright-lsp@claude-plugins-official --scope user',
      'pipx install pyright',
    ],
    statusSource: 'current-session',
    evidenceRequirement: EVIDENCE_REQUIREMENT,
    readGuidance: 'Read spans with offset/limit. LSP: ToolSearch select:LSP first, filePath absolute.',
  },
};

export function navigationFor(ecosystem: Ecosystem): NavigationGuidance {
  const guidance = GUIDANCE[ecosystem];
  return {
    ecosystem,
    ...guidance,
    setupCommands: [...guidance.setupCommands],
  };
}
