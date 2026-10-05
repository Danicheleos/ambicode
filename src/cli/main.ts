import { realpathSync } from 'node:fs';
import { createRuntime, type Runtime } from '../composition/root.ts';
import { AmbicodeError, isAmbicodeError } from '../util/errors.ts';
import { formatJsonOutput, type JsonFormat } from '../util/json-output.ts';
import { parseArgs, type OptionSpec, type ParsedArgs } from './args.ts';
import { BUNDLE_OPTIONS, renderBundle, runBundle } from './commands/bundle.ts';
import { CONFIG_OPTIONS, renderConfig, runConfig } from './commands/config.ts';
import { INIT_OPTIONS, renderInit, runInit } from './commands/init.ts';
import { LOCATE_OPTIONS, renderLocate, runLocate } from './commands/locate.ts';
import { NOTE_LIST_OPTIONS, NOTE_PROMOTE_OPTIONS, NOTE_SAVE_OPTIONS, renderNoteList, renderNotePromote, renderNoteSave, runNoteList, runNotePromote, runNoteSave } from './commands/note.ts';
import { POLICY_OPTIONS, renderPolicy, runPolicy } from './commands/policy.ts';
import { POLICY_CHECK_OPTIONS, renderPolicyCheck, runPolicyCheck } from './commands/policy-check.ts';
import { PREPARE_OPTIONS, prepareAsRouteStart, renderPrepare, runPrepare } from './commands/prepare.ts';
import { REPORT_OPTIONS, renderReport, runReport } from './commands/report.ts';
import { FIND_OPTIONS, MAP_OPTIONS, REFS_OPTIONS, renderSearch, runFind, runMap, runRefs } from './commands/search.ts';
import { REQUIREMENTS_ACS_OPTIONS, REQUIREMENTS_NORMALIZE_OPTIONS, REQUIREMENTS_TEMPLATE_OPTIONS, renderRequirements, runRequirementsAcs, runRequirementsNormalize, runRequirementsTemplate } from './commands/requirements.ts';
import { ROUTE_NEXT_OPTIONS, ROUTE_START_OPTIONS, ROUTE_STATUS_OPTIONS, ROUTE_STOP_OPTIONS, renderMessage, renderRouteStatus, runRouteNext, runRouteStart, runRouteStatus, runRouteStop } from './commands/route.ts';
import { REVIEW_OPTIONS, renderReview, runReview } from './commands/review.ts';
import type { ViewOutput } from './commands/view.ts';
import { VIEW_OPTIONS } from './view-options.ts';
import { validateTargetArgs } from './target-option.ts';

export const USAGE = `ambicode <command> [options]

  init                    Detect projects and write .ambicode/config.yaml.
                            --dry-run    Report what would change, write nothing.

  config                  Print the effective configuration, including limits
                          that are not stored in the file.

  policy [paths...]       Print the policy that applies.
                            --project <id>
                            --activity <review|task|plan|investigate>
                            --rule <pack/rule>   repeatable: print only those rules
                            --stage <before-work|before-report>  the text a route
                                                 delivers at that stage; --show
                                                 prints it without the byte cap

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

  note save               Save a skill's note under .ambicode/task/<slug>/ from
                          standard input. The CLI names the file, stamps the time
                          and adds the label; skills do not write that directory.
                            --task <slug>         The task directory (a requirement id
                                                  or a short kebab of the request).
                            --kind <kind>         investigation | plan-draft | notes
                            --from <path>         plan-draft only: read the body from
                                                  steps/plan-body.md of this task
                                                  instead of standard input.
                            --iteration <n>       notes only: record that iteration
                                                  n is done, in the file's first line.

  note promote            Turn the plan draft the user accepted into the plan.
                          Nothing is promoted on the model's own say-so.
                            --task <slug>

  note list               List the notes of a task: kind, path, time, heading,
                          iteration and promotion.
                            --task <slug>

  route start <skill> [request…]
                          Start a skill's route. The first step is printed.
                            --task <slug>  --headless  --project <id>
                            --answer <gate>=<option>   repeatable
                            --requirement <url>        repeatable
                            --fresh | --adopt          restart or take over a route

  route next              End the current step and print the next one.
                            --task <slug>
                            --answer <gate>=<option>   a non-acting option
                            --default <gate>   --revise <stepId>
                            --conflict "<summary>" --sources A,B
                            --project <id>   --show <payload>

  route status            Where each open route on the task stands. Read-only.
                            --task <slug>

  route stop              End the route: blocked | human | inconclusive | budget.
                            --task <slug>  --reason <r>  --detail <text>

  map [paths...]          Files, symbols and spans a request touches, built by
                          the layers in search.layers, at most 6 KiB. Recorded.
                            --task <slug>  --project <id>  --mode <prompt|context>
                            --term <t>   --symbol <s>   repeatable   --show
                            --layers   always refused: edit search.layers in the config

  refs <name...>          Lines using each whole word (git grep -w); a name
                          declared in several files is flagged. At most 4 KiB.
                            --task <slug>  --project <id>  --show

  find <name>             Declarations of a name. At most 4 KiB.
                            --task <slug>  --project <id>  --kind <k>

  requirements template   The calls that retrieve the asked sources.
                            --task <slug>  --requirement <url>   repeatable

  requirements normalize  Build the task's requirement envelope from what the
                          session captured. Advances the route.
                            --task <slug>

  requirements acs        The acceptance units of the task's envelope. Read-only.
                            --task <slug>

  report                  The evidence of a task and what was not verified,
                          generated from its ledger.
                            --task <slug>

  locate [terms...]       A ranked shortlist of the files a request is probably
                          about, each with the reason it ranked: path and
                          filename shape, file contents, and which files
                          habitually change with the ones already matched.
                          Only source files are listed (tests, styles, markup
                          and data are not); projects[].shortlist in
                          .ambicode/config.yaml sets include and exclude globs.
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
                          --activity investigate is deprecated: it runs
                          route start investigate, with --task-open or the
                          --term values joined, then the paths, as the request;
                          --requirement and --project pass through; --evidence
                          is ignored.
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
                            --task-open <text>    Name this request's task directory:
                                                  a ticket id, or the request in
                                                  words. The output's task.slug is
                                                  the directory note save and
                                                  review take. A requirement's id
                                                  wins over the text.
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
                            --decline <key>       Refuse one proposed run; repeatable.
                                                  The check is reported as a gap
                                                  somebody chose, and the review
                                                  goes on without it.
                            --task <slug>         Save under this task's directory.
                                                  Without it, the first --requirement
                                                  names the directory, and a run with
                                                  neither belongs to no task.
                            --exclude <glob>      Do not review paths matching this
                                                  glob; repeatable, added to
                                                  review.excludePaths. The way past a
                                                  refusal a limit cannot fix, such as
                                                  one generated file over the per-file
                                                  snapshot ceiling.
                            --only <glob>         Review nothing outside this glob;
                                                  repeatable. For a dirty tree holding
                                                  more than the work in hand.
                                                  Both state the gap in the report,
                                                  and neither may empty the review.
                            --context <path>      An unchanged file that relies on the
                                                  change, for the reviewer to check;
                                                  repeatable. Local targets only. The
                                                  review also looks up files that
                                                  mention names the change touches.
                            --with-tests          Review the change's test code too.
                                                  --mr leaves it out by default: no
                                                  check executes it there, so it costs
                                                  budget and returns nothing.

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
                            --decline <key>       Refuse one proposed run; repeatable.
                            --task <slug>         Save under this task's directory.
                            --exclude <glob>      Do not review matching paths; repeatable.
                            --only <glob>         Review only matching paths; repeatable.
                            --context <path>      Unchanged file relying on the change; repeatable.
                            --with-tests          Include the change's test code (--mr).

  view                  Open a saved review in a local page on 127.0.0.1, to
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
   * Nonzero when the *finding* is the outcome (e.g. `policy check` reported an
   * error) rather than a failure to run; an operator error still throws and exits 2.
   */
  exitCode?: number;
  /** Printed to standard error, so a `--json` reader of stdout still receives one document. */
  warnings?: string[];
};

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  // The hook entry point has its own I/O contract (stdin JSON in, hook JSON out,
  // always exit 0), so it bypasses option parsing and `dispatch`.
  if (command === 'hook') {
    const { runHook, MAX_HOOK_INPUT_BYTES } = await import('../hook/events/run-hook.ts');
    const runtime = await createRuntime();
    const stdin = (await runtime.stdin.read(MAX_HOOK_INPUT_BYTES)) ?? '';
    const output = await runHook(runtime, stdin);
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return 0;
  }

  // Recognized here rather than by `runPolicy` inspecting its operands, so a
  // path literally named "check" stays reachable as `policy -- check`.
  const subcommand =
    command === 'policy' && rest[0] === 'check' ? 'check' : command === 'note' && NOTE_COMMANDS.includes(rest[0] ?? '') ? rest[0] : command === 'route' && ROUTE_COMMANDS.includes(rest[0] ?? '') ? rest[0] : command === 'requirements' && REQUIREMENTS_COMMANDS.includes(rest[0] ?? '') ? rest[0] : undefined;
  const name = subcommand === undefined ? command : `${command} ${subcommand}`;
  const commandArgv = subcommand === undefined ? rest : rest.slice(1);

  const spec = SPECS[name];
  if (spec === undefined) {
    process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
    return 2;
  }

  try {
    // Parsed and validated before any runtime exists: a bad argument must not
    // reach a process, the filesystem or a provider.
    const args = parseArgs(name, commandArgv, spec);
    validateCombination(name, args);
    const rendered = await dispatch(name, args);
    for (const warning of rendered.warnings ?? []) process.stderr.write(`${warning}\n`);
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
const NOTE_COMMANDS = ['save', 'promote', 'list'];
const ROUTE_COMMANDS = ['start', 'next', 'status', 'stop'];
const REQUIREMENTS_COMMANDS = ['template', 'normalize', 'acs'];

export const SPECS: Record<string, OptionSpec | undefined> = {
  init: INIT_OPTIONS,
  config: CONFIG_OPTIONS,
  locate: LOCATE_OPTIONS,
  policy: POLICY_OPTIONS,
  'policy check': POLICY_CHECK_OPTIONS,
  'note save': NOTE_SAVE_OPTIONS,
  'note promote': NOTE_PROMOTE_OPTIONS,
  'note list': NOTE_LIST_OPTIONS,
  report: REPORT_OPTIONS,
  'route start': ROUTE_START_OPTIONS,
  'route next': ROUTE_NEXT_OPTIONS,
  'route status': ROUTE_STATUS_OPTIONS,
  'route stop': ROUTE_STOP_OPTIONS,
  map: MAP_OPTIONS,
  refs: REFS_OPTIONS,
  find: FIND_OPTIONS,
  'requirements template': REQUIREMENTS_TEMPLATE_OPTIONS,
  'requirements normalize': REQUIREMENTS_NORMALIZE_OPTIONS,
  'requirements acs': REQUIREMENTS_ACS_OPTIONS,
  prepare: PREPARE_OPTIONS,
  review: REVIEW_OPTIONS,
  bundle: BUNDLE_OPTIONS,
  view: VIEW_OPTIONS,
  version: VERSION_OPTIONS,
};

function validateCombination(command: string, args: ParsedArgs): void {
  if (command === 'review' || command === 'bundle') validateTargetArgs(command, args);
}

async function dispatch(command: string, args: ParsedArgs): Promise<Rendered> {
  const runtime = await createRuntime();
  const rendered = await run(command, args, runtime);
  const notices = runtime.notices ?? [];
  return notices.length === 0 ? rendered : { ...rendered, warnings: [...notices, ...(rendered.warnings ?? [])] };
}

async function run(command: string, args: ParsedArgs, runtime: Runtime): Promise<Rendered> {
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
      return { text: renderPolicyCheck(output), data: output, ...(output.ok ? {} : { exitCode: 1 }) };
    }
    case 'note save': {
      const output = await runNoteSave(runtime, args);
      return { text: renderNoteSave(output), data: output, warnings: output.warnings ?? [] };
    }
    case 'note promote': {
      const output = await runNotePromote(runtime, args);
      return { text: renderNotePromote(output), data: output };
    }
    case 'note list': {
      const output = await runNoteList(runtime, args);
      return { text: renderNoteList(output), data: output };
    }
    case 'route start': {
      const output = await runRouteStart(runtime, args);
      return { text: renderMessage(output), data: output };
    }
    case 'route next': {
      const output = await runRouteNext(runtime, args);
      return { text: renderMessage(output), data: output };
    }
    case 'route status': {
      const output = await runRouteStatus(runtime, args);
      return { text: renderRouteStatus(output), data: output };
    }
    case 'route stop': {
      const output = await runRouteStop(runtime, args);
      return { text: `Route on task ${output.task} stopped: ${output.reason}.`, data: output };
    }
    case 'map':
    case 'refs':
    case 'find': {
      const output = await (command === 'map' ? runMap : command === 'refs' ? runRefs : runFind)(runtime, args);
      return { text: renderSearch(output), data: output.data, json: 'compact' };
    }
    case 'requirements template':
    case 'requirements normalize':
    case 'requirements acs': {
      const output = await (command === 'requirements template' ? runRequirementsTemplate : command === 'requirements normalize' ? runRequirementsNormalize : runRequirementsAcs)(runtime, args);
      return { text: renderRequirements(output), data: output.data };
    }
    case 'report': {
      const output = await runReport(runtime, args);
      return { text: renderReport(output), data: { evidence: output.evidence, notVerified: output.notVerified, hash: output.hash } };
    }
    case 'locate': {
      const output = await runLocate(runtime, args);
      // Compact: its reader is a model, and indentation on a path list carries no information.
      return { text: renderLocate(output), data: output, json: 'compact' };
    }
    case 'prepare': {
      if (args.value('activity') === 'investigate') {
        const { argv, notices } = prepareAsRouteStart(args);
        for (const notice of notices) process.stderr.write(`${notice}\n`);
        const output = await runRouteStart(runtime, parseArgs('route start', argv, ROUTE_START_OPTIONS));
        return { text: renderMessage(output), data: output };
      }
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
      // Loaded here and nowhere else: see `view-options.ts`.
      const { renderView, runView } = await import('./commands/view.ts');
      // stderr, so a `--json` reader of stdout still receives one document; a
      // closed reader (EPIPE) must cost the diagnostic line, not the page.
      process.stderr.on('error', () => undefined);
      const output = await runView(runtime, args, { log: (line) => process.stderr.write(`${line}\n`) });
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
 * An operator-facing failure prints its code, field and remedy, never a stack;
 * anything unrecognized is a defect and keeps its stack.
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
