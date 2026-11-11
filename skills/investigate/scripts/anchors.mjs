// Shared by check-citations (investigate) and plan-check (plan): what a `path:line` reference looks like.
// An extension holds a letter: `v1.2:3` and `10.0.0.1:80` are versions and addresses, not files, and failed as missing-file.
const PATH = '[\\w@./\\\\-]+\\.(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]+';
export const anchorPattern = () => new RegExp(`(?<![\\w./-])(${PATH}):(\\d+(?:\\s*[-–]\\s*\\d+)?)`, 'g');
