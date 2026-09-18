import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '../contracts/config.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import type { CheckResult } from '../contracts/review.ts';
import { MAX_COMMAND_OUTPUT_BYTES } from '../config/defaults.ts';
import { decisionFor, explainRefusal } from '../policy/resolve.ts';
import type { Clock } from '../ports/clock.ts';
import type { ProcessRunner } from '../ports/process.ts';
import { normalizeRelative } from '../util/paths.ts';
import { adapterFor } from './adapters.ts';
import { expandFiles, selectLintFiles, selectTestFiles, type ChangedPath, type Selection } from './select.ts';

export interface RunChecksOptions {
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
}

export interface PendingApproval {
  checkId: string;
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
  const projectRoot = normalizeRelative(options.project.root);
  const absoluteRoot = path.join(options.repositoryRoot, projectRoot);

  for (const checkId of Object.keys(options.project.checks).sort()) {
    const check = options.project.checks[checkId];

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

    const decision = decisionFor(options.policy, check.command);
    if (decision.action === 'forbid' || decision.action === 'undeclared') {
      results.push(
        skipped(checkId, options.project.id, check.command, check.adapter, [
          explainRefusal(options.policy, check.command),
        ]),
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

    const selectOptions = {
      project: options.project,
      check,
      changed: options.changed,
      repositoryRoot: options.repositoryRoot,
      runner: options.runner,
      enumerationRevision: options.enumerationRevision,
      maxSelectedTestFiles: options.config.checks.maxSelectedTestFiles,
      timeoutMs: (command.timeoutSeconds ?? options.config.checks.timeoutSeconds) * 1000,
      commandArgv: command.argv,
    };

    const selection: Selection =
      adapter.role === 'lint' ? selectLintFiles(selectOptions) : await selectTestFiles(selectOptions);

    const commandCwd = path.join(absoluteRoot, command.cwd ?? '');
    const argv = expandFiles(command.argv, selection.files.map((file) => file.path));

    if (selection.files.length === 0) {
      // An empty selection never becomes a whole-suite command (doc 05).
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

    const needsApproval = selection.approval !== null || decision.action === 'propose';
    if (needsApproval && !options.approvals.has(checkId)) {
      const reason =
        selection.approval?.reason ??
        `policy declares "${check.command}" as propose, so each run is authorized separately`;
      pendingApprovals.push({
        checkId,
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
        ]),
        selected: selection.files,
        selectionComplete: selection.complete,
        argv,
        cwd: commandCwd,
      });
      continue;
    }

    const started = options.clock.elapsed();
    const outcome = await options.runner.run({
      argv,
      cwd: commandCwd,
      timeoutMs: (command.timeoutSeconds ?? options.config.checks.timeoutSeconds) * 1000,
      maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES,
    });
    const durationMs = Math.round(options.clock.elapsed() - started);

    const limitations = [...selection.limitations, ...(adapter.limitations ?? [])];
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
      });
      continue;
    }

    const outputRef = await captureOutput(options.reviewDirectory, checkId, outcome.stdout, outcome.stderr);

    results.push({
      checkId,
      projectId: options.project.id,
      commandId: check.command,
      adapter: check.adapter,
      status: outcome.kind === 'timed-out' ? 'timed-out' : outcome.exitCode === 0 ? 'passed' : 'failed',
      selected: selection.files,
      selectionComplete: selection.complete,
      argv,
      cwd: commandCwd,
      durationMs,
      exitCode: outcome.exitCode,
      outputRef,
      limitations,
    });
  }

  return { results, pendingApprovals };
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
  };
}

async function captureOutput(
  reviewDirectory: string,
  checkId: string,
  stdout: string,
  stderr: string,
): Promise<string> {
  const directory = path.join(reviewDirectory, 'checks');
  await mkdir(directory, { recursive: true });
  const fileName = `${checkId.replace(/[^A-Za-z0-9._-]/g, '_')}.txt`;
  const body = `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`;
  await writeFile(path.join(directory, fileName), body, 'utf8');
  return `checks/${fileName}`;
}
