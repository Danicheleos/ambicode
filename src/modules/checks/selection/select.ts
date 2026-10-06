import path from 'node:path';
import type { CheckSpec, ProjectConfig } from '#types/config';
import { matchesAnyGlob } from '#util/glob';
import { normalizeRelative, toProjectRelative } from '#util/paths';
import { adapterFor, enumerationExecutable } from './adapters.ts';
import type { ChangedPath } from '#modules/types/checks';
import type { DiffFile } from '#types/git';
import type { FileSystem, ProcessRunner } from '#types/ports';
import type { CommandAuthorization, Selection, SelectedFile } from '../types/selection.ts';

export interface SelectOptions {
  fs: FileSystem;
  project: ProjectConfig;
  check: CheckSpec;
  changed: readonly ChangedPath[];
  repositoryRoot: string;
  runner: ProcessRunner;
  enumerationRevision: string | null;
  maxSelectedTestFiles: number;
  timeoutMs: number;
  commandArgv: readonly string[] | null;
  /**
   * Required rather than optional, so a call site cannot execute a project script without a
   * command-policy decision.
   */
  authorize: (commandId: string) => CommandAuthorization;
}

/** A deleted file is dropped from the argument vector but its deletion stays in the review evidence. */
export function selectLintFiles(options: SelectOptions): Selection {
  const projectRoot = normalizeRelative(options.project.root);
  const include = options.check.include ?? [];
  const files: SelectedFile[] = [];
  const limitations: string[] = [];
  const deleted: string[] = [];

  for (const change of options.changed) {
    if (change.newPath === null) {
      deleted.push(change.oldPath ?? 'a deleted file');
      continue;
    }
    const relative = toProjectRelative(projectRoot, change.newPath);
    if (relative === null) continue;
    if (include.length > 0 && !matchesAnyGlob(relative, include)) continue;
    files.push({ path: relative, reason: `changed in this review (${change.changeKind})` });
  }

  limitations.push(...describeDeleted(deleted));
  return { files: dedupe(files), complete: true, limitations, approval: null };
}

/** A 57-file change that deletes 40 files printed 40 identical lines per check and buried the result. */
const LISTED_DELETIONS = 3;

function describeDeleted(paths: readonly string[]): string[] {
  if (paths.length <= LISTED_DELETIONS) return paths.map((entry) => `${entry} was deleted, so it was not checked.`);
  return [
    `${paths.length} files were deleted, so they were not checked: ${paths.slice(0, LISTED_DELETIONS).join(', ')} and ${paths.length - LISTED_DELETIONS} more.`,
  ];
}

export async function selectTestFiles(options: SelectOptions): Promise<Selection> {
  const selector = options.check.selector;
  if (selector === undefined) {
    return {
      files: [],
      complete: false,
      limitations: ['This check has no selector, so AMBICODE cannot decide which tests it would run.'],
      approval: null,
    };
  }

  const base =
    selector.kind === 'mapping'
      ? await selectByMapping(options, selector)
      : selector.kind === 'related'
        ? await selectByRunner(options)
        : await selectByCommand(options, selector.command);

  return applyLimits(base, {
    maxFiles: selector.maxFiles ?? options.maxSelectedTestFiles,
    projectRoot: normalizeRelative(options.project.root),
  });
}

function applyLimits(
  selection: Selection,
  context: { maxFiles: number; projectRoot: string },
): Selection {
  const limitations = [...selection.limitations];
  const reasons: string[] = [];

  if (!selection.complete) {
    reasons.push('the selector could not establish the full set of affected tests');
  }
  if (selection.files.length > context.maxFiles) {
    reasons.push(
      `the selection holds ${selection.files.length} test files, above the configured limit of ${context.maxFiles}`,
    );
  }
  const outside = selection.files.filter((file) => file.path.startsWith('../'));
  if (outside.length > 0) {
    reasons.push('the selection reaches outside the project that owns this check');
  }

  if (reasons.length === 0) return { ...selection, limitations, approval: null };

  return {
    ...selection,
    limitations,
    approval: {
      reason: reasons.join('; '),
      scope:
        selection.files.length === 0
          ? 'no test files were identified'
          : `${selection.files.length} test file(s): ${selection.files
              .slice(0, 10)
              .map((file) => file.path)
              .join(', ')}${selection.files.length > 10 ? ', …' : ''}`,
    },
  };
}

async function selectByMapping(
  options: SelectOptions,
  selector: { mappings: readonly { source: readonly string[]; tests: readonly string[] }[] },
): Promise<Selection> {
  const projectRoot = normalizeRelative(options.project.root);
  const absoluteRoot = path.join(options.repositoryRoot, projectRoot);
  const files: SelectedFile[] = [];
  const limitations: string[] = [];
  let complete = true;

  const allTestGlobs = selector.mappings.flatMap((mapping) => [...mapping.tests]);

  for (const change of options.changed) {
    // Deleted and renamed paths participate under both names: the tests that
    // covered the old path are exactly the ones a deletion can break.
    const candidates = [change.newPath, change.oldPath]
      .filter((value): value is string => value !== null)
      .map((value) => toProjectRelative(projectRoot, value))
      .filter((value): value is string => value !== null);
    if (candidates.length === 0) continue;

    let matched = false;
    for (const candidate of candidates) {
      if (matchesAnyGlob(candidate, allTestGlobs)) {
        files.push({ path: candidate, reason: 'this test file changed in the review' });
        matched = true;
      }
    }

    for (const mapping of selector.mappings) {
      const source = candidates.find((candidate) => matchesAnyGlob(candidate, [...mapping.source]));
      if (source === undefined) continue;
      matched = true;
      const expanded = await expandGlobs(options.fs, absoluteRoot, mapping.tests);
      if (expanded.length === 0) {
        complete = false;
        limitations.push(
          `${source} matched a mapping whose test globs (${mapping.tests.join(', ')}) match no existing file.`,
        );
        continue;
      }
      for (const testPath of expanded) {
        files.push({ path: testPath, reason: `mapped from changed source ${source}` });
      }
    }

    if (!matched) {
      complete = false;
      limitations.push(
        `${candidates[0] ?? 'a changed file'} matches no configured mapping, so its affected tests are unknown.`,
      );
    }
  }

  return { files: dedupe(files), complete, limitations, approval: null };
}

async function selectByRunner(options: SelectOptions): Promise<Selection> {
  const adapter = adapterFor(options.check.adapter);
  const projectRoot = normalizeRelative(options.project.root);
  const absoluteRoot = path.join(options.repositoryRoot, projectRoot);
  const limitations = [...(adapter.limitations ?? [])];

  if (options.commandArgv === null) {
    return {
      files: [],
      complete: false,
      limitations: ['The command this check references is not configured, so nothing can be enumerated.'],
      approval: null,
    };
  }

  const executable = enumerationExecutable(adapter, options.commandArgv);
  if (executable === null || adapter.enumeration.kind === 'none' || adapter.parseEnumeration === undefined) {
    return {
      files: [],
      complete: false,
      limitations: [
        ...limitations,
        executable === null
          ? `The configured command does not invoke ${adapter.id} directly, so AMBICODE cannot ask it which tests are affected. Configure a mapping selector instead.`
          : `${adapter.id} offers no way to enumerate affected tests before running them on the installed version.`,
      ],
      approval: null,
    };
  }

  const sourcePaths = options.changed
    .map((change) => change.newPath)
    .filter((value): value is string => value !== null)
    .map((value) => toProjectRelative(projectRoot, value))
    .filter((value): value is string => value !== null);

  let argv: string[];
  let partial = false;

  if (adapter.enumeration.kind === 'from-files') {
    // A file-based enumerator answers from the files that exist now. On jest
    // 30.5.2 a deleted path, or a rename's destination, exits 0 printing
    // nothing, so a vanished name yields an uncertain selection, not an empty one.
    const vanished = options.changed
      .map(vanishedPath)
      .filter((value): value is string => value !== null)
      .map((value) => toProjectRelative(projectRoot, value))
      .filter((value): value is string => value !== null);

    if (vanished.length > 0) {
      partial = true;
      limitations.push(
        `${vanished.join(', ')} no longer exists under that name, and ${adapter.id} can only find tests related to files that still exist. Tests that referenced the old name may be missing from this selection.`,
      );
    }

    if (sourcePaths.length === 0) {
      return { files: [], complete: !partial, limitations, approval: null };
    }
    argv = adapter.enumeration.argv(executable, sourcePaths);
  } else {
    if (options.enumerationRevision === null) {
      return {
        files: [],
        complete: false,
        limitations: [...limitations, `${adapter.id} needs a revision to compare against, and none was available.`],
        approval: null,
      };
    }
    argv = adapter.enumeration.argv(executable, options.enumerationRevision);
  }

  const outcome = await options.runner.run({
    argv,
    cwd: absoluteRoot,
    timeoutMs: options.timeoutMs,
    maxOutputBytes: 1_048_576,
    env: { kind: 'inherited' },
  });

  if (outcome.kind !== 'exited' || outcome.exitCode !== 0) {
    return {
      files: [],
      complete: false,
      limitations: [
        ...limitations,
        `Enumerating affected tests with ${adapter.id} failed (${outcome.kind}, exit ${String(outcome.exitCode)}), so the affected set is unknown.`,
      ],
      approval: null,
    };
  }

  const enumerated = adapter.parseEnumeration(outcome.stdout, absoluteRoot);
  const files = enumerated.map((value) => ({
    path: value,
    reason: `${adapter.id} reported this test as affected by the change`,
  }));

  return { files: dedupe(files), complete: !partial, limitations, approval: null };
}

function vanishedPath(change: ChangedPath): string | null {
  if (change.oldPath === null) return null;
  if (change.newPath === null) return change.oldPath;
  return change.oldPath === change.newPath ? null : change.oldPath;
}

async function selectByCommand(options: SelectOptions, commandId: string): Promise<Selection> {
  // Before the command is resolved: a forbidden selector must not run.
  const authorization = options.authorize(commandId);
  if (authorization.kind !== 'allowed') {
    return {
      files: [],
      complete: false,
      limitations: [
        `The selector command "${commandId}" was not run: ${authorization.reason}`,
        'Without it the affected tests are unknown, so this is a gap in verification rather than an empty selection.',
      ],
      approval: null,
    };
  }

  const projectRoot = normalizeRelative(options.project.root);
  const absoluteRoot = path.join(options.repositoryRoot, projectRoot);
  const command = options.project.commands[commandId];

  if (command === undefined || command === null) {
    return {
      files: [],
      complete: false,
      limitations: [`The selector command "${commandId}" is not configured, so no tests could be selected.`],
      approval: null,
    };
  }

  const changedPaths = changedProjectPaths(projectRoot, options.changed);

  const outcome = await options.runner.run({
    argv: expandFiles(command.argv, changedPaths),
    cwd: path.join(absoluteRoot, command.cwd ?? ''),
    timeoutMs: options.timeoutMs,
    maxOutputBytes: 262_144,
    env: { kind: 'inherited' },
  });

  if (outcome.kind !== 'exited' || outcome.exitCode !== 0) {
    return {
      files: [],
      complete: false,
      limitations: [`The selector command "${commandId}" did not succeed, so the affected set is unknown.`],
      approval: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.stdout);
  } catch {
    return {
      files: [],
      complete: false,
      limitations: [`The selector command "${commandId}" did not print a JSON array of test paths.`],
      approval: null,
    };
  }
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
    return {
      files: [],
      complete: false,
      limitations: [`The selector command "${commandId}" printed JSON that is not an array of strings.`],
      approval: null,
    };
  }

  const files: SelectedFile[] = [];
  const limitations: string[] = [];
  for (const entry of parsed as string[]) {
    const normalized = normalizeRelative(entry);
    if (normalized.startsWith('..') || path.isAbsolute(entry)) {
      limitations.push(`The selector command returned "${entry}", which is outside the project; it was dropped.`);
      continue;
    }
    files.push({ path: normalized, reason: `selected by the project's "${commandId}" script` });
  }

  return { files: dedupe(files), complete: limitations.length === 0, limitations, approval: null };
}

export function selectorCommandPlan(options: {
  project: ProjectConfig;
  repositoryRoot: string;
  changed: readonly ChangedPath[];
  commandId: string;
}): { argv: string[]; cwd: string } | null {
  const command = options.project.commands[options.commandId];
  if (command === undefined || command === null) return null;
  const projectRoot = normalizeRelative(options.project.root);
  const absoluteRoot = path.join(options.repositoryRoot, projectRoot);
  return {
    argv: expandFiles(command.argv, changedProjectPaths(projectRoot, options.changed)),
    cwd: path.join(absoluteRoot, command.cwd ?? ''),
  };
}

function changedProjectPaths(projectRoot: string, changed: readonly ChangedPath[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const change of changed) {
    for (const candidate of [change.newPath, change.oldPath]) {
      if (candidate === null) continue;
      const relative = toProjectRelative(projectRoot, candidate);
      if (relative === null || seen.has(relative)) continue;
      seen.add(relative);
      paths.push(relative);
    }
  }
  return paths;
}

/**
 * Whether deciding this check's selection starts a process. Lint and mapping
 * selection run nothing, so bracketing them would only cost a `git status`.
 */
export function selectionRunsCommand(check: CheckSpec): boolean {
  return check.selector?.kind === 'command' || check.selector?.kind === 'related';
}

export function expandFiles(argv: readonly string[], files: readonly string[]): string[] {
  const expanded: string[] = [];
  for (const argument of argv) {
    if (argument === '{files}') expanded.push(...files);
    else expanded.push(argument);
  }
  return expanded;
}

async function expandGlobs(
  fs: FileSystem,
  absoluteRoot: string,
  globs: readonly string[],
): Promise<string[]> {
  const found = new Set<string>();
  for (const pattern of globs) {
    try {
      for (const entry of await fs.glob(pattern, absoluteRoot)) found.add(entry);
    } catch {
      // An unusable pattern expands to nothing, which the caller reports.
    }
  }
  return [...found].sort();
}

function dedupe(files: readonly SelectedFile[]): SelectedFile[] {
  const byPath = new Map<string, SelectedFile>();
  for (const file of files) {
    const existing = byPath.get(file.path);
    if (existing === undefined) byPath.set(file.path, file);
    else if (!existing.reason.includes(file.reason)) existing.reason = `${existing.reason}; ${file.reason}`;
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
