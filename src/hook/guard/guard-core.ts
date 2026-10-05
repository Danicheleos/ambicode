// Imports only import-free modules: this file is bundled into a standalone entry whose startup time is the point
// (see guard.ts). Files are read by the injected `GuardState`, never from here.
import { ownerOf } from '../../route/ownership.ts';
import type { LedgerEntry } from '../../task/ledger.ts';
import { basename, type Directories, parseCommand, type Segment } from '../shell/command-parser.ts';

export interface GuardInput {
  hook_event_name?: string;
  session_id?: unknown;
  cwd?: unknown;
  scratchpad_dir?: unknown;
  tool_name?: string;
  tool_input?: { command?: unknown; file_path?: unknown; notebook_path?: unknown };
}

/** The session's cached pointer to its active route (30 §2). A pointer alone never authorizes a write. */
export interface ActiveRoute {
  task: string;
  skill: string;
}

/** Bounded reads of session state and a task ledger; `null` when absent, too large or unreadable. */
export interface GuardState {
  activeRoute(scratchpadDir: string): ActiveRoute | null;
  ledger(taskDirectory: string): LedgerEntry[] | null;
}

type Decision = Record<string, unknown>;

function decide(permissionDecision: 'ask' | 'deny', reason: string): Decision {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason: reason } };
}

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const TASK_DIR = /(?:^|\/)\.ambicode\/task(?:\/|$)/;
const PLAN_BODY = /^(.*\/)?\.ambicode\/task\/([^/]+)\/steps\/plan-body\.md$/;
const INIT_FILES = /(?:^|\/)(?:\.ambicode\/config\.yaml|\.gitignore)$/;

function isAbsolute(file: string): boolean {
  return file.startsWith('/') || file.startsWith('~') || /^[A-Za-z]:\//.test(file);
}

/** A word quoted in a reason, cut so a pathological command cannot make the reason megabytes long. */
const shown = (word: string): string => (word.length > 120 ? `${word.slice(0, 120)}…` : word);

/** Lexical: `.` and `..` resolved, `\` read as `/`, relative paths joined to `base` when one is known. */
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
    `AMBICODE: .ambicode/task/ is written only through \`node "${pluginRoot}/scripts/ambicode.mjs" note save ` +
    '--task <slug> --kind investigation|plan|notes`, with the note on standard input. It names the file, stamps ' +
    'the time and adds the label. Run that instead.'
  );
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

// More distinct directories than any real command leaves open is one the shell alone can place.
const MAX_PLACES = 16;

/**
 * Every directory a path may be resolved in: `cwd` moved by each change, where a change that may not happen
 * (`maybe`) is taken both ways. `null`: only the shell knows; `undefined`: the hook gave no cwd.
 */
function placesOf(directories: Directories, cwd: string | undefined): (string | null | undefined)[] {
  let places: (string | null | undefined)[] = [cwd];
  for (const move of directories) {
    if (move === null) {
      places = [null];
      continue;
    }
    const to = typeof move === 'string' ? move : move.maybe;
    const moved = places.map((base) => (isAbsolute(to) ? normalize(to) : base === null ? null : normalize(to, base)));
    places = [...new Set(typeof move === 'string' ? moved : [...places, ...moved])];
    if (places.length > MAX_PLACES) places = [null];
  }
  return places;
}

// More brace alternatives than any real command writes to are taken to reach anywhere.
const MAX_EXPANSIONS = 64;

/** The words a brace pattern expands to, `{a..z}` sequences kept as `*`; `null` past `MAX_EXPANSIONS`. */
function braces(text: string): string[] | null {
  const open = text.indexOf('{');
  if (open === -1) return [text];
  let depth = 0;
  const commas: number[] = [];
  let close = -1;
  for (let at = open; at < text.length && close === -1; at++) {
    if (text[at] === '{') depth++;
    else if (text[at] === '}' && --depth === 0) close = at;
    else if (text[at] === ',' && depth === 1) commas.push(at);
  }
  if (close === -1) return [text];
  const body = text.slice(open + 1, close);
  const alternatives =
    commas.length > 0 ? [open, ...commas].map((from, index) => text.slice(from + 1, [...commas, close][index])) : body.includes('..') ? ['*'] : null;
  const rest = braces(text.slice(close + 1));
  if (rest === null) return null;
  const heads = alternatives === null ? [`${text.slice(0, close + 1)}`] : alternatives.flatMap((alternative) => braces(text.slice(0, open) + alternative) ?? ['*']);
  if (heads.length * rest.length > MAX_EXPANSIONS) return null;
  return heads.flatMap((head) => rest.map((tail) => head + tail));
}

/** Whether a glob component can match `name`, a dot at its start included (`dotglob`, `GLOB_DOTS`). */
function globMatches(glob: string, name: string): boolean {
  let source = '';
  for (let at = 0; at < glob.length; at++) {
    const c = glob[at]!;
    if (c === '*') source += '.*';
    else if (c === '?') source += '.';
    else if (c === '[') {
      const close = glob.indexOf(']', at + 2);
      if (close === -1) source += '\\[';
      else {
        source += `[${glob.slice(at + 1, close).replace(/^[!^]/, '^').replace(/[\\\]]/g, '\\$&')}]`;
        at = close;
      }
    } else source += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  try {
    return new RegExp(`^${source}$`).test(name);
  } catch {
    return true;
  }
}

/**
 * Where a glob or brace pattern resolved from `base` writes. Every brace alternative is written (zsh), so one in
 * the task directory is `task`; a glob that can match a path there is `unknown`, as only the shell knows the matches.
 */
function patternPlace(pattern: string, base: string | undefined): 'task' | 'outside' | 'unknown' {
  const words = braces(pattern);
  if (words === null) return 'unknown';
  let place: 'outside' | 'unknown' = 'outside';
  for (const word of words) {
    const path = normalize(word, base);
    if (!/[*?[]/.test(word)) {
      if (TASK_DIR.test(path)) return 'task';
      continue;
    }
    const parts = path.split('/');
    if (parts.some((part) => part.includes('**')) || parts.some((part, at) => at + 1 < parts.length && globMatches(part, '.ambicode') && globMatches(parts[at + 1]!, 'task'))) {
      place = 'unknown';
    }
  }
  return place;
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

/**
 * `rm -r` on the directory the command runs in or the session's own, an ancestor of either, `/` or home, in any
 * directory it may run in. `undefined` base: unknown cwd.
 */
function removesRoot(segment: Segment, cwd: string | undefined): string | null {
  if (!recursive(segment)) return null;
  for (const target of segment.writeTargets) {
    if (target.opaque) continue;
    if (['/', '~', '~/', '*', './*'].includes(target.path)) return target.path;
    for (const base of placesOf(target.directories, cwd)) {
      if (typeof base !== 'string') {
        if (base === undefined && /^\.\.?(?:\/|$)/.test(normalize(target.path))) return target.path;
        if (base === null && cwd !== undefined && isAbsolute(target.path) && contains(normalize(target.path), normalize(cwd))) return target.path;
        continue;
      }
      const resolved = normalize(target.path, base);
      if (contains(resolved, normalize(base)) || (cwd !== undefined && contains(resolved, normalize(cwd)))) return target.path;
      if (!isAbsolute(base) && /^\.\.?(?:\/|$)/.test(resolved)) return target.path;
    }
  }
  return null;
}

/**
 * Per segment: git/glab state changes and `rm -r` of the root ask; a literal write target under the task directory
 * denies; a target only the shell can resolve asks, never denies (G14), and so does a command not wholly analysed.
 * Heredoc bodies were never tokenised, so a `note save` body is not inspected (M12). Each target is resolved in the
 * directory its own scope runs in.
 */
function bashDecision(command: string, cwd: string | undefined, pluginRoot: string, bsdSed: boolean, cdpath: boolean): Decision {
  const asks = new Set<string>();
  const segments = parseCommand(command, { bsdSed, cdpath });
  const analysed = !segments.some((segment) => segment.unparsed);
  for (const segment of segments) {
    if (segment.unparsed) {
      asks.add(`AMBICODE: cannot tell what this runs: part of the command is read differently by bash and zsh, or is beyond what the guard parses. ${USER_DECIDES}`);
      continue;
    }
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
      const places = placesOf(target.directories, cwd).map((base) => {
        if (base === null && !isAbsolute(target.path)) return 'unknown';
        if (target.pattern) return patternPlace(target.path, base ?? undefined);
        return TASK_DIR.test(normalize(target.path, base ?? undefined)) ? 'task' : 'outside';
      });
      if (target.opaque || places.includes('unknown')) {
        asks.add(`AMBICODE: cannot tell where this writes: \`${shown(target.path)}\` is resolved only when the shell runs it. ${USER_DECIDES}`);
      } else if (places.every((place) => place === 'task')) {
        if (analysed) return decide('deny', noteSaveReason(pluginRoot));
        asks.add(noteSaveReason(pluginRoot));
      } else if (places.includes('task')) {
        asks.add(`AMBICODE: cannot tell where this writes: \`${shown(target.path)}\` is in the task directory only if an earlier directory change did or did not happen. ${USER_DECIDES}`);
      }
    }
  }
  return asks.size === 0 ? {} : decide('ask', [...asks].join(' '));
}

function planBodyDecision(input: GuardInput, state: GuardState | undefined, taskDirectory: string, slug: string, pluginRoot: string): Decision {
  const refuse = (why: string): Decision =>
    decide('deny', `AMBICODE: steps/plan-body.md is written only by the session that owns the task's live plan route; ${why}. ${noteSaveReason(pluginRoot)}`);
  const session = typeof input.session_id === 'string' && input.session_id !== '' ? input.session_id : null;
  if (session === null) return refuse('the hook named no session');
  if (!isAbsolute(taskDirectory)) return refuse('the hook gave no absolute path for it');
  const scratchpad = typeof input.scratchpad_dir === 'string' && input.scratchpad_dir !== '' ? input.scratchpad_dir : null;
  const route = scratchpad === null || state === undefined ? null : state.activeRoute(scratchpad);
  if (route === null) return refuse('no active route is on record for this session');
  if (route.skill !== 'plan' || route.task !== slug) return refuse(`this session's active route is ${route.skill} on ${route.task}, not plan on ${slug}`);
  const entries = state!.ledger(taskDirectory);
  if (entries === null) return refuse(`the ledger of ${slug} is missing, unreadable or over 1 MiB`);
  const owner = ownerOf(entries, slug);
  if (owner.state === 'none') return refuse(`no plan route is open on ${slug}`);
  if (owner.state === 'unknown') return refuse(owner.reason);
  if (owner.session === session) return {};
  if (owner.takenOver.includes(session)) {
    return decide(
      'deny',
      `AMBICODE: route-taken-over: session ${owner.session} took over the plan route on ${slug} (route ${owner.routeId}); ` +
        'this session no longer writes its files. Stop and tell the user: taking it back is their decision (`--adopt` ' +
        'on a new plan start), or the work continues under another `--task`.',
    );
  }
  return refuse(`session ${owner.session} owns it`);
}

function fileDecision(input: GuardInput, state: GuardState | undefined, pluginRoot: string): Decision {
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof file !== 'string' || file === '') return {};
  const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : undefined;
  const target = normalize(file, cwd);
  if (TASK_DIR.test(target)) {
    const body = PLAN_BODY.exec(target);
    if (body !== null && !TASK_DIR.test(body[1] ?? '')) {
      return planBodyDecision(input, state, `${body[1] ?? ''}.ambicode/task/${body[2]!}`, body[2]!, pluginRoot);
    }
    return decide('deny', noteSaveReason(pluginRoot));
  }
  if (INIT_FILES.test(target) && typeof input.scratchpad_dir === 'string' && input.scratchpad_dir !== '') {
    if (state?.activeRoute(input.scratchpad_dir)?.skill === 'init') {
      return decide(
        'deny',
        'AMBICODE: an init route is active, and init writes .ambicode/config.yaml and its .gitignore lines itself when ' +
          'the user accepts the proposal (`init --apply --set …`). Answer the init gate instead of editing the file.',
      );
    }
  }
  return {};
}

/**
 * `pluginRoot` is the hook's `CLAUDE_PLUGIN_ROOT`, so the command in the message runs as written. `platform` picks
 * how `sed -i` reads its suffix, and the environment whether `CDPATH` is set: the guard runs where the command runs.
 */
export function guardDecision(input: GuardInput, pluginRoot = '${CLAUDE_PLUGIN_ROOT}', state?: GuardState, platform: string = process.platform): Decision {
  if (input.hook_event_name !== 'PreToolUse') return {};
  const tool = input.tool_name ?? '';
  if (FILE_TOOLS.has(tool)) return fileDecision(input, state, pluginRoot);
  const command = input.tool_input?.command;
  if (tool !== 'Bash' || typeof command !== 'string') return {};
  const bsdSed = platform === 'darwin' || platform.endsWith('bsd');
  const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : undefined;
  return bashDecision(command, cwd, pluginRoot, bsdSed, (process.env.CDPATH ?? '') !== '');
}
