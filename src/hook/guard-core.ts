// No imports: this file is bundled into a standalone entry whose startup time is the point (see guard.ts).

export interface GuardInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { command?: unknown; file_path?: unknown };
}

const GIT_WRITES = ['commit', 'push', 'stash', 'reset', 'checkout', 'clean'];
const READ_ONLY_STASH = /^stash\s+(list|show)\b/;
const GIT_OPTIONS = /(?:\s+(?:-C|-c)\s+\S+|\s+--[\w-]+(?:=\S+)?|\s+-[pP])*/;
const GIT_WRITE = new RegExp(`(?:^|[\\s;&|(])git${GIT_OPTIONS.source}\\s+((?:${GIT_WRITES.join('|')})(?=\\s|$).*)`);
const GLAB_MR = /(?:^|[\s;&|(])glab\s+mr\b/;

/** Quoted text is data (`echo "git commit"`, a commit message); the command around it is what runs. */
function withoutQuotedText(command: string): string {
  return command.replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

export function blockedOperation(command: string): string | null {
  for (const segment of withoutQuotedText(command).split(/&&|\|\||;|\||\n/)) {
    const git = GIT_WRITE.exec(segment);
    if (git !== null && !READ_ONLY_STASH.test(git[1]!)) return `git ${git[1]!.split(/\s/)[0]}`;
    if (GLAB_MR.test(segment)) return 'glab mr';
  }
  return null;
}

const TASK_DIR = /(?:^|[\\/])\.ambicode[\\/]task(?:[\\/]|$)/;
const IN_COMMAND = /\.ambicode[\\/]task(?:[\\/]|\b)/;
const NOTE_SAVE = /^\s*(?:\S+\s+)?["']?\S*ambicode\.mjs["']?\s+note\s+save\b/;
// A redirect, tee, in-place edit or file move; `2>&1` and `>/dev/null` write nothing under the task directory.
const WRITES = /(?:^|[^0-9&>])>>?(?!\s*(?:\/dev\/null|&))|\btee\b|\bsed\s+-i|\b(?:cp|mv|rm)\b/;
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/** A note goes through `note save`, which names the file, stamps the time and adds the label. */
function taskDirectoryWrite(input: GuardInput): boolean {
  const tool = input.tool_name ?? '';
  if (FILE_TOOLS.has(tool)) {
    const file = input.tool_input?.file_path;
    return typeof file === 'string' && TASK_DIR.test(file);
  }
  const command = input.tool_input?.command;
  if (tool !== 'Bash' || typeof command !== 'string' || NOTE_SAVE.test(command)) return false;
  return IN_COMMAND.test(command.replace(/[$"'`]/g, '')) && WRITES.test(command);
}

function noteSaveReason(pluginRoot: string): string {
  return (
    `AMBICODE: .ambicode/task/ is written only through \`node "${pluginRoot}/scripts/ambicode.mjs" note save ` +
    '--task <slug> --kind investigation|plan|notes`, with the note on standard input. It names the file, stamps ' +
    'the time and adds the label. Run that instead.'
  );
}

/** `pluginRoot` is the hook's `CLAUDE_PLUGIN_ROOT`, so the command in the message runs as written. */
export function guardDecision(input: GuardInput, pluginRoot = '${CLAUDE_PLUGIN_ROOT}'): Record<string, unknown> {
  if (input.hook_event_name !== 'PreToolUse') return {};
  if (taskDirectoryWrite(input)) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: noteSaveReason(pluginRoot) } };
  }
  if (input.tool_name !== 'Bash') return {};
  const command = input.tool_input?.command;
  if (typeof command !== 'string') return {};
  const operation = blockedOperation(command);
  if (operation === null) return {};
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason:
        `AMBICODE: \`${operation}\` changes repository or merge-request state. Skills never do this on their own; ` +
        'the user decides, so this asks. Approve only if the user asked for it in this session.',
    },
  };
}
