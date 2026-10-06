/**
 * The one `--json` serialization, so a byte count measured before printing equals stdout.
 * `pretty` is the default, for output a person reads. `compact` is one line, for payloads
 * only a model reads (`prepare`'s default, `locate`). Both end with exactly one newline.
 */
export type JsonFormat = 'pretty' | 'compact';

export type ExclusionReason =
  | 'excluded-directory'
  | 'operator-pattern'
  | 'not-selected'
  | 'test-file'
  | 'credential-like-name'
  | 'binary-extension'
  | 'binary-content'
  | 'too-large'
  | 'symlink';

/**
 * `exclude` comes from `--exclude` and `review.excludePaths`; `include` from `--only`.
 * Both empty by default: a review only ever narrows because somebody said to.
 */
export interface OperatorPatterns {
  exclude?: readonly string[];
  include?: readonly string[];
  excludeTests?: boolean;
}
