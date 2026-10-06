import type { SearchProfile, SetPair } from '#types/modules/config';
import type { FileSystem } from '#types/platform/ports';
import type { AdapterId, Ecosystem } from '#types/primitives';

export interface DetectedCommand {
  argv: string[] | null;
  adapter: AdapterId;
  notice: string;
}

/** `commands.format`: the first installed formatter, or null with the reason. */
export interface DetectedFormat {
  argv: string[] | null;
  notice: string;
}

export interface DetectedProject {
  id: string;
  root: string;
  ecosystem: Ecosystem;
  lint: DetectedCommand | null;
  unit: DetectedCommand | null;
  e2e: DetectedCommand | null;
  format: DetectedFormat | null;
  frameworkPacks: string[];
  notices: string[];
}

export interface PlanInitOptions {
  fs: FileSystem;
  repositoryRoot: string;
  detected: readonly DetectedProject[];
  baseline: string;
  baselineNotice: string;
  /** Measured search profiles by normalized project root (03c-P1). */
  profiles?: ReadonlyMap<string, SearchProfile>;
  /** Replace an existing project's profile instead of keeping it. */
  refreshProfile?: boolean;
  /** Accepted `--set` pairs: they override their slots, set or not (D17). */
  overrides?: readonly SetPair[];
  /** The file was backed up because it did not parse: plan as if it were missing. */
  regenerate?: boolean;
}
