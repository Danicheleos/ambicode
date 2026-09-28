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

const GUIDANCE: Record<Ecosystem, Omit<NavigationGuidance, 'ecosystem'>> = {
  typescript: {
    strategy: 'shortlist-then-known-paths-then-lsp-then-targeted-search',
    plugin: 'typescript-lsp@claude-plugins-official',
    serverCommand: 'typescript-language-server',
    setupCommands: [
      'claude plugin install typescript-lsp@claude-plugins-official --scope user',
      'npm install -g typescript-language-server typescript',
    ],
    statusSource: 'current-session',
    evidenceRequirement:
      'Report the LSP operations used, or the targeted-search fallback reason.',
    readGuidance: 'Read spans with offset/limit, not whole files.',
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
    evidenceRequirement:
      'Report the LSP operations used, or the targeted-search fallback reason.',
    readGuidance: 'Read spans with offset/limit, not whole files.',
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
