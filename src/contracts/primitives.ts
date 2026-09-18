import { z } from 'zod';

/**
 * Central value sets. Every module imports these instead of re-declaring a
 * literal union; a new member is added here once (doc 02, "Central values").
 */

export const Risk = z.enum(['critical', 'high', 'medium', 'low']);
export type Risk = z.infer<typeof Risk>;

export const Confidence = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof Confidence>;

export const ReviewStatus = z.enum(['complete', 'partial', 'blocked', 'error']);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const CheckStatus = z.enum(['passed', 'failed', 'skipped', 'timed-out', 'error']);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const PublicationState = z.enum([
  'published',
  'already-published',
  'failed',
  'uncertain',
  'not-sent',
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

/** Exactly these four stages; anything else is a configuration error (doc 05). */
export const PromptStage = z.enum([
  'before-work',
  'before-checks',
  'before-review',
  'before-report',
]);
export type PromptStage = z.infer<typeof PromptStage>;

export const CommandAction = z.enum(['run', 'propose', 'forbid']);
export type CommandAction = z.infer<typeof CommandAction>;

/** Precedence is forbid > propose > run (doc 05, "Resolution"). */
export const COMMAND_ACTION_PRECEDENCE: Record<z.infer<typeof CommandAction>, number> = {
  forbid: 3,
  propose: 2,
  run: 1,
};

export const Ecosystem = z.enum(['typescript', 'python']);
export type Ecosystem = z.infer<typeof Ecosystem>;

export const AdapterId = z.enum(['eslint', 'ruff', 'jest', 'vitest', 'pytest', 'playwright']);
export type AdapterId = z.infer<typeof AdapterId>;

export const TargetKind = z.enum(['working', 'branch', 'merge-request']);
export type TargetKind = z.infer<typeof TargetKind>;

export const ProviderId = z.enum(['gitlab', 'github']);
export type ProviderId = z.infer<typeof ProviderId>;
