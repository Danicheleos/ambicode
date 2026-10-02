// No imports: this file is bundled into a standalone entry whose startup time is the point (see guard.ts).

export interface GuardInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { command?: unknown };
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

export function guardDecision(input: GuardInput): Record<string, unknown> {
  if (input.hook_event_name !== 'PreToolUse' || input.tool_name !== 'Bash') return {};
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
