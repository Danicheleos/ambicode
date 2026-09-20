import path from 'node:path';
import { MAX_COMMAND_OUTPUT_BYTES } from '../config/defaults.ts';
import type { AmbicodeConfig, ProjectConfig } from '../contracts/config.ts';
import type { ResolvedPolicy } from '../contracts/policy.ts';
import type { CheckResult } from '../contracts/review.ts';
import type { Clock } from '../ports/clock.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import type { ProcessRunner } from '../ports/process.ts';
import { normalizeRelative } from '../util/paths.ts';
import { adapterFor } from './adapters.ts';
import { authorizeCommand, checkApprovalKey } from './authorize.ts';
import { expandFiles, selectLintFiles, selectTestFiles, type ChangedPath, type Selection } from './select.ts';
import { compareTrees, scanTree, summarizeMutations, type TreeEntry } from './workspace-diff.ts';

/**
 * Executable checks for a merge request. The code under review is somebody
 * else's, so it never runs in the developer's checkout — not as a fallback, not
 * "just the linter", not at all (doc 05, "Executable remote checks").
 *
 * When the isolated environment is not configured or not available, every check
 * is skipped with the exact reason. A skipped check is a gap in verification
 * and says so; it is never quietly turned into a local run.
 */

/** The container-local path the snapshot is copied into before anything runs. */
const WORKSPACE = '/ambicode/work';

/** Writable scratch for tools that insist on one, separate from the workspace. */
const SCRATCH = '/tmp';

/** An unprivileged uid/gid that exists nowhere as a real account. */
const NON_ROOT = '65534:65534';

const CONTAINER_CREATE_TIMEOUT_MS = 60_000;
const CONTAINER_ADMIN_TIMEOUT_MS = 60_000;

/** Digest pinning is the whole point: a tag can be moved under the review. */
const DIGEST_PINNED = /^[^\s@]+@sha256:[0-9a-f]{64}$/;

export interface RemoteChecksOptions {
  fs: FileSystem;
  config: AmbicodeConfig;
  runner: ProcessRunner;
  clock: Clock;
  /** Per project, the changed paths the merge request carries. */
  projects: readonly { project: ProjectConfig; policy: ResolvedPolicy; changed: ChangedPath[] }[];
  /** The read-only pinned snapshot; copied into the container, never mounted. */
  snapshotFilesDirectory: string;
  reviewDirectory: string;
  approvals: ReadonlySet<string>;
  /** Overridable so a test can drive a fake container CLI. */
  containerExecutable?: string;
  /** CPU, memory, process and wall-clock ceilings applied to every run. */
  limits?: Partial<ContainerLimits>;
}

export interface ContainerLimits {
  cpus: string;
  memory: string;
  pids: number;
  timeoutMs: number;
}

const DEFAULT_LIMITS: ContainerLimits = {
  cpus: '2',
  memory: '2g',
  pids: 512,
  timeoutMs: 300_000,
};

export interface RemoteChecksOutcome {
  results: CheckResult[];
  /** Facts about the isolation itself, carried into the review's omissions. */
  notes: string[];
}

export async function runRemoteChecks(options: RemoteChecksOptions): Promise<RemoteChecksOutcome> {
  const image = options.config.remoteChecks.image;
  const executable = options.containerExecutable ?? 'docker';
  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };

  const availability = await assessIsolation(options, image, executable);
  const results: CheckResult[] = [];
  const notes: string[] = [];

  if (availability.kind === 'unavailable') {
    notes.push(availability.reason, 'No merge request check was executed, and none was run locally instead.');
  } else {
    notes.push(
      `Executable checks ran inside ${image ?? ''}, as an unprivileged user with a read-only container root, no network, no host mounts and no credentials.`,
      'The container workspace is a disposable volume holding a copy of the pinned snapshot. Anything a command wrote there was compared against the copy, reported, and then destroyed with the container.',
    );
  }

  for (const entry of options.projects) {
    for (const checkId of Object.keys(entry.project.checks).sort()) {
      const result = await runOne({
        options,
        entry,
        checkId,
        availability,
        executable,
        limits,
        image,
      });
      results.push(result);
    }
  }

  return { results, notes };
}

type Isolation =
  | { kind: 'available'; image: string }
  | { kind: 'unavailable'; reason: string };

/**
 * Establishes whether the isolated environment exists before anything is run.
 * Nothing here pulls or builds an image or installs a dependency: an absent
 * image is a skip reason, not a task to perform (doc 05).
 */
async function assessIsolation(
  options: RemoteChecksOptions,
  image: string | null,
  executable: string,
): Promise<Isolation> {
  if (image === null) {
    return {
      kind: 'unavailable',
      reason:
        'Remote executable checks are disabled: `remoteChecks.image` is null in .ambicode/config.yaml. Configure a container image pinned by digest to enable them.',
    };
  }
  if (!DIGEST_PINNED.test(image)) {
    return {
      kind: 'unavailable',
      reason: `Remote executable checks are disabled: \`remoteChecks.image\` is not pinned by digest. AMBICODE accepts only "name@sha256:<digest>", because a tag can be moved between the review and the run.`,
    };
  }

  const probe = await options.runner.run({
    argv: [executable, 'image', 'inspect', '--format', '{{.Id}}', image],
    cwd: options.reviewDirectory,
    timeoutMs: CONTAINER_ADMIN_TIMEOUT_MS,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited' },
  });

  if (probe.kind === 'spawn-failed') {
    return {
      kind: 'unavailable',
      reason: `Remote executable checks were skipped: the container runtime "${executable}" could not be started (${probe.failure ?? 'unknown spawn failure'}).`,
    };
  }
  if (probe.kind === 'timed-out') {
    return {
      kind: 'unavailable',
      reason: `Remote executable checks were skipped: "${executable} image inspect" timed out.`,
    };
  }
  if (probe.exitCode !== 0) {
    return {
      kind: 'unavailable',
      reason: `Remote executable checks were skipped: the pinned image is not present locally. AMBICODE does not pull or build images; pull it deliberately, then run the review again.`,
    };
  }

  return { kind: 'available', image };
}

interface RunOneOptions {
  options: RemoteChecksOptions;
  entry: RemoteChecksOptions['projects'][number];
  checkId: string;
  availability: Isolation;
  executable: string;
  limits: ContainerLimits;
  image: string | null;
}

async function runOne(context: RunOneOptions): Promise<CheckResult> {
  const { options, entry, checkId } = context;
  const check = entry.project.checks[checkId];

  if (check === null || check === undefined) {
    return skipped(checkId, entry.project.id, '(none)', 'unconfigured', [
      'This check is set to null in the configuration, so it is intentionally unavailable.',
    ]);
  }

  const adapter = adapterFor(check.adapter);
  const command = entry.project.commands[check.command];
  if (command === undefined) {
    return skipped(checkId, entry.project.id, check.command, check.adapter, [
      `The check references command "${check.command}", which the project does not declare.`,
    ]);
  }

  const authorization = authorizeCommand({
    policy: entry.policy,
    commandId: check.command,
    approvalKey: checkApprovalKey(entry.project.id, checkId),
    approvals: options.approvals,
  });
  if (authorization.kind !== 'allowed') {
    return skipped(checkId, entry.project.id, check.command, check.adapter, [
      `Not run: ${authorization.reason}.`,
    ]);
  }
  if (command === null) {
    return skipped(checkId, entry.project.id, check.command, check.adapter, [
      `Command "${check.command}" is configured as null, so this check has nothing to run.`,
    ]);
  }

  const selection = await selectForRemote(context, check.adapter);
  if (selection.kind === 'refused') {
    return {
      ...skipped(checkId, entry.project.id, check.command, check.adapter, selection.limitations),
      selectionComplete: false,
    };
  }

  const files = selection.value.files;
  if (files.length === 0) {
    return {
      ...skipped(checkId, entry.project.id, check.command, check.adapter, [
        selection.value.complete
          ? 'No file in this merge request is in scope for this check, so it was not run.'
          : 'No file could be selected and the affected set could not be established. This is a gap in verification, not a passing check.',
        ...selection.value.limitations,
      ]),
      selectionComplete: selection.value.complete,
    };
  }

  const argv = expandFiles(command.argv, files.map((file) => file.path));

  if (context.availability.kind === 'unavailable') {
    return {
      ...skipped(checkId, entry.project.id, check.command, check.adapter, [
        context.availability.reason,
        'Merge request code is not executed in the developer checkout under any circumstances, so this check was skipped rather than run locally.',
        ...selection.value.limitations,
      ]),
      selected: files,
      selectionComplete: selection.value.complete,
      argv,
      cwd: null,
    };
  }

  return await executeInContainer(context, {
    checkId,
    check,
    commandArgv: argv,
    projectRoot: normalizeRelative(entry.project.root),
    timeoutMs: (command.timeoutSeconds ?? options.config.checks.timeoutSeconds) * 1000,
    selection: selection.value,
    adapterLimitations: adapter.limitations ?? [],
  });
}

type RemoteSelection =
  | { kind: 'ok'; value: Selection }
  | { kind: 'refused'; limitations: string[] };

/**
 * Selection for a merge request may not execute anything in the checkout, so
 * only the selectors that are pure computation are used: lint `include` globs
 * and the `mapping` selector. A `related` or `command` selector would run the
 * project's own runner or script against paths that are not checked out, which
 * is both wrong and exactly the execution this module exists to prevent.
 */
async function selectForRemote(context: RunOneOptions, adapterId: string): Promise<RemoteSelection> {
  const { options, entry, checkId } = context;
  const check = entry.project.checks[checkId];
  if (check === null || check === undefined) return { kind: 'refused', limitations: [] };

  const selectOptions = {
    fs: options.fs,
    project: entry.project,
    check,
    changed: entry.changed,
    // Selection reads globs only; nothing is executed from this directory.
    repositoryRoot: options.snapshotFilesDirectory,
    runner: options.runner,
    enumerationRevision: null,
    maxSelectedTestFiles: options.config.checks.maxSelectedTestFiles,
    timeoutMs: options.config.checks.timeoutSeconds * 1000,
    commandArgv: null,
    authorize: () => ({ kind: 'refused' as const, reason: 'selection may not execute merge request code' }),
  };

  if (adapterFor(adapterId as never).role === 'lint') {
    return { kind: 'ok', value: selectLintFiles(selectOptions) };
  }

  const selector = check.selector;
  if (selector !== undefined && selector.kind !== 'mapping') {
    return {
      kind: 'refused',
      limitations: [
        `The "${selector.kind}" selector decides which tests to run by executing project code, which AMBICODE will not do for merge request content.`,
        'Configure a `mapping` selector for this check to select merge request tests without running anything outside the isolated environment.',
      ],
    };
  }

  return { kind: 'ok', value: await selectTestFiles(selectOptions) };
}

interface ExecuteOptions {
  checkId: string;
  check: NonNullable<ProjectConfig['checks'][string]>;
  commandArgv: string[];
  projectRoot: string;
  timeoutMs: number;
  selection: Selection;
  adapterLimitations: readonly string[];
}

/**
 * Create, copy, start, inspect, discard.
 *
 * The container root is read-only and the one writable place is a disposable
 * volume mounted at the workspace: not a host bind mount, so there is no path
 * by which a command can reach the developer's files at all. The pinned
 * snapshot is copied into that volume during trusted setup, before the project
 * command exists as a process, and `docker cp` without `--archive` gives the
 * copied files to the configured non-root user rather than to a host uid.
 */
async function executeInContainer(
  context: RunOneOptions,
  execute: ExecuteOptions,
): Promise<CheckResult> {
  const { options, entry, executable, limits } = context;
  const image = context.availability.kind === 'available' ? context.availability.image : '';
  const workdir = execute.projectRoot === '' ? WORKSPACE : `${WORKSPACE}/${execute.projectRoot}`;

  const createArgv = [
    executable,
    'create',
    '--rm=false',
    // No network at all: a check may not reach a registry, a service, or the
    // merge request's own host from inside the sandbox.
    '--network',
    'none',
    '--user',
    NON_ROOT,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    // Nothing in the image may be rewritten, so a command cannot persist
    // anything outside the disposable workspace it is given.
    '--read-only',
    // An anonymous volume, not a bind mount: it exists only for this container
    // and is destroyed with it.
    '--mount',
    `type=volume,dst=${WORKSPACE}`,
    '--tmpfs',
    `${SCRATCH}:rw,noexec,nosuid,nodev,size=64m`,
    '--pids-limit',
    String(limits.pids),
    '--memory',
    limits.memory,
    '--cpus',
    limits.cpus,
    '--workdir',
    workdir,
    '--entrypoint',
    execute.commandArgv[0] ?? '',
    image,
    ...execute.commandArgv.slice(1),
  ];

  const created = await options.runner.run({
    argv: createArgv,
    cwd: options.reviewDirectory,
    timeoutMs: CONTAINER_CREATE_TIMEOUT_MS,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited' },
  });

  if (created.kind !== 'exited' || created.exitCode !== 0) {
    return {
      ...skipped(execute.checkId, entry.project.id, execute.check.command, execute.check.adapter, [
        `The isolated container could not be created (${created.kind}, exit ${String(created.exitCode)}): ${firstLine(created.stderr) || 'no diagnostic'}.`,
        'Nothing was run locally instead.',
        ...execute.selection.limitations,
      ]),
      selected: execute.selection.files,
      selectionComplete: execute.selection.complete,
      argv: execute.commandArgv,
    };
  }

  const containerId = created.stdout.trim();
  const started = options.clock.elapsed();
  let inspectionDirectory: string | null = null;
  // Held by reference so the `finally` block can add a cleanup failure to the
  // result that is already on its way out, instead of replacing it.
  let produced: CheckResult | null = null;

  try {
    const copied = await options.runner.run({
      // The trailing `/.` copies the directory's contents, not the directory.
      // `--archive` is deliberately not passed: without it the copied files are
      // owned by the container's configured user rather than by a host uid.
      argv: [executable, 'cp', `${options.snapshotFilesDirectory}/.`, `${containerId}:${WORKSPACE}`],
      cwd: options.reviewDirectory,
      timeoutMs: CONTAINER_ADMIN_TIMEOUT_MS,
      maxOutputBytes: 65_536,
      env: { kind: 'inherited' },
    });
    if (copied.kind !== 'exited' || copied.exitCode !== 0) {
      produced = {
        ...skipped(execute.checkId, entry.project.id, execute.check.command, execute.check.adapter, [
          `The pinned snapshot could not be copied into the container (${copied.kind}): ${firstLine(copied.stderr) || 'no diagnostic'}.`,
          'Nothing was run locally instead.',
        ]),
        selected: execute.selection.files,
        selectionComplete: execute.selection.complete,
        argv: execute.commandArgv,
      };
      return produced;
    }

    // The baseline is taken after setup and before the project command, from
    // the exact bytes setup copied in. The copy is therefore never a mutation.
    const baseline = await scanTree(options.fs, options.snapshotFilesDirectory);

    const run = await options.runner.run({
      argv: [executable, 'start', '--attach', containerId],
      cwd: options.reviewDirectory,
      timeoutMs: Math.min(execute.timeoutMs, limits.timeoutMs),
      maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES,
      env: { kind: 'inherited' },
    });
    const durationMs = Math.round(options.clock.elapsed() - started);

    inspectionDirectory = await options.fs.temporaryDirectory('ambicode-workspace-');
    const observation = await observeMutations({
      options,
      executable,
      containerId,
      baseline,
      inspectionDirectory,
    });

    const limitations = [
      ...execute.selection.limitations,
      ...execute.adapterLimitations,
      'This check ran in the isolated container, not in your checkout, so its evidence describes the merge request revision and nothing local.',
      ...(run.truncated ? ['The captured output was truncated at the configured limit.'] : []),
      ...(observation.kind === 'unavailable'
        ? [
            `Whether the command changed its workspace could not be established (${observation.reason}). Treat this as unknown, not as "nothing was changed".`,
          ]
        : observation.mutations.length === 0
          ? []
          : [
              'The command changed files inside the disposable container workspace. Those writes were discarded and are not part of the reviewed revision.',
            ]),
    ];

    const outputRef = await captureOutput(
      options.fs,
      options.reviewDirectory,
      entry.project.id,
      execute.checkId,
      run.stdout,
      run.stderr,
    );

    produced = {
      checkId: execute.checkId,
      projectId: entry.project.id,
      commandId: execute.check.command,
      adapter: execute.check.adapter,
      status: run.kind === 'timed-out' ? 'timed-out' : run.kind === 'spawn-failed' ? 'error' : run.exitCode === 0 ? 'passed' : 'failed',
      selected: execute.selection.files,
      selectionComplete: execute.selection.complete,
      argv: execute.commandArgv,
      cwd: workdir,
      durationMs,
      exitCode: run.exitCode,
      outputRef,
      limitations,
      mutations: observation.kind === 'ok' ? observation.mutations : [],
    };
    return produced;
  } finally {
    // Disposable means disposed, including after a timeout. `--volumes` takes
    // the anonymous workspace volume with the container.
    const removed = await options.runner.run({
      argv: [executable, 'rm', '--force', '--volumes', containerId],
      cwd: options.reviewDirectory,
      timeoutMs: CONTAINER_ADMIN_TIMEOUT_MS,
      maxOutputBytes: 65_536,
      env: { kind: 'inherited' },
    });
    // A cleanup failure is added to the limitations rather than replacing the
    // check's own outcome: the check still ran and its result still stands.
    const note = (line: string): void => {
      if (produced === null) return;
      produced.limitations = [...produced.limitations, line];
    };
    if (removed.kind !== 'exited' || removed.exitCode !== 0) {
      note(
        `The isolated container ${containerId.slice(0, 12)} could not be removed (${removed.kind}): ${firstLine(removed.stderr) || 'no diagnostic'}. Remove it manually.`,
      );
    }
    if (inspectionDirectory !== null) {
      // Only AMBICODE's own temporary inspection copy is deleted here.
      try {
        await options.fs.remove(inspectionDirectory);
      } catch (error) {
        note(
          `The temporary workspace inspection copy could not be deleted: ${error instanceof Error ? error.message : String(error)}.`,
        );
      }
    }
  }
}

interface ObserveOptions {
  options: RemoteChecksOptions;
  executable: string;
  containerId: string;
  baseline: Awaited<ReturnType<typeof scanTree>>;
  inspectionDirectory: string;
}

type MutationObservation =
  | { kind: 'ok'; mutations: string[] }
  | { kind: 'unavailable'; reason: string };

/**
 * What the command wrote inside its disposable workspace, compared against the
 * baseline by content, type, path and executable bit. Nothing is fed back: the
 * container and its volume are destroyed immediately afterwards.
 *
 * A failure to establish either side is reported as unavailable. Claiming "no
 * mutation" because the inspection failed would be the one answer the evidence
 * does not support.
 */
async function observeMutations(observe: ObserveOptions): Promise<MutationObservation> {
  if (observe.baseline.kind !== 'ok') {
    return { kind: 'unavailable', reason: `the workspace baseline could not be read: ${observe.baseline.reason}` };
  }

  const copied = await observe.options.runner.run({
    argv: [
      observe.executable,
      'cp',
      `${observe.containerId}:${WORKSPACE}/.`,
      observe.inspectionDirectory,
    ],
    cwd: observe.options.reviewDirectory,
    timeoutMs: CONTAINER_ADMIN_TIMEOUT_MS,
    maxOutputBytes: 65_536,
    env: { kind: 'inherited' },
  });
  if (copied.kind !== 'exited' || copied.exitCode !== 0) {
    return {
      kind: 'unavailable',
      reason: `the workspace could not be copied out for inspection (${copied.kind}: ${firstLine(copied.stderr) || 'no diagnostic'})`,
    };
  }

  const after = await scanTree(observe.options.fs, observe.inspectionDirectory);
  if (after.kind !== 'ok') {
    return { kind: 'unavailable', reason: `the workspace could not be inspected after the run: ${after.reason}` };
  }

  const mutations = compareTrees(
    observe.baseline.entries as ReadonlyMap<string, TreeEntry>,
    after.entries,
  );
  return {
    kind: 'ok',
    mutations: summarizeMutations(mutations).map(
      (line) => `${line} (inside the disposable container workspace)`,
    ),
  };
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

function firstLine(value: string): string {
  return value.split('\n').find((line) => line.trim() !== '')?.trim() ?? '';
}
