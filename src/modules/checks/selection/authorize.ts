import type { ResolvedPolicy } from '#types/modules/policy';
import { decisionFor, explainRefusal } from '#modules/policy/packs/resolve';

/** Every external command passes through here, so no call site can acquire execution without a decision. */
type CommandAuthorization =
  | { kind: 'allowed' }
  | { kind: 'refused'; reason: string }
  | { kind: 'needs-approval'; reason: string };

interface AuthorizeOptions {
  policy: ResolvedPolicy;
  commandId: string;
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

/** Scoped by project, so `--approve lint` cannot reach another project's check of the same name. */
export function checkApprovalKey(projectId: string, checkId: string): string {
  return `${projectId}/${checkId}`;
}
