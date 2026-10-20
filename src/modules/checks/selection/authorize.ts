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
  /** The all form runs a whole suite, so it asks whatever the pack says; a pack can still forbid it. */
  form: 'file' | 'all';
}

export function authorizeCommand(options: AuthorizeOptions): CommandAuthorization {
  const { action } = decisionFor(options.policy, options.commandId);

  if (action === 'forbid') {
    return { kind: 'refused', reason: explainRefusal(options.policy, options.commandId) };
  }

  if (action === 'propose' || options.form === 'all') {
    return options.approvals.has(options.approvalKey)
      ? { kind: 'allowed' }
      : {
          kind: 'needs-approval',
          reason: action === 'propose' ? `policy declares "${options.commandId}" as propose, so each run is authorized separately` : `the all form of "${options.commandId}" runs the whole suite, so each run is authorized separately`,
        };
  }

  return { kind: 'allowed' };
}

/** Scoped by project, so `--approve lint` cannot reach another project's check of the same name. */
export function checkApprovalKey(projectId: string, checkId: string): string {
  return `${projectId}/${checkId}`;
}
