import { z } from 'zod';

export const Risk = z.enum(['critical', 'high', 'medium', 'low']);
export type Risk = z.infer<typeof Risk>;

export const Confidence = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof Confidence>;

export const ReviewStatus = z.enum(['complete', 'partial', 'blocked', 'error']);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const CheckStatus = z.enum(['passed', 'failed', 'skipped', 'timed-out', 'error']);
export type CheckStatus = z.infer<typeof CheckStatus>;

/**
 * `failed-before-send` is safe to retry; `uncertain` is not, because a request
 * whose answer was lost may already have created the comment.
 */
export const PublicationState = z.enum([
  'draft',
  'publishing',
  'published',
  'already-published',
  'failed-before-send',
  'uncertain',
  'stale',
  'not-selected',
]);
export type PublicationState = z.infer<typeof PublicationState>;

export const Authority = z.enum(['team', 'observed', 'inherited']);
export type Authority = z.infer<typeof Authority>;

export const RuleCategory = z.enum([
  'code-style',
  'architecture',
  'correctness',
  'security',
  'workflow',
]);
export type RuleCategory = z.infer<typeof RuleCategory>;

export const Activity = z.enum(['review', 'task', 'plan', 'investigate']);
export type Activity = z.infer<typeof Activity>;

export const PromptStage = z.enum([
  'before-work',
  'before-checks',
  'before-review',
  'before-report',
]);
export type PromptStage = z.infer<typeof PromptStage>;

export const CommandAction = z.enum(['run', 'propose', 'forbid']);
export type CommandAction = z.infer<typeof CommandAction>;

export const COMMAND_ACTION_PRECEDENCE: Record<z.infer<typeof CommandAction>, number> = {
  forbid: 3,
  propose: 2,
  run: 1,
};

export const TargetKind = z.enum(['working', 'branch', 'merge-request']);
export type TargetKind = z.infer<typeof TargetKind>;

export const ProviderId = z.enum(['gitlab', 'github']);
export type ProviderId = z.infer<typeof ProviderId>;
