import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '../contracts/config.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import type { CheckResult } from '../contracts/review.ts';
import { MAX_COMMAND_OUTPUT_BYTES } from '../config/defaults.ts';
import type { Git } from '../git/git.ts';
import type { Clock } from '../ports/clock.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import type { ProcessRunner } from '../ports/process.ts';
import { normalizeRelative } from '../util/paths.ts';
import { adapterFor } from './adapters.ts';
import { authorizeCommand, checkApprovalKey, selectorApprovalKey } from './authorize.ts';
import { MUTATION_DISCLAIMER, watchWorkspace } from './mutations.ts';
import {
  expandFiles,
  selectionRunsCommand,
  selectLintFiles,
  selectorCommandPlan,
  selectTestFiles,
  type ChangedPath,
  type Selection,
} from './select.ts';

export interface RunChecksOptions {
  fs: FileSystem;
  config: AmbicodeConfig;
  project: ProjectConfig;
  policy: ResolvedPolicy;
  changed: readonly ChangedPath[];
  repositoryRoot: string;
  runner: ProcessRunner;
  clock: Clock;
  /** Check IDs a human authorized for this run only (D08). */
  approvals: ReadonlySet<string>;
  /** Absolute directory the review writes captured output into. */
  reviewDirectory: string;
  enumerationRevision: string | null;
  git: Git;
  /**
   * Repository-relative paths under review. They are fingerprinted around every
   * command so a project tool that rewrites them is reported (doc 03 P1.3).
   */
  watchedPaths: readonly string[];
  /**
   * What the checkout is, relative to the reviewed revision, when the two are
   * not the same thing. Attached to every result that actually ran, because the
   * evidence then describes something other than what was reviewed.
   */
  revisionNote: string | null;
  /**
   * Approval keys a human answered with "no". A declined check is skipped
   * exactly as an unauthorized one is, and the difference is the whole point:
   * it stops waiting. Without it "waiting for authorization" has no ending
   * except approving, so a caller that gates on it could never proceed.
   */
  declines: ReadonlySet<string>;
}

export interface PendingApproval {
  checkId: string;
  /** The token the caller puts back into `approvals` to authorize this run. */
  approvalKey: string;
  projectId: string;
  reason: string;
  scope: string;
  proposedArgv: string[];
  cwd: string;
}

export interface RunChecksOutcome {
  results: CheckResult[];
  /** What a skill must put to the human before those checks can run. */
  pendingApprovals: PendingApproval[];
}

export async function runChecks(options: RunChecksOptions): Promise<RunChecksOutcome> {
  const results: CheckResult[] = [];
  const pendingApprovals: PendingApproval[] = [];
  // Brackets every process this function starts, selectors included.
  const watch = watchWorkspace({
    fs: options.fs,
    git: options.git,
    repositoryRoot: options.repositoryRoot,
    paths: options.watchedPaths,
  });
  const projectRoot = normalizeRelative(options.project.root);
  const absoluteRoot = path.join(options.repositoryRoot, projectRoot);

  for (const checkId of Object.keys(options.project.checks).sort()) {
    const check = options.project.checks[checkId];
    const approvalKey = checkApprovalKey(options.project.id, checkId);
    const selectorKey = selectorApprovalKey(options.project.id, checkId);

    if (check === null || check === undefined) {
      results.push(
        skipped(checkId, options.project.id, '(none)', 'unconfigured', [
          'This check is set to null in the configuration, so it is intentionally unavailable.',
        ]),
      );
      continue;
    }

    const adapter = adapterFor(check.adapter);
    const command = options.project.commands[check.command];
    if (command === undefined) {
      results.push(
        skipped(checkId, options.project.id, check.command, check.adapter, [
          `The check references command "${check.command}", which the project does not declare.`,
        ]),
      );
      continue;
    }

    const authorization = authorizeCommand({
      policy: options.policy,
      commandId: check.command,
      approvalKey,
      approvals: options.approvals,
    });
    if (authorization.kind === 'refused') {
      results.push(
        skipped(checkId, options.project.id, check.command, check.adapter, [authorization.reason]),
      );
      continue;
    }

    if (command === null) {
      // A run decision does not conjure a command that is not configured.
      results.push(
        skipped(checkId, options.project.id, check.command, check.adapter, [
          `Command "${check.command}" is configured as null, so this check has nothing to run. Set its argv to enable it.`,
        ]),
      );
      continue;
    }

    // A command selector runs project code, so it is authorized in its own
    // right before selection begins. Approving the test command is not
    // approving the script that decides which tests to run.
    if (check.selector?.kind === 'command') {
      const selectorCommandId = check.selector.command;
      const selectorAuthorization = authorizeCommand({
        policy: options.policy,
        commandId: selectorCommandId,
        approvalKey: selectorKey,
        approvals: options.approvals,
      });

      if (selectorAuthorization.kind !== 'allowed') {
        const plan = selectorCommandPlan({
          project: options.project,
          repositoryRoot: options.repositoryRoot,
          changed: options.changed,
          commandId: selectorCommandId,
        });

        if (selectorAuthorization.kind === 'needs-approval') {
          pendingApprovals.push({
            checkId,
            approvalKey: selectorKey,
            projectId: options.project.id,
            reason: `${selectorAuthorization.reason}, and it selects the files for check "${checkId}"`,
            scope: `selector for check "${checkId}"`,
            proposedArgv: plan?.argv ?? [],
            cwd: plan?.cwd ?? commandCwdFor(absoluteRoot, null),
          });
        }

        results.push(
          skipped(checkId, options.project.id, check.command, check.adapter, [
            `The selector command "${selectorCommandId}" was not run: ${selectorAuthorization.reason}.`,
            'Nothing could be selected, so the check was skipped. This is a gap in verification, not a passing check.',
          ]),
        );
        continue;
      }
    }

    const selectOptions = {
      fs: options.fs,
      project: options.project,
      check,
      changed: options.changed,
      repositoryRoot: options.repositoryRoot,
      runner: options.runner,
      enumerationRevision: options.enumerationRevision,
      maxSelectedTestFiles: options.config.checks.maxSelectedTestFiles,
      timeoutMs: (command.timeoutSeconds ?? options.config.checks.timeoutSeconds) * 1000,
      commandArgv: command.argv,
      authorize: (commandId: string) =>
        authorizeCommand({
          policy: options.policy,
          commandId,
          approvalKey: selectorKey,
          approvals: options.approvals,
        }),
    };

    // Selection runs project code too: a `command` selector is a project
    // script, a `related` selector asks the runner. Both are watched.
    const selectionExecutes = adapter.role !== 'lint' && selectionRunsCommand(check);
    if (selectionExecutes) await watch.baseline();

    const selection: Selection =
      adapter.role === 'lint' ? selectLintFiles(selectOptions) : await selectTestFiles(selectOptions);

    const selectionMutations = selectionExecutes
      ? await watch.observe(`the selector for check "${checkId}"`)
      : [];

    const commandCwd = commandCwdFor(absoluteRoot, command.cwd ?? null);
    const argv = expandFiles(command.argv, selection.files.map((file) => file.path));

    if (selection.files.length === 0) {
      // An empty selection never becomes a whole-suite command (doc 05). A
      // selector that moved the tree before returning nothing is still reported.
      results.push({
        ...skipped(checkId, options.project.id, check.command, check.adapter, [
          selection.complete
            ? 'No file in this change is in scope for this check, so it was not run.'
            : 'No test file could be selected, and the selector could not establish the affected set. This is a gap in verification, not a passing check.',
          ...selection.limitations,
          ...mutationLimitation(selectionMutations),
        ]),
        selectionComplete: selection.complete,
        mutations: reportMutations(selectionMutations),
      });
      continue;
    }

    // Either the policy proposed this command, or the selection itself is wider
    // or less certain than the limits allow. One approval token covers the run.
    const needsApproval = selection.approval !== null || authorization.kind === 'needs-approval';
    if (needsApproval && !options.approvals.has(approvalKey)) {
      const reason =
        selection.approval?.reason ??
        (authorization.kind === 'needs-approval' ? authorization.reason : 'this run needs authorization');

      // Declined is an answer, so this is evidence rather than an open
      // question: the check did not run, a human said so, and nothing is
      // waiting on anybody.
      if (options.declines.has(approvalKey)) {
        results.push({
          ...skipped(checkId, options.project.id, check.command, check.adapter, [
            `Not run: ${reason}. A human was asked and declined this run, so it is a gap in verification that somebody chose.`,
            ...selection.limitations,
            ...mutationLimitation(selectionMutations),
          ]),
          selected: selection.files,
          selectionComplete: selection.complete,
          argv,
          cwd: commandCwd,
          mutations: reportMutations(selectionMutations),
        });
        continue;
      }

      pendingApprovals.push({
        checkId,
        approvalKey,
        projectId: options.project.id,
        reason,
        scope: selection.approval?.scope ?? `${selection.files.length} file(s)`,
        proposedArgv: argv,
        cwd: commandCwd,
      });
      results.push({
        ...skipped(checkId, options.project.id, check.command, check.adapter, [
          `Not run: ${reason}. AMBICODE waits for a human to authorize this specific run.`,
          ...selection.limitations,
          ...mutationLimitation(selectionMutations),
        ]),
        selected: selection.files,
        selectionComplete: selection.complete,
        argv,
        cwd: commandCwd,
        mutations: reportMutations(selectionMutations),
      });
      continue;
    }

    // A no-op when selection already took it.
    await watch.baseline();

    const started = options.clock.elapsed();
    const outcome = await options.runner.run({
      argv,
      cwd: commandCwd,
      timeoutMs: (command.timeoutSeconds ?? options.config.checks.timeoutSeconds) * 1000,
      maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES,
      // A configured project command runs as the developer would run it; it
      // needs their tooling environment (doc 05).
      env: { kind: 'inherited' },
    });
    const durationMs = Math.round(options.clock.elapsed() - started);

    const commandMutations = await watch.observe(`the "${check.command}" command`);
    const mutations = reportMutations(selectionMutations, commandMutations);

    // Deduplicated because the selector seeds the adapter's notes too, so a
    // vitest result carried each of its two limitations twice — the same
    // problem reading as two. Both sources stay: a check that never reached
    // selection still needs them.
    const limitations = [...new Set([...selection.limitations, ...(adapter.limitations ?? [])])];
    if (options.revisionNote !== null) limitations.push(options.revisionNote);
    limitations.push(...mutationLimitation(selectionMutations, commandMutations));
    if (outcome.truncated) limitations.push('The captured output was truncated at the configured limit.');

    if (outcome.kind === 'spawn-failed') {
      const missingBinary = /ENOENT/.test(outcome.failure ?? '');
      results.push({
        checkId,
        projectId: options.project.id,
        commandId: check.command,
        adapter: check.adapter,
        // A missing binary is a skipped check with a notice; anything else is an
        // error, because AMBICODE does not know what happened (doc 05).
        status: missingBinary ? 'skipped' : 'error',
        selected: selection.files,
        selectionComplete: selection.complete,
        argv,
        cwd: commandCwd,
        durationMs,
        exitCode: null,
        outputRef: null,
        limitations: [
          missingBinary
            ? `The configured executable "${argv[0] ?? ''}" was not found, so this check did not run.`
            : `The check could not be started: ${outcome.failure ?? 'unknown failure'}.`,
          ...limitations,
        ],
        mutations,
      });
      continue;
    }

    const outputRef = await captureOutput(
      options.fs,
      options.reviewDirectory,
      options.project.id,
      checkId,
      outcome.stdout,
      outcome.stderr,
    );

    // A kill is not automatically an absent result. When the runner had already
    // printed its own complete summary, that verdict is evidence the review
    // would otherwise discard — measured once as a real assertion failure
    // reported as unestablished coverage. The overrun is still reported, and
    // `exitCode` stays null because none was ever produced.
    const recovered =
      outcome.kind === 'timed-out'
        ? (adapter.parseCompletedRun?.(`${outcome.stdout}\n${outcome.stderr}`) ?? null)
        : null;
    if (recovered !== null) {
      limitations.push(
        `The command was killed at the ${Math.round((command.timeoutSeconds ?? options.config.checks.timeoutSeconds))}s checks.timeoutSeconds timeout, after ${durationMs}ms, but it had already reported a complete run: that reported result is what this check carries. Work after the last test — teardown, coverage, reporters — did not finish.`,
      );
    }

    results.push({
      checkId,
      projectId: options.project.id,
      commandId: check.command,
      adapter: check.adapter,
      status:
        recovered ?? (outcome.kind === 'timed-out' ? 'timed-out' : outcome.exitCode === 0 ? 'passed' : 'failed'),
      selected: selection.files,
      selectionComplete: selection.complete,
      argv,
      cwd: commandCwd,
      durationMs,
      exitCode: outcome.exitCode,
      outputRef,
      limitations,
      mutations,
    });
  }

  return { results, pendingApprovals };
}

/**
 * The mutations a result carries: the facts, then the one sentence that says
 * what AMBICODE did about them. Empty stays empty, so a clean run says nothing.
 */
function reportMutations(...groups: readonly (readonly string[])[]): string[] {
  const all = groups.flat();
  return all.length === 0 ? [] : [...all, MUTATION_DISCLAIMER];
}

/** The same fact stated where a reader judges the evidence, not the workspace. */
function mutationLimitation(...groups: readonly (readonly string[])[]): string[] {
  return groups.some((group) => group.length > 0)
    ? [
        'Something AMBICODE ran changed the working copy, so this result describes code that is no longer exactly what was reviewed.',
      ]
    : [];
}

function commandCwdFor(absoluteRoot: string, cwd: string | null): string {
  return path.join(absoluteRoot, cwd ?? '');
}

function skipped(
  checkId: string,
  projectId: string,
  commandId: string,
  adapter: string,
  limitations: string[],
): CheckResult {
  return {
    checkId,
    projectId,
    commandId,
    adapter,
    status: 'skipped',
    selected: [],
    selectionComplete: false,
    argv: [],
    cwd: null,
    durationMs: null,
    exitCode: null,
    outputRef: null,
    limitations,
    mutations: [],
  };
}

/** Output is filed under its project, so two projects' `lint` cannot overwrite each other. */
async function captureOutput(
  fs: FileSystem,
  reviewDirectory: string,
  projectId: string,
  checkId: string,
  stdout: string,
  stderr: string,
): Promise<string> {
  const safe = (value: string): string => value.replace(/[^A-Za-z0-9._-]/g, '_');
  const relative = `checks/${safe(projectId)}/${safe(checkId)}.txt`;
  const destination = path.join(reviewDirectory, relative);
  await fs.mkdirp(path.dirname(destination));
  await fs.writeText(destination, `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`);
  return relative;
}
