import { createRuntime, type Runtime } from '../../composition/root.ts';
import { findSessionRepository } from '../../composition/session-repository.ts';
import { parseArgs } from '../../cli/args.ts';
import { PREPARE_OPTIONS, runPrepare } from '../../cli/commands/prepare.ts';
import { termsFromRequirements } from '../../code-intelligence/locate.ts';
import type { PostToolUseHookOutput } from '../../contracts/hook.ts';
import { mintTaskSlug } from '../../task/slug.ts';
import { isAmbicodeError } from '../../util/errors.ts';
import { formatJsonOutput } from '../../util/json-output.ts';

/**
 * Measured 2026-09-30 with a probe plugin: hook context of <= 9,800 characters arrives whole, and
 * >= 10,400 is saved to a file behind a preview. The FE benchmark's 15-candidate payload was 10,389.
 */
const INLINE_LIMIT = 9_800;

/** Each pass cuts the overflow at the average candidate size; candidates are not uniform, so it may take a second. */
const FIT_ATTEMPTS = 3;

/** A typed slash command is expanded by Claude Code without a Skill tool call, so no PostToolUse fires for it (2026-10-02 headless runs). */
const SLASH_COMMAND = /^\/ambicode:(plan|task)(?:\s+([\s\S]*))?$/;

export async function prepareForSlashCommand(
  runtime: Runtime,
  input: { cwd?: string | undefined; prompt?: string | undefined },
): Promise<PostToolUseHookOutput | null> {
  const match = SLASH_COMMAND.exec((input.prompt ?? '').trim());
  if (match === null) return null;
  return prepareForActivity(runtime, input.cwd ?? runtime.cwd, match[1]!, match[2] ?? '');
}

async function prepareForActivity(runtime: Runtime, sessionDirectory: string, activity: string, skillArgs: string): Promise<PostToolUseHookOutput> {

  // Args that only name a ticket have no question in them: terms from `VS-001` find nothing, and the
  // fetch that follows carries the real text, which the ticket hook prepares from.
  // Any reference defers to the fetch, even with a question beside it: "ORD-17 which files would this touch?"
  // gave terms like `files` and `touch`, and okta files at ranks 5-15 (2026-10-01 session).
  if (/https?:\/\/\S+|\b[A-Z][A-Z0-9]+-\d+\b/.test(skillArgs)) {
    return contextOutput(
      'AMBICODE did not run prepare: your skill args name a ticket. Fetch the ticket, then run prepare yourself, ' +
        `as the skill's prepare step says. Pass --task-open ${JSON.stringify(skillArgs.trim())} to it: task.slug names this request's directory.`,
    );
  }

  const terms = termsFromRequirements([{ title: '', content: skillArgs }]);
  return contextOutput(await preparedMessage(runtime, sessionDirectory, activity, terms, 'your skill args', skillArgs));
}

async function preparedMessage(runtime: Runtime, sessionDirectory: string, activity: string, terms: readonly string[], source: string, request: string): Promise<string> {
  const found = await findSessionRepository(runtime, sessionDirectory);
  if (typeof found === 'string') return unavailable(found);

  const taskText = mintTaskSlug(request) === null ? [] : ['--task-open', request];
  const argv = ['--activity', activity, '--json', ...taskText, ...terms.flatMap((term) => ['--term', term])];
  const command = `prepare --activity ${activity} --json`;
  try {
    const hookRuntime = await createRuntime({ ...runtime, cwd: found.repositoryRoot });
    const header = [
      `AMBICODE ran \`${command}\` for you, in \`${found.where}\`, with terms from ${source} (navigation.shortlist.terms).`,
      'Its complete output follows; do not run it again. task.slug, when present, is the --task for note save and review.',
    ].join('\n');
    const prepare = async (shortlistLimit?: number) => {
      const run = await runPrepare(hookRuntime, parseArgs('prepare', argv, PREPARE_OPTIONS), { shortlistLimit });
      return { run, message: `${header}\n${formatJsonOutput(run.data, run.json).trimEnd()}` };
    };
    const whole = await prepare();
    let { run, message } = whole;
    for (let attempt = 0; attempt < FIT_ATTEMPTS && message.length > INLINE_LIMIT; attempt += 1) {
      const candidates = run.data.navigation.shortlist?.candidates ?? [];
      if (candidates.length === 0) break;
      const average = JSON.stringify(candidates).length / candidates.length;
      const keep = Math.max(0, candidates.length - Math.ceil((message.length - INLINE_LIMIT) / average));
      ({ run, message } = await prepare(keep));
    }
    // Trimming only pays when it reaches the window: the task payload is 16,252 bytes of rules alone,
    // and a shortlist stripped to nothing still lands in a file, having lost the part worth reading.
    return message.length > INLINE_LIMIT ? whole.message : message;
  } catch (error) {
    return unavailable(isAmbicodeError(error) ? `${error.code}: ${error.message.replace(/\.$/, '')}` : 'an unexpected error');
  }
}

function unavailable(reason: string): string {
  return `AMBICODE could not run prepare for you: ${reason}. Run it yourself, as the skill's prepare step says.`;
}

function contextOutput(additionalContext: string): PostToolUseHookOutput {
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } };
}
