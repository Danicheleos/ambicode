import path from 'node:path';
import type { CheckSpec, ProjectConfig } from '#types/modules/config';
import { matchesAnyGlob } from '#util/glob';
import { normalizeRelative, toProjectRelative } from '#util/paths';
import type { ChangedPath } from '#types/modules/checks';
import type { FileSystem } from '#types/platform/ports';
import type { Selection, SelectedFile } from '../types/selection.ts';

interface SelectOptions {
  fs: FileSystem;
  project: ProjectConfig;
  check: CheckSpec;
  changed: readonly ChangedPath[];
  repositoryRoot: string;
  maxSelectedTestFiles: number;
}

/** The adapter id only decides how files are chosen: lint checks take the changed files, the rest go through the mapping. */
export const isLintAdapter = (adapter: string): boolean => !['jest', 'vitest', 'pytest', 'playwright'].includes(adapter);

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

  const base = await selectByMapping(options, selector);

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
