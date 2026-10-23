// Imports only import-free modules: this file is bundled into a standalone entry whose startup time is the point
// (see guard.ts). Files are read by the injected `GuardState`, never from here.
import { basename, parseCommand } from '../shell/command-parser.ts';
import type { GuardInput, GuardState } from '../types/guard.ts';
import { isAbsolute, normalize } from './paths.ts';
import { CONTEXT_DIR, CONTEXT_REASON } from './rules/context.ts';
import { cutsOutput, withoutCuts } from './rules/output.ts';
import { noteSaveReason, RUN_DIR } from './rules/notes.ts';
import { PLAN_BODY, planBodyReason, planBodyRefusal } from './rules/plan-body.ts';
import { repositoryAsk, USER_DECIDES } from './rules/repository.ts';
import { REVIEWER_AGENT, reviewerRefusal } from './rules/reviewer.ts';

type Decision = Record<string, unknown>;

function decide(permissionDecision: 'ask' | 'deny', reason: string): Decision {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason: reason } };
}

const FILE_TOOLS = /^(?:Write|Edit|MultiEdit|NotebookEdit)$/;

/** A word quoted in a reason, cut so a pathological command cannot make the reason megabytes long. */
const shown = (word: string): string => (word.length > 120 ? `${word.slice(0, 120)}…` : word);

// Expansions are not parsed, so a command nested in one is matched by its text.
const NESTED = /\$\(|`|<\(/;
const DANGEROUS = /\bgit\s+(?:\S+\s+)*?(?:commit|push|stash|reset|checkout|clean|rebase|merge|branch)\b|\bglab\s+mr\b|\.ambicode\/(?:tasks|reviews)/;
const NESTED_REASON = 'AMBICODE: cannot read a command inside $(...) or backticks; approve only if requested.';

const NAME_PATH = 'Name the path literally (or use the Write tool) and run it again.';
const WRITE_OUT = 'Run it again with the command written out (no variable, no eval).';

const UNSURE = 'AMBICODE: cannot tell what this runs:';
const placement = (path: string, why: string): string => `AMBICODE: cannot tell where this writes: \`${shown(path)}\` ${why}.`;

const DIRECTORY_CHANGE = /^(?:cd|pushd|popd)$/;

/**
 * Per segment: git/glab state changes ask; a literal write target under the task directory denies; a target only the
 * shell can resolve asks, never denies (G14). A literal `cd` is followed, and ends with its `( … )` subshell; a
 * relative target asks when it would be under the task directory from a directory before a `cd` (which may fail), or
 * after a `cd` only the shell resolves. Heredoc bodies are never tokenised, so a `note save` body is not inspected (M12).
 */
function bashDecision(command: string, cwd: string | undefined, pluginRoot: string, headless: boolean, toolInput: object): Decision {
  // An ask maps to its retry hint when it is about the command's form, not a permission: a headless route can retry it.
  const asks = new Map<string, string | null>();
  const segments = parseCommand(command);
  let dir = cwd;
  const prior: (string | undefined)[] = [];
  let lost = false;
  const outer: { dir: string | undefined; priors: number; lost: boolean }[] = [];
  let why: string | undefined;
  const cuts: number[] = [];
  const mentionsRunDir = command.includes('.ambicode');
  for (const [at, segment] of segments.entries()) {
    while (outer.length < segment.depth) outer.push({ dir, priors: prior.length, lost });
    while (outer.length > segment.depth) {
      const saved = outer.pop()!;
      ({ dir, lost } = saved);
      prior.length = saved.priors;
    }
    if (segment.unparsed) {
      if (/\.ambicode\/(?:tasks|reviews)|git/.test(segment.raw)) asks.set(`${UNSURE} part of the command is not closed or not parsed. ${USER_DECIDES}`, null);
      continue;
    }
    if (segment.argv.some((word, at) => segment.opaque[at] && NESTED.test(word) && DANGEROUS.test(word))) asks.set(NESTED_REASON, null);
    const name = basename(segment.argv[0] ?? '');
    if (cutsOutput(segments, at)) cuts.push(at);
    // A name whose last component only the shell expands (`$(which git)`, `$TOOL`) could be any command.
    if (segment.opaque[0] === true && /[$`]/.test(name)) asks.set(`${UNSURE} \`${shown(segment.argv[0]!)}\` names a command only when the shell expands it.`, WRITE_OUT);
    const repository = repositoryAsk(segment, name);
    if (repository !== null) asks.set(repository, null);
    for (const target of segment.writeTargets) {
      const path = normalize(target.path, dir);
      // An unresolved target can only land in .ambicode/ if the command text names it.
      if (target.opaque) {
        if (mentionsRunDir) asks.set(placement(target.path, 'is resolved only when the shell runs it'), NAME_PATH);
      } else if (RUN_DIR.test(path)) {
        const slug = PLAN_BODY.exec(path)?.[2];
        // A plan-body target outranks a note-save one: it names the Write-tool fix, which the other target hides.
        if (slug !== undefined) why = planBodyReason(slug, pluginRoot);
        else why ??= noteSaveReason(pluginRoot);
      } else if (!isAbsolute(target.path) && ((lost && mentionsRunDir) || prior.some((before) => RUN_DIR.test(normalize(target.path, before))))) {
        asks.set(placement(target.path, 'is relative to a directory an earlier `cd` changed'), NAME_PATH);
      }
    }
    if (DIRECTORY_CHANGE.test(name)) {
      const operands = segment.argv.slice(1).filter((word) => !/^(?:-[LP]|--)$/.test(word));
      if (operands.length === 1 && !segment.opaque.includes(true) && !/^[-+]/.test(operands[0]!)) {
        prior.push(dir);
        dir = normalize(operands[0]!, dir);
      } else lost = true;
    }
  }
  if (why !== undefined && !segments.some((other) => other.unparsed)) return decide('deny', why);
  if (why !== undefined) asks.set(why, null);
  // Precedence: deny > ask > rewrite; an ask from another rule keeps the cut, which that rule's prompt then covers.
  if (asks.size === 0 && cuts.length > 0) {
    const rewritten = withoutCuts(command, segments, cuts);
    if (rewritten === null) return decide('deny', 'AMBICODE: nothing ran. Re-run without `| head`.');
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...toolInput, command: rewritten } } };
  }
  if (asks.size === 0) return {};
  const hints = [...new Set(asks.values())];
  if (headless && hints.length === 1 && hints[0] !== null) return decide('deny', `${[...asks.keys()].join(' ')} ${hints[0]}`);
  return decide('ask', [...asks].map(([reason, hint]) => (hint === null ? reason : `${reason} ${USER_DECIDES}`)).join(' '));
}

function fileDecision(input: GuardInput, state: GuardState | undefined, pluginRoot: string): Decision {
  const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (typeof file !== 'string' || file === '') return {};
  const target = normalize(file, nonEmpty(input.cwd) ?? undefined);
  if (typeof input.agent_type === 'string' && REVIEWER_AGENT.test(input.agent_type)) {
    const refusal = reviewerRefusal(input.tool_name, target);
    return refusal === null ? {} : decide('deny', refusal);
  }
  if (RUN_DIR.test(target)) {
    const body = PLAN_BODY.exec(target);
    if (body !== null && !RUN_DIR.test(body[1] ?? '')) {
      const refusal = planBodyRefusal(state, `${body[1] ?? ''}.ambicode/tasks/${body[2]!}`, body[2]!, pluginRoot);
      // The plan is one Write; a patch to the owner's file is refused with the same next step.
      return refusal !== null ? decide('deny', refusal) : input.tool_name === 'Write' ? {} : decide('deny', planBodyReason(body[2]!, pluginRoot));
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
    `${reason} This headless route cannot approve it, so do not run it. ` +
      'Run `route stop --task <slug> --reason blocked --detail "permission-denied: <what you needed>"`, then ' +
      'finish with a final message that says "permission-denied: <what you needed>".',
  );
}

/** `pluginRoot` is the hook's `CLAUDE_PLUGIN_ROOT`, so the command in a message runs as written. */
export function guardDecision(input: GuardInput, pluginRoot = '${CLAUDE_PLUGIN_ROOT}', state?: GuardState): Decision {
  if (input.hook_event_name !== 'PreToolUse') return {};
  const command = input.tool_input?.command;
  const file = FILE_TOOLS.test(input.tool_name ?? '');
  if (!file && !(input.tool_name === 'Bash' && typeof command === 'string')) return {};
  const scratchpad = nonEmpty(input.scratchpad_dir);
  const session = nonEmpty(input.session_id);
  const headless = state !== undefined && (scratchpad !== null || session !== null) && state.headless(scratchpad, session);
  const decision = file ? fileDecision(input, state, pluginRoot) : bashDecision(command as string, nonEmpty(input.cwd) ?? undefined, pluginRoot, headless, input.tool_input ?? {});
  const asked = (decision['hookSpecificOutput'] as { permissionDecision?: string } | undefined)?.permissionDecision === 'ask';
  return asked && headless ? headlessDeny(decision) : decision;
}
