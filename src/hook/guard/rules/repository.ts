// Serves task and review: git and glab commands that change repository or merge-request state ask the user.
import type { Segment } from '../../shell/command-parser.ts';

export const USER_DECIDES = 'The user decides, so this asks. Approve only if the user asked for it in this session.';

const stateChangeReason = (operation: string): string =>
  `AMBICODE: \`${operation}\` changes repository or merge-request state. Skills never do this on their own; ${USER_DECIDES}`;

const GIT_WRITES = new Set(['commit', 'push', 'reset', 'checkout', 'clean', 'rebase', 'merge']);
const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env']);
// `push` is `save`'s current name; `apply`, `clear`, `branch` and `store` change the stash or the working tree too.
const READ_ONLY_STASH = new Set(['list', 'show']);
const UNKNOWN_GIT = 'git ?';

/** The state-changing operation a git command runs; `UNKNOWN_GIT` when only the shell or an alias says which. */
function gitOperation(segment: Segment): string | null {
  const { argv, opaque } = segment;
  let at = 1;
  while (at < argv.length && argv[at]!.startsWith('-') && !opaque[at]) {
    const value = argv[at + 1];
    if (/^--?c(?:onfig-env)?$/.test(argv[at]!) && (opaque[at + 1] === true || /^alias\./i.test(value ?? ''))) return UNKNOWN_GIT;
    at += GIT_VALUED.has(argv[at]!) ? 2 : 1;
  }
  const subcommand = argv[at];
  if (subcommand === undefined) return null;
  if (opaque[at]) return UNKNOWN_GIT;
  const rest = argv.slice(at + 1);
  if (GIT_WRITES.has(subcommand)) return `git ${subcommand}`;
  if (subcommand === 'stash') {
    // Only the word right after `stash` names a subcommand; `git stash -m list` saves a stash named "list".
    const action = rest[0] !== undefined && !opaque[at + 1] && !rest[0].startsWith('-') ? rest[0] : undefined;
    return action !== undefined && READ_ONLY_STASH.has(action) ? null : `git stash${action === undefined ? '' : ` ${action}`}`;
  }
  if (subcommand === 'branch') {
    const flags = rest.filter((word) => /^-[A-Za-z]+$/.test(word)).join('');
    const remove = flags.includes('d') || rest.includes('--delete');
    const force = flags.includes('f') || rest.includes('--force');
    if (flags.includes('D') || (remove && force)) return 'git branch -D';
  }
  return null;
}

/** The ask a git or glab segment earns, or `null`. `name` is the segment's command name. */
export function repositoryAsk(segment: Segment, name: string): string | null {
  if (name === 'glab') return segment.argv[1] === 'mr' ? stateChangeReason('glab mr') : null;
  if (name !== 'git') return null;
  const operation = gitOperation(segment);
  if (operation === UNKNOWN_GIT) return `AMBICODE: cannot tell which git operation this runs: an expansion or an alias names it. ${USER_DECIDES}`;
  return operation === null ? null : stateChangeReason(operation);
}
