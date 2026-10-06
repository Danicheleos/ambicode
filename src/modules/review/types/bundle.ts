import type { Runtime } from '#types/composition';
import type { EvidenceSource } from '#types/requirements';
import type { TargetSelection } from '#types/review';

export interface AssembleOptions {
  runtime: Runtime;
  target: TargetSelection;
  requirementUrls: readonly string[];
  evidence: EvidenceSource | null;
  approvals: ReadonlySet<string>;
  declines: ReadonlySet<string>;
  task: string | null;
  excludePaths?: readonly string[];
  onlyPaths?: readonly string[];
  withTests?: boolean;
  /** `--context <path>`: unchanged files the caller found relying on the change, e.g. by LSP references. */
  contextPaths?: readonly string[];
  /** Dirty before the task began and untouched since: left out of the review and of check selection (07-B3). */
  preexisting?: readonly string[];
  /** Stop after `planSnapshot`: nothing is written and no check runs (07-E1). */
  dryRun?: boolean;
}
