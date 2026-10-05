import { createRuntime, type Runtime } from '../../composition/root.ts';
import { findSessionRepository } from '../../composition/session-repository.ts';
import { loadConfig } from '../../config/load.ts';
import { parseArgs } from '../../cli/args.ts';
import { PREPARE_OPTIONS, runPrepare } from '../../cli/commands/prepare.ts';
import { termsFromRequirements } from '../../code-intelligence/locate.ts';
import { readingOrder } from '../../code-intelligence/navigation.ts';
import type { PostToolUseHookOutput } from '../../contracts/hook.ts';
import { mintTaskSlug } from '../../task/slug.ts';
import { isAmbicodeError } from '../../util/errors.ts';
import { formatJsonOutput } from '../../util/json-output.ts';

/** The skills whose first step is `prepare`; review and the setup skills prepare differently or not at all. */
const PREPARING_SKILLS = /^ambicode:(investigate|plan|task)$/;

/**
 * Measured 2026-09-30 with a probe plugin: hook context of <= 9,800 characters arrives whole, and
 * >= 10,400 is saved to a file behind a preview. The FE benchmark's 15-candidate payload was 10,389.
 */
const INLINE_LIMIT = 9_800;

/** Each pass cuts the overflow at the average candidate size; candidates are not uniform, so it may take a second. */
const FIT_ATTEMPTS = 3;

/**
 * Runs the skill's `prepare` step for it, so the step happens whether or not the model remembers
 * it: a text-only instruction was skipped in 4 of 4 Sonnet runs (2026-09-30 walk).
 * Returns null for any other tool call. A failure is stated to the model, never swallowed,
 * because silence would read as "prepared".
 */
export async function prepareForSkill(
  runtime: Runtime,
  input: { cwd?: string | undefined; tool_name?: string | undefined; tool_input?: { skill?: unknown; args?: unknown } | undefined },
): Promise<PostToolUseHookOutput | null> {
  if (input.tool_name !== 'Skill') return null;
  const skill = input.tool_input?.skill;
  const match = typeof skill === 'string' ? PREPARING_SKILLS.exec(skill) : null;
  if (match === null) return null;
  const skillArgs = typeof input.tool_input?.args === 'string' ? input.tool_input.args : '';
  return prepareForActivity(runtime, input.cwd ?? runtime.cwd, match[1]!, skillArgs);
}

/** A typed slash command is expanded by Claude Code without a Skill tool call, so no PostToolUse fires for it (2026-10-02 headless runs). */
const SLASH_COMMAND = /^\/ambicode:(investigate|plan|task)(?:\s+([\s\S]*))?$/;

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
    // A key-shaped word in prose (`NOM-36`) defers too, and then no hook message carries the reading order.
    const found = await findSessionRepository(runtime, sessionDirectory);
    const required = typeof found === 'string' ? [] : await requiredLsp(found.repositoryRoot, runtime);
    return contextOutput(
      'AMBICODE did not run prepare: your skill args name a ticket. Fetch the ticket; a hook then runs prepare ' +
        "on its text. If that message does not appear, run prepare yourself, as the skill's prepare step says. " +
        `Pass --task-open ${JSON.stringify(skillArgs.trim())} to it: task.slug names this request's directory.` +
        (required.length === 0 ? '' : `\n${readingOrder(required)}`),
    );
  }

  const terms = termsFromRequirements([{ title: '', content: skillArgs }]);
  return contextOutput(await preparedMessage(runtime, sessionDirectory, activity, terms, 'your skill args', skillArgs));
}

/**
 * Tools that return one ticket or page. A bare `get` prefix also took `getAccessibleAtlassianResources`,
 * the site lookup that precedes every fetch: terms `read-write`, `read`, `write` and a 9,899-character
 * payload of unrelated files (2026-10-01 session).
 */
const TICKET_TOOL = /^mcp__(.+)__(get(?!Transitions)\w*(?:Issue|Page|Ticket)|fetch\w*|read\w*)$/i;
const ATLASSIAN_SERVER = /atlassian|jira|confluence|rovo/i;

/** A fetched ticket is far larger than any term list needs; the ranking reads the head. */
const MAX_TICKET_CHARS = 60_000;

/**
 * Runs `prepare` on the text a Jira/Confluence read tool returned, because that text, verbatim, is the
 * question: the model's own paraphrase in the skill args lost the ticket's nouns (0 of 17 true files
 * in the shortlist). Always the `investigate` shape, which carries no rules; `plan` and `task` run
 * their own `prepare` for theirs.
 */
export async function prepareForTicket(
  runtime: Runtime,
  input: { cwd?: string | undefined; tool_name?: string | undefined; tool_input?: unknown; tool_response?: unknown },
): Promise<PostToolUseHookOutput | null> {
  const match = input.tool_name === undefined ? null : TICKET_TOOL.exec(input.tool_name);
  if (match === null) return null;
  const server = match[1]!;
  const sessionDirectory = input.cwd ?? runtime.cwd;

  const found = await findSessionRepository(runtime, sessionDirectory);
  if (typeof found === 'string') return null;
  const bound = await loadConfig(runtime.fs, found.repositoryRoot)
    .then((loaded) => loaded.config.requirements.mcpServer)
    .catch(() => null);
  const ours = bound === null ? ATLASSIAN_SERVER.test(server) : server.toLowerCase().includes(bound.toLowerCase());
  if (!ours) return null;

  const text = withoutNoise(textOf(input.tool_response)).slice(0, MAX_TICKET_CHARS);
  const terms = termsFromRequirements([{ title: '', content: text }]);
  if (terms.length === 0) return null;
  // The call's own arguments name the ticket (`issueIdOrKey`); the response is stripped of keys as noise.
  const asked = JSON.stringify(input.tool_input ?? {}).match(/\b[A-Z][A-Z0-9]+-\d+\b/)?.[0] ?? '';
  return contextOutput(await preparedMessage(runtime, sessionDirectory, 'investigate', terms, `the result of ${input.tool_name}`, asked));
}

/**
 * Fields of a Jira response that are not the question. The first real Rovo fetch put
 * `data-type`, `data-id`, UUIDs, gitlab URLs and timestamps from comments into the 12 term slots,
 * and the shortlist held 0 of 6 true files. The `evidence` view added custom fields (build counters),
 * the assignee's name and ticket keys, and the shortlist held none of them again.
 */
const NOT_THE_TICKET = new Set(['customFields', 'assignee', 'reporter', 'creator', 'status', 'priority', 'issuetype', 'type', 'id', 'self', 'expand', 'accountId', 'created', 'updated', 'updateAuthor', 'author', 'comment', 'comments', 'changelog', 'renderedFields']);

/** Markup and identifiers that survive in the text of a field: tags, links, ids and timestamps are not vocabulary. */
function withoutNoise(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b[A-Z][A-Z0-9]+-\d+\b/g, ' ')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.+]+Z?/g, ' ');
}

/** The string leaves of a tool response, with JSON carried inside a string opened: keys and structure are not the ticket. */
function textOf(value: unknown, depth = 0): string {
  if (typeof value === 'string') {
    const trimmed = value.trimStart();
    if (depth < 4 && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
      try {
        return textOf(JSON.parse(value), depth + 1);
      } catch {
        // Not JSON after all: it is text.
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => textOf(item, depth)).join('\n');
  if (value !== null && typeof value === 'object') return Object.entries(value).filter(([key]) => !NOT_THE_TICKET.has(key)).map(([, item]) => textOf(item, depth)).join('\n');
  return '';
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
      readingOrder(await requiredLsp(found.repositoryRoot, runtime)),
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

/** The plugins `requirements.lsp` names: a config that cannot be read asks for nothing. */
async function requiredLsp(repositoryRoot: string, runtime: Runtime): Promise<readonly string[]> {
  return loadConfig(runtime.fs, repositoryRoot)
    .then((loaded) => loaded.config.requirements.lsp)
    .catch(() => []);
}

function unavailable(reason: string): string {
  return `AMBICODE could not run prepare for you: ${reason}. Run it yourself, as the skill's prepare step says.`;
}

function contextOutput(additionalContext: string): PostToolUseHookOutput {
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } };
}
