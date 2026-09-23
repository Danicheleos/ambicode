import type { Ecosystem } from '../contracts/primitives.ts';

/**
 * One registry for code-intelligence setup. AMBICODE reuses Claude Code's
 * official LSP plugins; it does not ship, start, or index a language server.
 * The current Claude session remains the only reliable source of whether its
 * LSP tools are actually active, so consumers must report what they observed.
 */
export interface NavigationGuidance {
  /**
   * The bounded order a skill navigates in (R4). The shortlist
   * (`ambicode locate`) narrows the repository to candidate files from the
   * request itself; LSP then goes from a candidate to its definitions,
   * references and callers. The two are not alternatives: `locate` finds the
   * candidates, LSP explains them, and targeted search is what is left when
   * neither answered.
   */
  strategy: 'shortlist-then-known-paths-then-lsp-then-targeted-search';
  ecosystem: Ecosystem;
  plugin: string;
  serverCommand: string;
  /** Installation guidance: `init` and `config` report it; `prepare` does not. */
  setupCommands: string[];
  statusSource: 'current-session';
  /**
   * One clause, because it is re-sent on every `prepare` call and the
   * authoring session only has to do one thing with it (R2 change 3).
   */
  evidenceRequirement: string;
  /**
   * How much of a file the order expects a skill to open. It lives here rather
   * than only in `skills/shared/prepare-output.md` because a run that skips
   * that second file still receives this one: investigation 3c2188c8 read 40
   * files whole for 207,655 bytes — 74% of every tool result it produced — and
   * cited 607 lines of them, never having opened the pointer. Same one-clause
   * budget as `evidenceRequirement`, for the same per-call reason.
   */
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
