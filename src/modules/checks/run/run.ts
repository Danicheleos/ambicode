import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '#types/modules/config';
import type { ResolvedPolicy } from '#types/modules/policy';
import type { CheckResult } from '#types/modules/review';
import { MAX_COMMAND_OUTPUT_BYTES } from '#types/defaults';
import type { Git } from '#platform/git/git';
import { normalizeRelative } from '#util/paths';
import { adapterFor } from '../selection/adapters.ts';
import { authorizeCommand, checkApprovalKey } from '../selection/authorize.ts';
import { watchWorkspace } from '../workspace/mutations.ts';
import { expandFiles, selectLintFiles, selectTestFiles } from '../selection/select.ts';
import type { ChangedPath, PendingApproval } from '#types/modules/checks';
import type { Clock, FileSystem, ProcessRunner } from '#types/platform/ports';
import type { Selection } from '../types/selection.ts';
import { MUTATION_DISCLAIMER } from '../types/workspace.ts';

export interface RunChecksOptions {
  fs: FileSystem;
  config: AmbicodeConfig;
  project: ProjectConfig;
  policy: ResolvedPolicy;
  changed: readonly ChangedPath[];
  repositoryRoot: string;
  runner: ProcessRunner;
  clock: Clock;
  approvals: ReadonlySet<string>;
  reviewDirectory: string;
  enumerationRevision: string | null;
  git: Git;
  watchedPaths: readonly string[];
  /**
   * How the checkout differs from the reviewed revision, if it does. Attached to every result
   * that ran, because that evidence describes something other than what was reviewed.
   */
  revisionNote: string | null;
  /**
   * Approval keys a human answered "no" to. Skipped like unauthorized checks, but no longer
   * waiting, so a caller that gates on pending approvals can proceed.
   */
  declines: ReadonlySet<string>;
  /** Runs that one check on exactly these files; no selector or enumeration runs. */
  only?: { checkId: string; files: readonly string[] };
}

interface RunChecksOutcome {
  results: CheckResult[];
  pendingApprovals: PendingApproval[];
}

export async function runChecks(options: RunChecksOptions): Promise<RunChecksOutcome> {
  const results: CheckResult[] = [];
  const pendingApprovals: PendingApproval[] = [];
  const watch = watchWorkspace({
    fs: options.fs,
    git: options.git,
    repositoryRoot: options.repositoryRoot,
    paths: options.watchedPaths,
  });
  const projectRoot = normalizeRelative(options.project.root);
  const absoluteRoot = path.join(options.repositoryRoot, projectRoot);

  const checkIds = options.only === undefined
    ? Object.keys(options.project.checks).sort()
    : Object.keys(options.project.checks).filter((id) => id === options.only?.checkId);
  for (const checkId of checkIds) {
    const check = options.project.checks[checkId];
    const approvalKey = checkApprovalKey(options.project.id, checkId);

    if (check === null || check === undefined) {
      results.push(skipped(checkId, options.project.id, '(none)', 'unconfigured', ['This check is set to null in the configuration, so it is intentionally unavailable.']));
      continue;
    }

    const adapter = adapterFor(check.adapter);
    const command = options.project.commands[check.command];
    if (command === undefined) {
      results.push(skipped(checkId, options.project.id, check.command, check.adapter, [`The check references command "${check.command}", which the project does not declare.`]));
      continue;
    }

    const authorization = authorizeCommand({
      policy: options.policy,
      commandId: check.command,
      approvalKey,
      approvals: options.approvals,
    });
    if (authorization.kind === 'refused') {
      results.push(skipped(checkId, options.project.id, check.command, check.adapter, [authorization.reason]));
      continue;
    }

    if (command === null) {
      results.push(skipped(checkId, options.project.id, check.command, check.adapter, [`Command "${check.command}" is configured as null, so this check has nothing to run. Set its argv to enable it.`]));
      continue;
    }

    const selectOptions = {
      fs: options.fs,
      project: options.project,
      check,
      changed: options.changed,
      repositoryRoot: options.repositoryRoot,
      maxSelectedTestFiles: options.config.checks.maxSelectedTestFiles,
    };

    const selection: Selection =
      options.only !== undefined
        ? forcedSelection(options.only.files)
        : adapter.role === 'lint'
          ? selectLintFiles(selectOptions)
          : await selectTestFiles(selectOptions);

    const commandCwd = commandCwdFor(absoluteRoot, command.cwd ?? null);
    const argv = expandFiles(command.argv, selection.files.map((file) => file.path));

    if (selection.files.length === 0) {
      // An empty selection never becomes a whole-suite command.
      results.push({
        ...skipped(checkId, options.project.id, check.command, check.adapter, [
          selection.complete
            ? 'No file in this change is in scope for this check, so it was not run.'
            : 'No test file could be selected, and the selector could not establish the affected set. This is a gap in verification, not a passing check.',
          ...selection.limitations,
        ]),
        selectionComplete: selection.complete,
      });
      continue;
    }

    const needsApproval = selection.approval !== null || authorization.kind === 'needs-approval';
    if (needsApproval && !options.approvals.has(approvalKey)) {
      const reason =
        selection.approval?.reason ??
        (authorization.kind === 'needs-approval' ? authorization.reason : 'this run needs authorization');

      const declined = options.declines.has(approvalKey);
      if (!declined) {
        pendingApprovals.push({
          checkId,
          approvalKey,
          projectId: options.project.id,
          reason,
          scope: selection.approval?.scope ?? `${selection.files.length} file(s)`,
          proposedArgv: argv,
          cwd: commandCwd,
        });
      }
      results.push({
        ...skipped(checkId, options.project.id, check.command, check.adapter, [
          declined
            ? `Not run: ${reason}. A human was asked and declined this run, so it is a gap in verification that somebody chose.`
            : `Not run: ${reason}. AMBICODE waits for a human to authorize this specific run.`,
          ...selection.limitations,
        ]),
        selected: selection.files,
        selectionComplete: selection.complete,
        argv,
        cwd: commandCwd,
      });
      continue;
    }

    await watch.baseline();

    const started = options.clock.elapsed();
    const outcome = await options.runner.run({
      argv,
      cwd: commandCwd,
      timeoutMs: (command.timeoutSeconds ?? options.config.checks.timeoutSeconds) * 1000,
      maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES,
      env: { kind: 'inherited' },
    });
    const durationMs = Math.round(options.clock.elapsed() - started);

    const commandMutations = await watch.observe(`the "${check.command}" command`);
    const mutations = reportMutations(commandMutations);

    const limitations = [...new Set([...selection.limitations, ...(adapter.limitations ?? [])])];
    if (options.revisionNote !== null) limitations.push(options.revisionNote);
    limitations.push(...mutationLimitation(commandMutations));
    if (outcome.truncated) limitations.push('The captured output was truncated at the configured limit.');

    const ran: CheckResult = {
      ...skipped(checkId, options.project.id, check.command, check.adapter, limitations),
      selected: selection.files,
      selectionComplete: selection.complete,
      argv,
      cwd: commandCwd,
      durationMs,
      mutations,
    };

    if (outcome.kind === 'spawn-failed') {
      const missingBinary = /ENOENT/.test(outcome.failure ?? '');
      results.push({
        ...ran,
        status: missingBinary ? 'skipped' : 'error',
        limitations: [
          missingBinary
            ? `The configured executable "${argv[0] ?? ''}" was not found, so this check did not run.`
            : `The check could not be started: ${outcome.failure ?? 'unknown failure'}.`,
          ...limitations,
        ],
      });
      continue;
    }

    const outputRef = await captureOutput(options.fs, options.reviewDirectory, options.project.id, checkId, outcome.stdout, outcome.stderr);

    // A kill is not automatically an absent result: a complete summary the runner already printed
    // is kept as the verdict. The overrun is still reported and `exitCode` stays null.
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
      ...ran,
      status: recovered ?? (outcome.kind === 'timed-out' ? 'timed-out' : outcome.exitCode === 0 ? 'passed' : 'failed'),
      exitCode: outcome.exitCode,
      outputRef,
    });
  }

  return { results, pendingApprovals };
}

function forcedSelection(files: readonly string[]): Selection {
  return {
    files: files.map((file) => ({ path: normalizeRelative(file), reason: 'named with --only' })),
    complete: true,
    limitations: [],
    approval: null,
  };
}

function reportMutations(...groups: readonly (readonly string[])[]): string[] {
  const all = groups.flat();
  return all.length === 0 ? [] : [...all, MUTATION_DISCLAIMER];
}

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
