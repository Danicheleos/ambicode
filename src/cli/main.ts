import { realpathSync } from 'node:fs';
import { createRuntime } from '../composition/root.ts';
import { AmbicodeError, isAmbicodeError } from '../util/errors.ts';
import { formatJsonOutput, type JsonFormat } from '../util/json-output.ts';
import { parseArgs, type OptionSpec, type ParsedArgs } from './args.ts';
import { BUNDLE_OPTIONS, renderBundle, runBundle } from './commands/bundle.ts';
import { CONFIG_OPTIONS, renderConfig, runConfig } from './commands/config.ts';
import { INIT_OPTIONS, renderInit, runInit } from './commands/init.ts';
import { LOCATE_OPTIONS, renderLocate, runLocate } from './commands/locate.ts';
import { POLICY_OPTIONS, renderPolicy, runPolicy } from './commands/policy.ts';
import { POLICY_CHECK_OPTIONS, renderPolicyCheck, runPolicyCheck } from './commands/policy-check.ts';
import { PREPARE_OPTIONS, renderPrepare, runPrepare } from './commands/prepare.ts';
import { REVIEW_OPTIONS, renderReview, runReview } from './commands/review.ts';
import { VIEW_OPTIONS, renderView, runView, type ViewOutput } from './commands/view.ts';
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

  policy check <file...>  Validate candidate policy pack files that are not yet
                          referenced from .ambicode/config.yaml: the schema, the
                          load-time rules, and what each appliesTo glob matches
                          in the repository as it stands. Exits nonzero when any
                          diagnostic is an error. Nothing is written.
                            --project <id>        The project whose root, layout
                                                  and command catalog the packs
                                                  are judged against. Required
                                                  when more than one project is
                                                  configured.
                          To resolve policy for a path literally named "check",
                          write "policy -- check".

  locate [terms...]       A ranked shortlist of the files a request is probably
                          about, each with the reason it ranked: path and
                          filename shape, file contents, and which files
                          habitually change with the ones already matched.
                          Nothing is indexed, cached, or written; it is a
                          starting point to confirm, not an answer.
                            --project <id>        Required when more than one
                                                  project is configured.
                            --evidence <file|->   Derive the terms from the
                                                  retrieved requirement
                                                  envelope instead of naming
                                                  them.
                            --limit <n>           Candidates to list (default 20).

  prepare [paths...]      The smallest shared preparation for a skill that has
                          not yet decided what to do: normalized requirement
                          provenance and applicable policy. No provider,
                          reviewer, or publication call; no project command or
                          configured check runs; nothing is written.
                            --activity <review|task|plan|investigate>  Required.
                            --project <id>        Required when more than one
                                                  project is configured and the
                                                  given paths do not resolve to
                                                  exactly one of them.
                            --requirement <url>   Jira or Confluence URL;
                                                  repeatable. Without any, this
                                                  is a source-free run.
                            --evidence <file|->   The retrieved requirement
                                                  evidence, as a file path or
                                                  "-" to read the envelope from
                                                  standard input. Required
                                                  whenever --requirement is used.
                            --term <term>         Seed the boundary shortlist;
                                                  repeatable. Without any, the
                                                  terms come from the requirement
                                                  text when evidence is supplied.
                            --with-contract       Inline the shared operating
                                                  contract's text, for a session
                                                  the AMBICODE hook never reached.
                            --verbose             Emit the full, indented shape
                                                  instead of the compact default.

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
                            --evidence <file|->   The retrieved requirement evidence,
                                                  as a file path or "-" for standard
                                                  input. Required whenever
                                                  --requirement is used.
                            --approve <key>       Authorize one proposed run; repeatable.

  bundle                  The evidence stage of "review" on its own: target,
                          snapshot, requirements and checks, with no model
                          invoked. Takes the same target options.
                            --branch              Review the branch, not the working tree.
                            --base <ref>          Baseline for --branch. Valid only there.
                            --mr <url>            Bundle a GitLab merge request.
                            --requirement <url>   Requirement URL; repeatable.
                            --evidence <file|->   The retrieved requirement evidence,
                                                  or "-" for standard input.
                            --approve <key>       Authorize one proposed run; repeatable.

  view                    Open a saved review in a local page on 127.0.0.1, to
                          read it and, for a merge request review, select
                          comments to publish. The link is printed and opened
                          once; the page stops on Ctrl-C or when it idles out.
                            --review <id|path>    The review id from the report, or
                                                  the path of its saved result.json.
                            --no-open             Print the URL without launching a
                                                  browser.

  version                 Print the helper and git versions.

Global:
  --json                  Emit structured output instead of text.
`;

type Rendered = {
  text: string;
  data: unknown;
  /** How `--json` serializes `data`; pretty unless the command says otherwise. */
  json?: JsonFormat;
  /** A command that keeps serving until this settles, e.g. the review page. */
  wait?: { until: Promise<string>; stop: (reason: string) => Promise<void> };
  /**
   * A nonzero status for a command whose *finding* is the outcome, not a
   * failure to run: `policy check` printed its report in full and then exits
   * nonzero because a diagnostic was an error. An operator error still throws
   * and still exits 2; this is neither that nor success.
   */
  exitCode?: number;
};

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  // The packaged PostToolUse/SessionStart/PostCompact/SessionEnd hook entry
  // point (doc 04 P2.4 correction G): a completely different I/O contract
  // from every other command — stdin JSON in, the exact hook JSON contract
  // out, always exit 0, never the `{text, data}`/`--json` shape the rest of
  // this dispatcher uses — so it is handled here, before `SPECS`/`dispatch`,
  // rather than forced through option parsing it does not have.
  if (command === 'hook') {
    const { runHook, MAX_HOOK_INPUT_BYTES } = await import('../hook/run-hook.ts');
    const runtime = await createRuntime();
    const stdin = (await runtime.stdin.read(MAX_HOOK_INPUT_BYTES)) ?? '';
    const output = await runHook(runtime, stdin);
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return 0;
  }

  // The one two-word command. `policy`'s operands are paths, so the subcommand
  // is recognized here, once, rather than by `runPolicy` inspecting its own
  // operands: a path literally named "check" stays reachable as
  // `policy -- check`, which does not match this.
  const name = command === 'policy' && rest[0] === 'check' ? 'policy check' : command;
  const commandArgv = name === 'policy check' ? rest.slice(1) : rest;

  const spec = SPECS[name];
  if (spec === undefined) {
    process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
    return 2;
  }

  try {
    // Parsed once, before any runtime exists: a bad argument must not reach a
    // process, the filesystem or a provider, and a good one must not be re-judged.
    const args = parseArgs(name, commandArgv, spec);
    // Combination rules are decided here too, still before a runtime exists:
    // a conflicting target must not create a temporary directory, start git,
    // or reach a provider first.
    validateCombination(name, args);
    const rendered = await dispatch(name, args);
    process.stdout.write(
      args.flag('json') ? formatJsonOutput(rendered.data, rendered.json ?? 'pretty') : `${rendered.text}\n`,
    );
    if (rendered.wait !== undefined) {
      const reason = await serveUntilStopped(rendered.wait);
      process.stdout.write(`The review page stopped: ${reason}.\n`);
    }
    return rendered.exitCode ?? 0;
  } catch (error) {
    return reportFailure(error);
  }
}

const VERSION_OPTIONS = { flags: ['json'] } as const;

/** Every command accepts `--json`; the rest of each spec is the command's own. */
export const SPECS: Record<string, OptionSpec | undefined> = {
  init: INIT_OPTIONS,
  config: CONFIG_OPTIONS,
  locate: LOCATE_OPTIONS,
  policy: POLICY_OPTIONS,
  'policy check': POLICY_CHECK_OPTIONS,
  prepare: PREPARE_OPTIONS,
  review: REVIEW_OPTIONS,
  bundle: BUNDLE_OPTIONS,
  view: VIEW_OPTIONS,
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
    case 'policy check': {
      const output = await runPolicyCheck(runtime, args);
      // The report is the deliverable either way; the status says whether the
      // candidate files are usable, so a skill can loop on it without parsing.
      return { text: renderPolicyCheck(output), data: output, ...(output.ok ? {} : { exitCode: 1 }) };
    }
    case 'locate': {
      const output = await runLocate(runtime, args);
      // Compact, like `prepare`: its reader is a model deciding where to look,
      // and indentation on a path list carries no information (R2).
      return { text: renderLocate(output), data: output, json: 'compact' };
    }
    case 'prepare': {
      const run = await runPrepare(runtime, args);
      return { text: renderPrepare(run), data: run.data, json: run.json };
    }
    case 'review': {
      const output = await runReview(runtime, args);
      return { text: renderReview(output), data: output };
    }
    case 'bundle': {
      const output = await runBundle(runtime, args);
      return { text: renderBundle(output), data: output };
    }
    case 'view': {
      const output = await runView(runtime, args);
      return {
        text: renderView(output),
        data: viewData(output),
        wait: { until: output.stopped, stop: output.stop },
      };
    }
    default: {
      const output = await versionOutput(runtime);
      return { text: `${output.plugin}\n${output.git}\n${output.node}`, data: output };
    }
  }
}


/** The page runs until it idles out, is stopped, or the operator signals it. */
async function serveUntilStopped(wait: {
  until: Promise<string>;
  stop: (reason: string) => Promise<void>;
}): Promise<string> {
  const onSignal = (signal: NodeJS.Signals): void => {
    void wait.stop(`received ${signal}`);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return await wait.until;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

/** The promises and the stop handle are not serializable, and not data. */
function viewData(output: ViewOutput): Record<string, unknown> {
  const { stopped: _stopped, stop: _stop, ...data } = output;
  return data;
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
