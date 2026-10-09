import { realpathSync } from 'node:fs';
import { createRuntime } from '#composition/root';
import { RecordingProcessRunner } from '#platform/ports/recording-process-runner';
import { logInvocation, type Invocation } from './command-log.ts';
import { AmbicodeError, isAmbicodeError } from '#util/errors';
import { formatJsonOutput } from '#util/json-output';
import { parseArgs } from '#util/args';
import { taskWorkingDirectory } from '#modules/evidence/task/task-dir';
import { bundleCommand } from './commands/review/bundle.ts';
import { configCommand } from './commands/config/config.ts';
import { initCommand } from './commands/config/init.ts';
import { doctorCommand } from './commands/config/doctor.ts';
import { rulesApplyCommand, rulesDiscoverCommand, rulesRevertCommand } from './commands/policy/rules.ts';
import { locateCommand } from './commands/search/locate.ts';
import { checkCommand } from './commands/checks/check.ts';
import { formatCommand } from './commands/checks/format.ts';
import { noteListCommand, notePromoteCommand, noteSaveCommand } from './commands/route/note.ts';
import { planCheckCommand } from './commands/workers/plan-check.ts';
import { policyCommand } from './commands/policy/policy.ts';
import { policyCheckCommand } from './commands/policy/policy-check.ts';
import { prepareCommand } from './commands/prepare/prepare.ts';
import { reportCommand } from './commands/route/report.ts';
import { findCommand, indexBuildCommand, indexStatusCommand, mapCommand, readCommand, refsCommand, relatesCommand } from './commands/search/search.ts';
import { requirementsAcsCommand, requirementsNormalizeCommand, requirementsTemplateCommand } from './commands/requirements/requirements.ts';
import { routeNextCommand, routeStartCommand, routeStatusCommand, routeStopCommand } from './commands/route/route.ts';
import { reviewCommand } from './commands/review/review.ts';
import { workerRunCommand } from './commands/workers/worker.ts';
import type { Runtime } from '#types/composition';
import { MAX_HOOK_INPUT_BYTES } from '#types/hook';
import type { CliCommand, OptionSpec, ParsedArgs, Rendered, ViewOutput } from './types/cli.ts';
import { VIEW_OPTIONS } from './types/options.ts';

export const USAGE = `ambicode <command> [options]

  init                    Propose .ambicode/config.yaml: detected projects, commands,
                          packs, ignore lines, search layers. Writes nothing.
                            --task <slug>  --dry-run  --refresh-profile
                            --apply --task <slug>  --set <key>=<value> (repeatable)
                                write config v3 and the ignore lines the user
                                accepted at the init question, then run doctor.
                                Only inside the init route, with the user's own
                                answer.

  doctor                  Check that every configured command starts (its version
                          probe, through the command policy). Writes nothing.
                            --project <id>

  rules discover [sources…]
                          List rule-source candidates for /ambicode:rules.
                            --project <id>  look under that project's root only
  rules apply             Make the drafts the user accepted live packs.
                            --task <slug>  --project <id>
  rules revert <pack-id>  Unwire a live pack and move it back to the drafts.
                            --project <id>

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
                            --drafts [--task <slug>]  check the drafts under
                                                  .ambicode/policies/drafts/ and
                                                  their source quotes; with
                                                  --task, record the result in
                                                  the rules route.
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

  check <projectId>/<checkId>
                          Run one configured check on the named files and record
                          it, with the runner's summary and whether it proves the
                          phase (red: a test failed; green: exit 0, tests ran).
                            --task <slug>  --only <file> (repeatable)  --phase red|green
                            --approve <key> | --decline <key>

  format [paths…]         Run each project's format command on the files this
                          task touched (narrowed to paths) and record it.
                            --task <slug>

  plan check              Save steps/plan-body.md as a plan draft, then check it by
                          code: anchors, acceptance units, new names already
                          declared. Exits 0 when the check ran, pass or fail.
                            --task <slug>
                            --from steps/plan-body.md   else the plan on standard input

  worker run <id>         Run the worker defined in the plugin's workers/<id>.yaml
                          and keep its JSON output as an artifact of the task.
                            --task <slug>

  route start <skill> [request…]
                          Start a skill's route. The first step is printed.
                            --task <slug>  --headless  --project <id>
                            --plan <file> | --from-draft <file>   task: the plan
                                                       (or draft) to implement
                            --answer <gate>=<option>   repeatable
                            --requirement <url>        repeatable
                            --fresh | --adopt          restart or take over a route
                            --branch --base <ref> | --mr <url>   review only: the target

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

  relates <path>          Imports and importers of a file: from the index, else
                          files naming its basename. At most 4 KiB. Recorded.
                            --task <slug>  --project <id>  --show

  read <path[:start-end]...>
                          Several files or line spans in one numbered result,
                          sharing a byte budget; a file cut short names the span
                          to ask for next. A path is from the current directory,
                          the repository root, or a unique tracked suffix.
                          Recorded.
                          A whole file over 500 lines, or the larger files of a
                          batch that would not fit, return a declaration outline
                          (name a-b); --full serves the bodies. Spans already
                          served in this route are not served again; --again
                          re-reads them.
                            --task <slug>  --budget <bytes>  (default 24000)
                            --full  --again

  index build             Build the code index (search.index) in the foreground.
                            --project <id>

  index status            Whether the code index is fresh, stale, building or absent.
                            --project <id>

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
                                                  neither belongs to no task. With a
                                                  task baseline, changes that predate
                                                  the task are left out.
                            --estimate            Print what the review would cover
                                                  and run, and write nothing.
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
                          comments to publish. The link is printed; the page
                          stops on Ctrl-C or when it idles out.
                            --review <id|path>    The review id from the report, or
                                                  the path of its saved result.json.
                            --open                Also launch a browser; ask the user
                                                  first.

  version                 Print the helper and git versions.

Global:
  --json                  Emit structured output instead of text.
`;

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  // The hook entry point has its own I/O contract (stdin JSON in, hook JSON out,
  // always exit 0), so it bypasses option parsing and `dispatch`.
  if (command === 'hook') {
    const { runHook } = await import('#hook/events/run-hook');
    const runtime = await createRuntime();
    const stdin = (await runtime.stdin.read(MAX_HOOK_INPUT_BYTES)) ?? '';
    const output = await runHook(runtime, stdin);
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return 0;
  }

  // Recognized here rather than by `runPolicy` inspecting its operands, so a
  // path literally named "check" stays reachable as `policy -- check`.
  const subcommand =
    command === 'policy' && rest[0] === 'check' ? 'check' : command === 'note' && NOTE_COMMANDS.includes(rest[0] ?? '') ? rest[0] : command === 'route' && ROUTE_COMMANDS.includes(rest[0] ?? '') ? rest[0] : command === 'requirements' && REQUIREMENTS_COMMANDS.includes(rest[0] ?? '') ? rest[0] : command === 'index' && INDEX_COMMANDS.includes(rest[0] ?? '') ? rest[0] : command === 'rules' && RULES_COMMANDS.includes(rest[0] ?? '') ? rest[0] : command === 'plan' && rest[0] === 'check' ? 'check' : command === 'worker' && rest[0] === 'run' ? 'run' : undefined;
  const name = subcommand === undefined ? command : `${command} ${subcommand}`;
  const commandArgv = subcommand === undefined ? rest : rest.slice(1);

  const entry = COMMANDS.get(name);
  if (entry === undefined) {
    process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
    return 2;
  }

  try {
    // Parsed and validated before any runtime exists: a bad argument must not
    // reach a process, the filesystem or a provider.
    const args = parseArgs(name, commandArgv, entry.options);
    entry.validate?.(args);
    const started = performance.now();
    const logged: Logged = {};
    const rendered = await dispatch(entry, args, logged);
    for (const warning of rendered.warnings ?? []) process.stderr.write(`${warning}\n`);
    process.stdout.write(
      args.flag('json') ? formatJsonOutput(rendered.data, rendered.json ?? 'pretty') : `${rendered.text}\n`,
    );
    if (rendered.wait !== undefined) {
      const reason = await serveUntilStopped(rendered.wait);
      process.stdout.write(`The review page stopped: ${reason}.\n`);
    }
    const exit = rendered.exitCode ?? 0;
    await logged.log?.({ name, argv: commandArgv, task: args.value('task'), exit, ms: Math.round(performance.now() - started), out: Buffer.byteLength(rendered.text) });
    return exit;
  } catch (error) {
    return reportFailure(error);
  }
}

const VERSION_OPTIONS = { flags: ['json'] } as const;
const NOTE_COMMANDS = ['save', 'promote', 'list'];
const ROUTE_COMMANDS = ['start', 'next', 'status', 'stop'];
const REQUIREMENTS_COMMANDS = ['template', 'normalize', 'acs'];
const INDEX_COMMANDS = ['build', 'status'];
const RULES_COMMANDS = ['discover', 'apply', 'revert'];

const viewCommand: CliCommand = {
  name: 'view',
  options: VIEW_OPTIONS,
  run: async (runtime, args) => {
    // Loaded here and nowhere else: see `view-options.ts`.
    const { renderView, runView } = await import('./commands/review/view.ts');
    // stderr, so a `--json` reader of stdout still receives one document; a
    // closed reader (EPIPE) must cost the diagnostic line, not the page.
    process.stderr.on('error', () => undefined);
    const output = await runView(runtime, args, { log: (line) => process.stderr.write(`${line}\n`) });
    return {
      text: renderView(output),
      data: viewData(output),
      wait: { until: output.stopped, stop: output.stop },
    };
  },
};

const versionCommand: CliCommand = {
  name: 'version',
  options: VERSION_OPTIONS,
  run: async (runtime) => {
    const output = await versionOutput(runtime);
    return { text: `${output.plugin}\n${output.git}\n${output.node}`, data: output };
  },
};

const COMMANDS: ReadonlyMap<string, CliCommand> = new Map([
  initCommand, doctorCommand, rulesDiscoverCommand, rulesApplyCommand, rulesRevertCommand, configCommand, locateCommand,
  policyCommand, policyCheckCommand, noteSaveCommand, notePromoteCommand, noteListCommand, planCheckCommand, checkCommand,
  formatCommand, workerRunCommand, reportCommand, routeStartCommand, routeNextCommand, routeStatusCommand, routeStopCommand,
  mapCommand, refsCommand, findCommand, relatesCommand, readCommand, indexBuildCommand, indexStatusCommand, requirementsTemplateCommand,
  requirementsNormalizeCommand, requirementsAcsCommand, prepareCommand, reviewCommand, bundleCommand, viewCommand, versionCommand,
].map((entry) => [entry.name, entry]));

export const SPECS: Record<string, OptionSpec | undefined> = Object.fromEntries([...COMMANDS].map(([name, entry]) => [name, entry.options]));

interface Logged { log?: (invocation: Invocation) => Promise<void> }

async function dispatch(command: CliCommand, args: ParsedArgs, logged: Logged): Promise<Rendered> {
  const shell = await createRuntime();
  const task = args.value('task');
  const cwd = task === null ? shell.cwd : await taskWorkingDirectory(shell, task);
  const created = cwd === shell.cwd ? shell : await createRuntime({ cwd });
  const recorder = new RecordingProcessRunner(created.runner);
  const runtime: Runtime = { ...created, runner: recorder };
  logged.log = (invocation) => logInvocation(runtime, recorder.records, invocation);
  const rendered = await command.run(runtime, args);
  const notices = runtime.notices ?? [];
  return notices.length === 0 ? rendered : { ...rendered, warnings: [...notices, ...(rendered.warnings ?? [])] };
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

async function versionOutput(runtime: Runtime): Promise<{ plugin: string; git: string; node: string }> {
  const { Git } = await import('#platform/git/git');
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
