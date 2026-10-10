import type { EvidenceSource } from '#types/modules/requirements';
import type { TargetSelection } from '#types/modules/review';

/**
 * Shared by `review` and `bundle`. `validateTargetArgs` must stay pure: `main`
 * calls it before a runtime exists, so an invalid combination exits before any
 * filesystem, git or provider access.
 */
export const TARGET_OPTIONS = {
  values: ['base', 'mr', 'evidence', 'task'],
  repeated: ['requirement', 'exclude', 'only'],
  flags: ['json', 'branch', 'with-tests'],
} as const;

export interface ResolvedTargetOptions {
  target: TargetSelection;
  requirementUrls: string[];
  evidence: EvidenceSource | null;
  /** `--task <slug>`: for a run with no requirement, so its plan, investigation and reviews share one directory. */
  task: string | null;
  /** `--exclude <glob>`: added to `review.excludePaths`. */
  excludePaths: string[];
  /** `--only <glob>`: for a dirty working tree that holds edits unrelated to the task. */
  onlyPaths: string[];
  /** `--with-tests`: merge-request review leaves test code out by default, since no check can run it there. */
  withTests: boolean;
}
