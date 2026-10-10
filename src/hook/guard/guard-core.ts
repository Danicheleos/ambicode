// Imports only import-free modules: this file is bundled into a standalone entry whose startup time is the point
// (see guard.ts). Files are read by the injected `GuardState`, never from here.
import { ownerOfHarness } from '#harness/session/harness';
import { ownerOf } from '#modules/evidence/ownership';
import { basename, parseCommand, type Segment } from '../shell/command-parser.ts';
import type { ActiveRoute, GuardInput, GuardState } from '../types/guard.ts';

type Decision = Record<string, unknown>;

function decide(permissionDecision: 'ask' | 'deny', reason: string): Decision {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason: reason } };
}

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const RUN_DIR = /(?:^|\/)\.ambicode\/(?:tasks|reviews)(?:\/|$)/;
const PLAN_BODY = /^(.*\/)?\.ambicode\/tasks\/([^/]+)\/steps\/plan-body\.md$/;
const CONTEXT_DIR = /(?:^|\/)\.ambicode\/context(?:\/|$)/;

function isAbsolute(file: string): boolean {
  return file.startsWith('/') || file.startsWith('~') || /^[A-Za-z]:\//.test(file);
}

/** A word quoted in a reason, cut so a pathological command cannot make the reason megabytes long. */
const shown = (word: string): string => (word.length > 120 ? `${word.slice(0, 120)}…` : word);


/** Lexical: `.` and `..` resolved, `\` read as `/`, a relative path joined to `base` when one is known. */

function normalize(file: string, base?: string): string {
  let text = file.replace(/\\/g, '/');
  if (base !== undefined && !isAbsolute(text)) text = `${base.replace(/\\/g, '/')}/${text}`;
  const parts: string[] = [];
  for (const [index, part] of text.split('/').entries()) {
    if (part === '.' || (part === '' && index > 0)) continue;
    const last = parts.at(-1);
    if (part === '..' && last === '') continue;
    if (part === '..' && last !== undefined && last !== '..') parts.pop();
    else parts.push(part);
  }
  if (parts.length === 1 && parts[0] === '') return '/';
  return parts.join('/') || '.';
}

function noteSaveReason(pluginRoot: string): string {
  return (
    `AMBICODE: .ambicode/tasks/ and .ambicode/reviews/ are written only through \`node "${pluginRoot}/scripts/ambicode.mjs" note save ` +
    '--task <slug> --kind investigation|plan-draft|notes` or `note promote --task <slug>`, with the note on standard ' +
    'input. It names the file, stamps the time and adds the label. Run that instead.'
  );
}

function planBodyReason(slug: string): string {
  return `AMBICODE: the plan body is not written with the shell. Write it with the Write tool to .ambicode/tasks/${slug}/steps/plan-body.md, then run route next: the route saves it as the draft and checks it.`;
}

const USER_DECIDES = 'The user decides, so this asks. Approve only if the user asked for it in this session.';

function stateChangeReason(operation: string): string {
  return `AMBICODE: \`${operation}\` changes repository or merge-request state. Skills never do this on their own; ${USER_DECIDES}`;
}

const GIT_WRITES = new Set(['commit', 'push', 'reset', 'checkout', 'clean', 'rebase', 'merge']);
const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env']);
// `push` is `save`'s current name; `apply`, `clear`, `branch` and `store` change the stash or the working tree too.
const READ_ONLY_STASH = new Set(['list', 'show']);

const commandName = (segment: Segment): string => basename(segment.argv[0] ?? '');
// A name whose last component only the shell expands (`$(which git)`, `$TOOL`) could be any command.
const unknownName = (segment: Segment): boolean => segment.opaque[0] === true && /[$`]/.test(commandName(segment));
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

function recursive(segment: Segment): boolean {
  for (const [at, word] of segment.argv.entries()) {
    if (at === 0 || segment.opaque[at]) continue;
    if (word === '--') return false;
    if ((word.length > 2 && '--recursive'.startsWith(word)) || /^-[A-Za-z]*[rR]/.test(word)) return true;
  }
  return false;
}

function contains(directory: string, inner: string): boolean {
  return inner === directory || inner.startsWith(directory.endsWith('/') ? directory : `${directory}/`);
}

/** `rm -r` of the directory the command runs in, an ancestor of it, `/`, home or `*`. `cwd` is undefined when the hook gave none. */
function removesRoot(segment: Segment, cwd: string | undefined): string | null {
  if (!recursive(segment)) return null;
  for (const target of segment.writeTargets) {
    if (target.opaque) continue;
    const here = normalize(target.path);
    if (['/', '~', '~/', '*', './*'].includes(target.path) || /^\.\.?(?:\/|$)/.test(here)) return target.path;
    if (cwd !== undefined && contains(normalize(target.path, cwd), normalize(cwd))) return target.path;
  }
  return null;
}

// Expansions are not parsed, so a command nested in one is matched by its text.
const NESTED = /\$\(|`|<\(/;
const DANGEROUS = /\bgit\s+(?:\S+\s+)*?(?:commit|push|stash|reset|checkout|clean|rebase|merge|branch)\b|\bglab\s+mr\b|\.ambicode\/(?:tasks|reviews)|\brm\s+-\w*[rR]/;
const NESTED_REASON = 'AMBICODE: cannot read a command inside $(...) or backticks; approve only if you asked for it.';

const DIRECTORY_CHANGE = new Set(['cd', 'pushd', 'popd']);

/**
 * Per segment: git/glab state changes and `rm -r` of the root ask; a literal write target under the task directory
 * denies; a target only the shell can resolve asks, never denies (G14). Directories are not tracked, so a relative
 * target after a `cd` in the same command is not provably outside the task directory and asks. Heredoc bodies are
 * never tokenised, so a `note save` body is not inspected (M12).
 */
function bashDecision(command: string, cwd: string | undefined, pluginRoot: string): Decision {
  const asks = new Set<string>();
  const segments = parseCommand(command);
  let moved = false;
  for (const segment of segments) {
    if (segment.unparsed) {
      if (/\.ambicode\/(?:tasks|reviews)|git/.test(segment.raw)) asks.add(`AMBICODE: cannot tell what this runs: part of the command is not closed or is beyond what the guard parses. ${USER_DECIDES}`);
      continue;
    }
    if (segment.argv.some((word, at) => segment.opaque[at] && NESTED.test(word) && DANGEROUS.test(word))) asks.add(NESTED_REASON);
    const name = commandName(segment);
    if (unknownName(segment)) asks.add(`AMBICODE: cannot tell what this runs: \`${shown(segment.argv[0]!)}\` names a command only when the shell expands it. ${USER_DECIDES}`);
    if (name === 'git') {
      const operation = gitOperation(segment);
      if (operation === UNKNOWN_GIT) asks.add(`AMBICODE: cannot tell which git operation this runs: an expansion or an alias names it. ${USER_DECIDES}`);
      else if (operation !== null) asks.add(stateChangeReason(operation));
    }
    if (name === 'glab' && segment.argv[1] === 'mr') asks.add(stateChangeReason('glab mr'));
    if (name === 'rm') {
      const root = removesRoot(segment, cwd);
      if (root !== null) asks.add(`AMBICODE: \`rm -r ${root}\` deletes the working directory or everything above it. ${USER_DECIDES}`);
    }
    for (const target of segment.writeTargets) {
      const path = normalize(target.path, cwd);
      if (target.opaque) {
        asks.add(`AMBICODE: cannot tell where this writes: \`${shown(target.path)}\` is resolved only when the shell runs it. ${USER_DECIDES}`);
      } else if (RUN_DIR.test(path)) {
        const slug = PLAN_BODY.exec(path)?.[2];
        const reason = slug === undefined ? noteSaveReason(pluginRoot) : planBodyReason(slug);
        if (!segments.some((other) => other.unparsed)) return decide('deny', reason);
        asks.add(reason);
      } else if (moved && !isAbsolute(target.path)) {
        asks.add(`AMBICODE: cannot tell where this writes: \`${shown(target.path)}\` is relative to a directory an earlier \`cd\` changed. ${USER_DECIDES}`);
      }
    }
    if (DIRECTORY_CHANGE.has(name)) moved = true;
  }
  return asks.size === 0 ? {} : decide('ask', [...asks].join(' '));
}


const nonEmpty = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function routeOf(input: GuardInput, state: GuardState | undefined): ActiveRoute | null {
  const scratchpad = nonEmpty(input.scratchpad_dir);
  const session = nonEmpty(input.session_id);
  return state === undefined || (scratchpad === null && session === null) ? null : state.activeRoute(scratchpad, session);
}

function planBodyDecision(input: GuardInput, state: GuardState | undefined, taskDirectory: string, slug: string, pluginRoot: string): Decision {
  const refuse = (why: string): Decision =>
    decide('deny', `AMBICODE: steps/plan-body.md is written only by the session that owns the task's live plan route; ${why}. ${planBodyReason(slug)}`);
  const session = nonEmpty(input.session_id);
  if (session === null) return refuse('the hook named no session');
  if (!isAbsolute(taskDirectory)) return refuse('the hook gave no absolute path for it');
  const route = routeOf(input, state);
  if (route === null) return refuse('no active route is on record for this session');
  if (route.skill !== 'plan' || route.task !== slug) return refuse(`this session's active route is ${route.skill} on ${route.task}, not plan on ${slug}`);
  const entries = state!.ledger(taskDirectory);
  if (entries === null) return refuse(`the ledger of ${slug} is missing, unreadable or over 1 MiB`);
  const owner = ownerOf(entries, slug);
  if (owner.state === 'none') return refuse(`no plan route is open on ${slug}`);
  if (owner.state === 'unknown') return refuse(owner.reason);
  const mine = ownerOfHarness(entries, session);
  if (mine !== null && owner.session === mine) return {};
  return refuse(`session ${owner.session} owns it`);
}

function fileDecision(input: GuardInput, state: GuardState | undefined, pluginRoot: string): Decision {
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof file !== 'string' || file === '') return {};
  const cwd = nonEmpty(input.cwd) ?? undefined;
  const target = normalize(file, cwd);
  if (RUN_DIR.test(target)) {
    const body = PLAN_BODY.exec(target);
    if (body !== null && !RUN_DIR.test(body[1] ?? '')) {
      return planBodyDecision(input, state, `${body[1] ?? ''}.ambicode/tasks/${body[2]!}`, body[2]!, pluginRoot);
    }
    return decide('deny', noteSaveReason(pluginRoot));
  }
  if (CONTEXT_DIR.test(target)) return decide('deny', 'AMBICODE: .ambicode/context/ is written only through `ambicode context write`, which enforces the size limits and refuses duplicates; use `ambicode context write`.');
  return {};
}

function permissionOf(decision: Decision): string | null {
  const output = decision['hookSpecificOutput'] as { permissionDecision?: string } | undefined;
  return output?.permissionDecision ?? null;
}

/** In a headless route nobody can answer an ask: it becomes a deny that sends the model to finish with the reason. */
function headlessDeny(decision: Decision): Decision {
  const reason = (decision['hookSpecificOutput'] as { permissionDecisionReason?: string }).permissionDecisionReason ?? '';
  return decide(
    'deny',
    `${reason} This route is headless and no one can approve it, so do not run it. ` +
      'Run `route stop --task <slug> --reason blocked --detail "permission-denied: <what you needed>"`, then ' +
      'finish with a final message that says "permission-denied: <what you needed>".',
  );
}

/** `pluginRoot` is the hook's `CLAUDE_PLUGIN_ROOT`, so the command in a message runs as written. */
export function guardDecision(input: GuardInput, pluginRoot = '${CLAUDE_PLUGIN_ROOT}', state?: GuardState): Decision {
  if (input.hook_event_name !== 'PreToolUse') return {};
  const tool = input.tool_name ?? '';
  const command = input.tool_input?.command;
  let decision: Decision = {};
  if (FILE_TOOLS.has(tool)) decision = fileDecision(input, state, pluginRoot);
  else if (tool === 'Bash' && typeof command === 'string') decision = bashDecision(command, nonEmpty(input.cwd) ?? undefined, pluginRoot);
  const route = routeOf(input, state);
  return permissionOf(decision) === 'ask' && route?.headless === true ? headlessDeny(decision) : decision;
}
