import path from 'node:path';
import { createRuntime, openRepository, type Runtime } from '../composition/root.ts';
import { parseArgs } from '../cli/args.ts';
import { PREPARE_OPTIONS, runPrepare } from '../cli/commands/prepare.ts';
import { termsFromRequirements } from '../code-intelligence/locate.ts';
import type { PostToolUseHookOutput } from '../contracts/hook.ts';
import { isAmbicodeError } from '../util/errors.ts';
import { formatJsonOutput } from '../util/json-output.ts';

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
  const activity = match[1]!;
  const sessionDirectory = input.cwd ?? runtime.cwd;
  const skillArgs = typeof input.tool_input?.args === 'string' ? input.tool_input.args : '';

  const found = await findRepository(runtime, sessionDirectory);
  if (typeof found === 'string') return contextOutput(unavailable(found));

  const terms = termsFromRequirements([{ title: '', content: skillArgs }]);
  const argv = ['--activity', activity, '--json', ...terms.flatMap((term) => ['--term', term])];
  const command = `prepare --activity ${activity} --json`;
  const where = found.where;
  try {
    const hookRuntime = await createRuntime({ ...runtime, cwd: found.repositoryRoot });
    const header = [
      `AMBICODE ran \`${command}\` for you, in \`${where}\`, with terms from your skill args (navigation.shortlist.terms).`,
      'Its complete output follows; do not run it again.',
    ].join('\n');
    const prepare = async (shortlistLimit?: number) => {
      const run = await runPrepare(hookRuntime, parseArgs('prepare', argv, PREPARE_OPTIONS), { shortlistLimit });
      return { run, message: `${header}\n${formatJsonOutput(run.data, run.json).trimEnd()}` };
    };
    let { run, message } = await prepare();
    for (let attempt = 0; attempt < FIT_ATTEMPTS && message.length > INLINE_LIMIT; attempt += 1) {
      const candidates = run.data.navigation.shortlist?.candidates ?? [];
      if (candidates.length === 0) break;
      const average = JSON.stringify(candidates).length / candidates.length;
      const keep = Math.max(0, candidates.length - Math.ceil((message.length - INLINE_LIMIT) / average));
      ({ run, message } = await prepare(keep));
    }
    return contextOutput(message);
  } catch (error) {
    return contextOutput(unavailable(isAmbicodeError(error) ? `${error.code}: ${error.message.replace(/\.$/, '')}` : 'an unexpected error'));
  }
}

function unavailable(reason: string): string {
  return `AMBICODE could not run prepare for you: ${reason}. Run it yourself, as the skill's prepare step says.`;
}

function contextOutput(additionalContext: string): PostToolUseHookOutput {
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } };
}

/**
 * The repository the skill is about: the session's own when it carries a configuration, else the one
 * configured repository directly below it. The eval sandbox's home directory is itself a git work
 * tree holding the case's `repo/`, so "the session is inside a repository" alone picks the wrong one.
 */
async function findRepository(runtime: Runtime, directory: string): Promise<{ repositoryRoot: string; where: string } | string> {
  const { fs } = runtime;
  const isRepository = async (candidate: string): Promise<string | null> => {
    const probe = await createRuntime({ ...runtime, cwd: candidate }).catch(() => null);
    if (probe === null) return null;
    return openRepository(probe).then((opened) => opened.repositoryRoot).catch(() => null);
  };
  const configured = (root: string) => fs.exists(path.join(root, '.ambicode', 'config.yaml'));

  const here = await isRepository(directory);
  if (here !== null && (await configured(here))) return { repositoryRoot: here, where: '.' };

  // Named by directory entry, never by `path.relative`: macOS reaches /tmp through a symlink, and a
  // lexical relative path between /var/... and /private/var/... climbs out of the session directory.
  const below: { root: string; name: string }[] = [];
  for (const entry of await fs.readdir(directory).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const candidate = path.join(directory, entry.name);
    if ((await fs.exists(path.join(candidate, '.git'))) && (await configured(candidate))) below.push({ root: candidate, name: entry.name });
  }
  if (below.length === 1) return { repositoryRoot: below[0]!.root, where: below[0]!.name };
  // Nothing configured to choose: let `prepare` name what is missing in the session's own repository.
  if (below.length === 0 && here !== null) return { repositoryRoot: here, where: '.' };
  const name = path.basename(directory) || directory;
  if (below.length === 0) return `no git repository in ${name} or directly below it`;
  return `${below.length} configured git repositories below ${name}, and no way to tell which one the skill is about`;
}
