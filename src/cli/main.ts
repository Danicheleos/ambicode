import { realpathSync } from 'node:fs';
import { createRuntime } from '../composition/root.ts';
import { AmbicodeError, isAmbicodeError } from '../util/errors.ts';
import { parseArgs, type OptionSpec, type ParsedArgs } from './args.ts';
import { BUNDLE_OPTIONS, renderBundle, runBundle } from './commands/bundle.ts';
import { CONFIG_OPTIONS, renderConfig, runConfig } from './commands/config.ts';
import { INIT_OPTIONS, renderInit, runInit } from './commands/init.ts';
import { POLICY_OPTIONS, renderPolicy, runPolicy } from './commands/policy.ts';
import { REVIEW_OPTIONS, renderReview, runReview } from './commands/review.ts';
import { validateTargetArgs } from './target-option.ts';

/**
 * The helper the AMBICODE skills call. Every command prints a human summary or,
 * with `--json`, the same data structured, so the two cannot drift apart.
 */
export const USAGE = `ambicode <command> [options]

  init                    Detect projects and write .ambicode/config.yaml.
                            --dry-run    Report what would change, write nothing.

  config                  Print the effective configuration, including limits
                          that are not stored in the file.

  policy [paths...]       Print the policy that applies.
                            --project <id>
                            --activity <review|task|plan|investigate>

  review                  The full review: pin the target, snapshot it, run the
                          affected checks, and put the result to an isolated
                          reviewer that can only read the snapshot.
                          The target is your uncommitted work unless --branch or
                          --mr names another one; the two are mutually exclusive.
                            --branch              Review the branch, not the working tree.
                            --base <ref>          Baseline for --branch. Valid only there.
                            --mr <url>            Review a GitLab merge request from its
                                                  full URL. Your checkout, branch and
                                                  index are not read or modified.
                            --requirement <url>   Jira or Confluence URL to judge the
                                                  change against; repeatable. Without
                                                  any, this is a quality review.
                            --evidence <file>     The retrieved requirement evidence
                                                  the reviewing session wrote. Required
                                                  whenever --requirement is used.
                            --approve <key>       Authorize one proposed run; repeatable.

  bundle                  The evidence stage of "review" on its own: target,
                          snapshot, requirements and checks, with no model
                          invoked. Takes the same target options.
                            --branch              Review the branch, not the working tree.
                            --base <ref>          Baseline for --branch. Valid only there.
                            --mr <url>            Bundle a GitLab merge request.
                            --requirement <url>   Requirement URL; repeatable.
                            --evidence <file>     The retrieved requirement evidence.
                            --approve <key>       Authorize one proposed run; repeatable.

  version                 Print the helper and git versions.

Global:
  --json                  Emit structured output instead of text.
`;

type Rendered = { text: string; data: unknown };

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  const spec = SPECS[command];
  if (spec === undefined) {
    process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
    return 2;
  }

  try {
    // Parsed once, before any runtime exists: a bad argument must not reach a
    // process, the filesystem or a provider, and a good one must not be re-judged.
    const args = parseArgs(command, rest, spec);
    // Combination rules are decided here too, still before a runtime exists:
    // a conflicting target must not create a temporary directory, start git,
    // or reach a provider first.
    validateCombination(command, args);
    const rendered = await dispatch(command, args);
    process.stdout.write(
      args.flag('json') ? `${JSON.stringify(rendered.data, null, 2)}\n` : `${rendered.text}\n`,
    );
    return 0;
  } catch (error) {
    return reportFailure(error);
  }
}

const VERSION_OPTIONS = { flags: ['json'] } as const;

/** Every command accepts `--json`; the rest of each spec is the command's own. */
export const SPECS: Record<string, OptionSpec | undefined> = {
  init: INIT_OPTIONS,
  config: CONFIG_OPTIONS,
  policy: POLICY_OPTIONS,
  review: REVIEW_OPTIONS,
  bundle: BUNDLE_OPTIONS,
  version: VERSION_OPTIONS,
};

/** Per-command rules that need more than one option to decide. */
function validateCombination(command: string, args: ParsedArgs): void {
  if (command === 'review' || command === 'bundle') validateTargetArgs(command, args);
}

async function dispatch(command: string, args: ParsedArgs): Promise<Rendered> {
  const runtime = await createRuntime();

  switch (command) {
    case 'init': {
      const output = await runInit(runtime, args);
      return { text: renderInit(output), data: output };
    }
    case 'config': {
      const output = await runConfig(runtime);
      return { text: renderConfig(output), data: output };
    }
    case 'policy': {
      const output = await runPolicy(runtime, args);
      return { text: renderPolicy(output), data: output };
    }
    case 'review': {
      const output = await runReview(runtime, args);
      return { text: renderReview(output), data: output };
    }
    case 'bundle': {
      const output = await runBundle(runtime, args);
      return { text: renderBundle(output), data: output };
    }
    default: {
      const output = await versionOutput(runtime);
      return { text: `${output.plugin}\n${output.git}\n${output.node}`, data: output };
    }
  }
}


async function versionOutput(
  runtime: Awaited<ReturnType<typeof createRuntime>>,
): Promise<{ plugin: string; git: string; node: string }> {
  const { Git } = await import('../git/git.ts');
  const git = new Git({ runner: runtime.runner, repositoryRoot: runtime.cwd });
  let gitVersion: string;
  try {
    gitVersion = await git.version();
  } catch {
    gitVersion = 'git: not available';
  }
  return {
    plugin: `ambicode plugin root: ${runtime.pluginRoot}`,
    git: gitVersion,
    node: `node ${process.versions.node}`,
  };
}

/**
 * An operator-facing failure prints its code, the field at fault, and what to
 * do; it never prints a stack trace, because a stack is not an instruction.
 * Anything unrecognized is a defect and keeps its stack.
 */
function reportFailure(error: unknown): number {
  if (isAmbicodeError(error)) {
    const typed: AmbicodeError = error;
    const lines = [`error [${typed.code}]: ${typed.message}`];
    if (typed.field !== undefined) lines.push(`  at: ${typed.field}`);
    for (const detail of typed.details) lines.push(`  - ${detail}`);
    process.stderr.write(`${lines.join('\n')}\n`);
    return 2;
  }
  process.stderr.write(
    `unexpected failure: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  return 70;
}

// Only when this module *is* the program: importing it must not run a command.
if (process.argv[1] !== undefined && import.meta.filename === realEntryPoint()) {
  process.exitCode = await main(process.argv.slice(2));
}

function realEntryPoint(): string | null {
  const entry = process.argv[1];
  if (entry === undefined) return null;
  try {
    return realpathSync(entry);
  } catch {
    return entry;
  }
}
