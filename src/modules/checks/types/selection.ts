export interface RunnerSummary { ran: number; failed: number; loadErrors: number }

/**
 * Every external command, selector scripts included, passes through here, so no call site
 * can acquire execution without a decision.
 */
export type CommandAuthorization =
  | { kind: 'allowed' }
  | { kind: 'refused'; reason: string }
  | { kind: 'needs-approval'; reason: string };

export interface SelectedFile {
  path: string;
  reason: string;
}

export interface ApprovalRequest {
  reason: string;
  scope: string;
}

export interface Selection {
  files: SelectedFile[];
  complete: boolean;
  limitations: string[];
  approval: ApprovalRequest | null;
}
