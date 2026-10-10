import type { TypedEntry } from '#platform/ledger/kinds';
import type { LedgerEntry, NoteDeps, TaskDir } from './evidence.ts';
import type { RouteView } from '../harness.ts';
import type { DiffFile } from '../platform/git.ts';

export type ReviewEntry = LedgerEntry & { kind: 'review' };

export type CheckEntry = Extract<TypedEntry, { kind: 'check' }>;

export const GATE = 'check-only-unauthorized';

export interface CheckOnlyInput { task: string; key: string; only: string[]; phase: 'red' | 'green'; approve: string[]; decline: string[] }

export type CheckOnlyOutcome =
  | { outcome: 'ran'; entry: CheckEntry; proof: ProofVerdict }
  | { outcome: 'not-run'; status: 'timeout' | 'spawn-failed'; detail: string }
  | { outcome: 'waiting'; gate: typeof GATE; key: string }
  | { outcome: 'declined'; key: string };

export type CheckDeps = NoteDeps;

/** The routed command's place: the task's open route for this session, or null when the slug has none. */
export interface Routed { view: RouteView; dir: TaskDir }

export type FormatEntry = Extract<TypedEntry, { kind: 'format' }>;

export interface PendingApproval {
  checkId: string;
  approvalKey: string;
  projectId: string;
  reason: string;
  scope: string;
  proposedArgv: string[];
  cwd: string;
}

export interface BaselineEntryFields {
  head: string | null;
  dirty: { path: string; hash: string | null }[];
}

export interface ChangedPath {
  newPath: string | null;
  oldPath: string | null;
  changeKind: DiffFile['changeKind'];
}

export type ProofVerdict =
  | { proven: true }
  | { proven: false; cause: 'no-failure' | 'nonzero-exit' };
