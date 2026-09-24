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

/**
 * The publication state machine, declared once (doc 03 P1.6). Page, provider
 * and persistence all read these names from here; none of them carries its own
 * string union.
 *
 * `uncertain` is deliberately distinct from `failed-before-send`: a request
 * that was rejected before GitLab could accept it may be retried, while one
 * whose answer was lost may already have created the comment.
 */
export const PublicationState = z.enum([
  /** Edited and saved locally; nothing was sent. */
  'draft',
  /** A send is in flight for this comment right now. */
  'publishing',
  /** GitLab confirmed the comment, and its note identity was recorded. */
  'published',
  /** Reconciliation found this exact comment already on the merge request. */
  'already-published',
  /** Refused before GitLab could accept the request; nothing was created. */
  'failed-before-send',
  /** The answer was lost or unvalidatable; the comment may or may not exist. */
  'uncertain',
  /** The merge request moved, so this comment was not sent at its pinned position. */
  'stale',
  /** The human did not select this finding. */
  'not-selected',
]);
export type PublicationState = z.infer<typeof PublicationState>;

/** States that mean the comment exists remotely and must never be sent again. */
export const SETTLED_PUBLICATION_STATES: ReadonlySet<PublicationState> = new Set([
  'published',
  'already-published',
]);

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

export const AdapterId = z.enum(['eslint', 'ruff', 'generic', 'jest', 'vitest', 'pytest', 'playwright']);
export type AdapterId = z.infer<typeof AdapterId>;

export const TargetKind = z.enum(['working', 'branch', 'merge-request']);
export type TargetKind = z.infer<typeof TargetKind>;

export const ProviderId = z.enum(['gitlab', 'github']);
export type ProviderId = z.infer<typeof ProviderId>;
