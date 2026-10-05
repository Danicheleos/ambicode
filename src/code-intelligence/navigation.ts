import type { Ecosystem } from '../contracts/primitives.ts';

/** AMBICODE never starts a language server; the plugin to install is setup guidance only. */
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

// Sent on every call; context-cost.test.ts caps both lines under 100 chars. The full reading guidance is a route step's text.
const EVIDENCE_REQUIREMENT = 'Only CLI calls (map, refs, find) are recorded. Run find before adding a helper.';
const READ_GUIDANCE = 'The map is a hypothesis. Read batched, then spans. Verify imports for colliding names.';

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
    readGuidance: READ_GUIDANCE,
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
    readGuidance: READ_GUIDANCE,
  },
};

export function navigationFor(ecosystem: Ecosystem): NavigationGuidance {
  const guidance = GUIDANCE[ecosystem];
  return { ecosystem, ...guidance, setupCommands: [...guidance.setupCommands] };
}
