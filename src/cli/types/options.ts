import type { EvidenceSource } from '#types/modules/requirements';
import type { TargetSelection } from '#types/modules/review';

/**
 * Shared by `review` and `bundle`. `validateTargetArgs` must stay pure: `main`
 * calls it before a runtime exists, so an invalid combination exits before any
 * filesystem, git or provider access.
 */
export const TARGET_OPTIONS = {
  values: ['base', 'mr', 'evidence', 'task'],
  repeated: ['requirement', 'approve', 'decline', 'exclude', 'only', 'context'],
  flags: ['json', 'branch', 'with-tests'],
} as const;

export interface ResolvedTargetOptions {
  target: TargetSelection;
  requirementUrls: string[];
  evidence: EvidenceSource | null;
  approvals: Set<string>;
  /** `--decline <key>`: without it, a check the human does not want run would leave the review waiting forever. */
  declines: Set<string>;
  /** `--task <slug>`: for a run with no requirement, so its plan, investigation and reviews share one directory. */
  task: string | null;
  /**
   * `--exclude <glob>`: added to `review.excludePaths`. The per-file snapshot
   * ceiling is not configurable, so this is the only way past one oversized file.
   */
  excludePaths: string[];
  /** `--only <glob>`: for a dirty working tree that holds edits unrelated to the task. */
  onlyPaths: string[];
  /** `--context <path>`: unchanged files the caller found relying on the change; a local target only. */
  contextPaths: string[];
  /** `--with-tests`: merge-request review leaves test code out by default, since no check can run it there. */
  withTests: boolean;
}

/**
 * Kept out of `commands/view.ts`: the dispatcher parses every command's
 * arguments up front, and importing that would load Fastify on every hook.
 */
export const VIEW_OPTIONS = {
  values: ['review'],
  flags: ['json', 'no-open'],
} as const;
