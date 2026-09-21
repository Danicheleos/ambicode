import type { Ecosystem } from '../contracts/primitives.ts';

/**
 * One registry for code-intelligence setup. AMBICODE reuses Claude Code's
 * official LSP plugins; it does not ship, start, or index a language server.
 * The current Claude session remains the only reliable source of whether its
 * LSP tools are actually active, so consumers must report what they observed.
 */
export interface NavigationGuidance {
  strategy: 'known-paths-then-lsp-then-targeted-search';
  ecosystem: Ecosystem;
  plugin: string;
  serverCommand: string;
  setupCommands: string[];
  statusSource: 'current-session';
  evidenceRequirement: string;
}

const GUIDANCE: Record<Ecosystem, Omit<NavigationGuidance, 'ecosystem'>> = {
  typescript: {
    strategy: 'known-paths-then-lsp-then-targeted-search',
    plugin: 'typescript-lsp@claude-plugins-official',
    serverCommand: 'typescript-language-server',
    setupCommands: [
      'claude plugin install typescript-lsp@claude-plugins-official --scope user',
      'npm install -g typescript-language-server typescript',
    ],
    statusSource: 'current-session',
    evidenceRequirement:
      'Report the LSP symbol operations used, or report targeted-search fallback with the reason LSP was unavailable or insufficient.',
  },
  python: {
    strategy: 'known-paths-then-lsp-then-targeted-search',
    plugin: 'pyright-lsp@claude-plugins-official',
    serverCommand: 'pyright-langserver',
    setupCommands: [
      'claude plugin install pyright-lsp@claude-plugins-official --scope user',
      'pipx install pyright',
    ],
    statusSource: 'current-session',
    evidenceRequirement:
      'Report the LSP symbol operations used, or report targeted-search fallback with the reason LSP was unavailable or insufficient.',
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
