import { classifyProof } from '#modules/checks/selection/proof';
import type { TypedEntry } from '#modules/evidence/ledger/kinds';
import type { Workspace } from './composition.ts';
import type { ProjectConfig } from './config.ts';
import type { LedgerEntry, NoteDeps, TaskDir } from './evidence.ts';
import type { RouteRegistry, RouteView } from './harness.ts';

export type ReviewEntry = LedgerEntry & { kind: 'review' };

export type CheckEntry = Extract<TypedEntry, { kind: 'check' }>;

export const GATE = 'check-only-unauthorized';

export interface CheckOnlyInput { task: string; key: string; only: string[]; phase: 'red' | 'green'; approve: string[]; decline: string[] }

export type CheckOnlyOutcome =
  | { outcome: 'ran'; entry: CheckEntry; proof: ReturnType<typeof classifyProof> }
  | { outcome: 'not-run'; status: 'timeout' | 'spawn-failed'; detail: string }
  | { outcome: 'waiting'; gate: typeof GATE; key: string }
  | { outcome: 'declined'; key: string };

export interface CheckDeps extends NoteDeps {
  routes: RouteRegistry;
  /** The detached warm rebuild (07-G3); never awaited. */
  warm?: (workspace: Workspace, project: ProjectConfig) => Promise<unknown>;
}

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
