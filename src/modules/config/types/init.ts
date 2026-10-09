import type { ProposalInput, SetPair } from '#types/modules/config';
import type { FileSystem } from '#types/platform/ports';

export interface PlanInitOptions {
  fs: FileSystem;
  repositoryRoot: string;
  input: ProposalInput;
  baseline: string;
  baselineNotice: string;
  /** Accepted `--set` pairs: they override their slots, set or not. */
  overrides?: readonly SetPair[];
  /** The file was backed up because it did not parse: plan as if it were missing. */
  regenerate?: boolean;
}
