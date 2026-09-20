import type { ResolvedPolicy } from '../contracts/policy.ts';
import { decisionFor, explainRefusal } from '../policy/resolve.ts';

/**
 * Every external command passes through here. A selector script is project code
 * like the check it feeds, so one function means no call site can acquire
 * execution without a decision (doc 05, D08).
 */
export type CommandAuthorization =
  | { kind: 'allowed' }
  | { kind: 'refused'; reason: string }
  | { kind: 'needs-approval'; reason: string };

export interface AuthorizeOptions {
  policy: ResolvedPolicy;
  commandId: string;
  /** The token a human returns to authorize this one run (D08). */
  approvalKey: string;
  approvals: ReadonlySet<string>;
}

export function authorizeCommand(options: AuthorizeOptions): CommandAuthorization {
  const { action } = decisionFor(options.policy, options.commandId);

  // Absence is not permission, so "undeclared" refuses exactly like "forbid".
  if (action === 'forbid' || action === 'undeclared') {
    return { kind: 'refused', reason: explainRefusal(options.policy, options.commandId) };
  }

  if (action === 'propose') {
    return options.approvals.has(options.approvalKey)
      ? { kind: 'allowed' }
      : {
          kind: 'needs-approval',
          reason: `policy declares "${options.commandId}" as propose, so each run is authorized separately`,
        };
  }

  return { kind: 'allowed' };
}

/**
 * Identifies exactly one check, so `--approve lint` cannot reach another
 * project's check of the same name.
 */
export function checkApprovalKey(projectId: string, checkId: string): string {
  return `${projectId}/${checkId}`;
}

/** Approving a test run is not approving the script that decides what to run. */
export function selectorApprovalKey(projectId: string, checkId: string): string {
  return `${checkApprovalKey(projectId, checkId)}:selector`;
}
