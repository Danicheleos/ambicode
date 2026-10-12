// Imports only import-free modules: this file is bundled into a standalone entry whose startup time is the point
// (see guard.ts). Files are read by the injected `GuardState`, never from here.
import { basename, parseCommand } from '../shell/command-parser.ts';
import type { ActiveRoute, GuardInput, GuardState } from '../types/guard.ts';
import { isAbsolute, normalize } from './paths.ts';
import { CONTEXT_DIR, CONTEXT_REASON } from './rules/context.ts';
import { noteSaveReason, RUN_DIR } from './rules/notes.ts';
import { PLAN_BODY, planBodyReason, planBodyRefusal } from './rules/plan-body.ts';
import { repositoryAsk, USER_DECIDES } from './rules/repository.ts';

type Decision = Record<string, unknown>;

function decide(permissionDecision: 'ask' | 'deny', reason: string): Decision {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason: reason } };
}

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/** A word quoted in a reason, cut so a pathological command cannot make the reason megabytes long. */
const shown = (word: string): string => (word.length > 120 ? `${word.slice(0, 120)}…` : word);

// Expansions are not parsed, so a command nested in one is matched by its text.
const NESTED = /\$\(|`|<\(/;
const DANGEROUS = /\bgit\s+(?:\S+\s+)*?(?:commit|push|stash|reset|checkout|clean|rebase|merge|branch)\b|\bglab\s+mr\b|\.ambicode\/(?:tasks|reviews)/;
const NESTED_REASON = 'AMBICODE: cannot read a command inside $(...) or backticks; approve only if you asked for it.';

const DIRECTORY_CHANGE = new Set(['cd', 'pushd', 'popd']);

/**
 * Per segment: git/glab state changes ask; a literal write target under the task directory denies; a target only the
 * shell can resolve asks, never denies (G14). A literal `cd` is followed, and ends with its `( … )` subshell; a
 * relative target asks when it would be under the task directory from a directory before a `cd` (which may fail), or
 * after a `cd` only the shell resolves. Heredoc bodies are never tokenised, so a `note save` body is not inspected (M12).
 */
function bashDecision(command: string, cwd: string | undefined, pluginRoot: string, headless: boolean): Decision {
  // Each ask maps to whether it is a placement ask: the path is unknown, so naming it literally lets the guard decide.
  const asks = new Map<string, boolean>();
  const segments = parseCommand(command);
  let dir = cwd;
  const prior: (string | undefined)[] = [];
  let lost = false;
  const outer: { dir: string | undefined; priors: number; lost: boolean }[] = [];
  let why: string | undefined;
  for (const segment of segments) {
    while (outer.length < segment.depth) outer.push({ dir, priors: prior.length, lost });
    while (outer.length > segment.depth) {
      const saved = outer.pop()!;
      ({ dir, lost } = saved);
      prior.length = saved.priors;
    }
    if (segment.unparsed) {
      if (/\.ambicode\/(?:tasks|reviews)|git/.test(segment.raw)) asks.set(`AMBICODE: cannot tell what this runs: part of the command is not closed or is beyond what the guard parses. ${USER_DECIDES}`, false);
      continue;
    }
    if (segment.argv.some((word, at) => segment.opaque[at] && NESTED.test(word) && DANGEROUS.test(word))) asks.set(NESTED_REASON, false);
    const name = basename(segment.argv[0] ?? '');
    // A name whose last component only the shell expands (`$(which git)`, `$TOOL`) could be any command.
    if (segment.opaque[0] === true && /[$`]/.test(name)) asks.set(`AMBICODE: cannot tell what this runs: \`${shown(segment.argv[0]!)}\` names a command only when the shell expands it. ${USER_DECIDES}`, false);
    const repository = repositoryAsk(segment, name);
    if (repository !== null) asks.set(repository, false);
    for (const target of segment.writeTargets) {
      const path = normalize(target.path, dir);
      if (target.opaque) {
        asks.set(`AMBICODE: cannot tell where this writes: \`${shown(target.path)}\` is resolved only when the shell runs it.`, true);
      } else if (RUN_DIR.test(path)) {
        const slug = PLAN_BODY.exec(path)?.[2];
        // A plan-body target outranks a note-save one: it names the Write-tool fix, which the other target hides.
        if (slug !== undefined) why = planBodyReason(slug);
        else why ??= noteSaveReason(pluginRoot);
      } else if (!isAbsolute(target.path) && (lost || prior.some((before) => RUN_DIR.test(normalize(target.path, before))))) {
        asks.set(`AMBICODE: cannot tell where this writes: \`${shown(target.path)}\` is relative to a directory an earlier \`cd\` changed.`, true);
      }
    }
    if (DIRECTORY_CHANGE.has(name)) {
      const operands = segment.argv.slice(1).filter((word) => !/^(?:-[LP]|--)$/.test(word));
      if (operands.length === 1 && !segment.opaque.includes(true) && !/^[-+]/.test(operands[0]!)) {
        prior.push(dir);
        dir = normalize(operands[0]!, dir);
      } else lost = true;
    }
  }
  if (why !== undefined && !segments.some((other) => other.unparsed)) return decide('deny', why);
  if (why !== undefined) asks.set(why, false);
  if (asks.size === 0) return {};
  if (headless && [...asks.values()].every(Boolean)) {
    return decide('deny', `${[...asks.keys()].join(' ')} Name the path literally (or write it with the Write tool) and run it again; the guard then decides on the literal path.`);
  }
  return decide('ask', [...asks].map(([reason, placement]) => (placement ? `${reason} ${USER_DECIDES}` : reason)).join(' '));
}

function fileDecision(input: GuardInput, session: string | null, route: ActiveRoute | null, state: GuardState | undefined, pluginRoot: string): Decision {
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof file !== 'string' || file === '') return {};
  const target = normalize(file, nonEmpty(input.cwd) ?? undefined);
  if (RUN_DIR.test(target)) {
    const body = PLAN_BODY.exec(target);
    if (body !== null && !RUN_DIR.test(body[1] ?? '')) {
      const refusal = planBodyRefusal(session, route, state, `${body[1] ?? ''}.ambicode/tasks/${body[2]!}`, body[2]!);
      return refusal === null ? {} : decide('deny', refusal);
    }
    return decide('deny', noteSaveReason(pluginRoot));
  }
  if (CONTEXT_DIR.test(target)) return decide('deny', CONTEXT_REASON);
  return {};
}

const nonEmpty = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

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
  const file = FILE_TOOLS.has(tool);
  if (!file && !(tool === 'Bash' && typeof command === 'string')) return {};
  const scratchpad = nonEmpty(input.scratchpad_dir);
  const session = nonEmpty(input.session_id);
  const route = state === undefined || (scratchpad === null && session === null) ? null : state.activeRoute(scratchpad, session);
  const headless = route?.headless === true;
  const decision = file ? fileDecision(input, session, route, state, pluginRoot) : bashDecision(command as string, nonEmpty(input.cwd) ?? undefined, pluginRoot, headless);
  const asked = (decision['hookSpecificOutput'] as { permissionDecision?: string } | undefined)?.permissionDecision === 'ask';
  return asked && headless ? headlessDeny(decision) : decision;
}
