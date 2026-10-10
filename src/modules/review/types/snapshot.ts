import type { DiffFile } from '#types/platform/git';
import type { ReviewTarget } from '#types/modules/review';

export type { OperatorPatterns } from '#types/util';

export interface TargetResolution {
  target: ReviewTarget;
  files: DiffFile[];
  patch: string;
}
