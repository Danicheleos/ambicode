export interface BadAnchor { path: string; line: string; reason: 'missing-file' | 'outside-repository'
  | 'line-out-of-range' | 'identifier-not-near'; identifier?: string }

export interface PlanCheckResult {
  anchors: { checked: number; bad: BadAnchor[]; badTotal: number };
  acs: { mapped: number; unmapped: string[]; unmappedTotal: number };
  duplicates: { name: string; declaredAt: string }[];
  /** Why no name was looked up: an empty `duplicates` then means "not checked", not "none". */
  duplicatesSkipped?: string;
}

/**
 * The only host variables a worker receives; every other token or secret the shell holds is
 * absent from the child. `HOME`, `USER` and XDG stay because subscription/keychain login reads them.
 */
export const WORKER_ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USER', 'TMPDIR',
  // Claude Code reads this, else a literal "/tmp", never TMPDIR; sandboxed children die on EPERM without it.
  'CLAUDE_CODE_TMPDIR',
  'LANG', 'LC_ALL', 'TERM',
  'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN',
] as const;

/** A retry re-asks for the same answer, correctly serialized; 1 would discard a whole run on one slip. */
export const STRUCTURED_OUTPUT_ATTEMPTS = '3';
