import type { TypedEntry } from '#platform/ledger/kinds';
import type { LedgerEntry, NoteDeps, TaskDir } from './evidence.ts';
import type { RouteView } from '../harness.ts';
import type { DiffFile } from '../platform/git.ts';

export type ReviewEntry = LedgerEntry & { kind: 'review' };

export type CheckEntry = Extract<TypedEntry, { kind: 'check' }>;

export const GATE = 'check-only-unauthorized';

export interface CheckOnlyInput { task: string; name: string; project: string | null; files: string[]; phase: 'green'; approve: string[]; decline: string[]; raise?: boolean; /** The user's answer to the whole-project question already is the consent for an all-form key: it is allowed; a `propose` key still asks and a forbidden one still refuses. */ consented?: boolean }

export type CheckOnlyOutcome =
  | { outcome: 'ran'; entry: CheckEntry; proof: ProofVerdict }
  | { outcome: 'not-run'; status: 'timeout' | 'spawn-failed'; detail: string }
  | { outcome: 'waiting'; gate: typeof GATE; key: string }
  | { outcome: 'declined'; key: string };

export type CheckDeps = NoteDeps;

/** The routed command's place: the task's open route for this session, or null when the slug has none. */
export interface Routed { view: RouteView; dir: TaskDir }

export type FormatEntry = Extract<TypedEntry, { kind: 'format' }>;

export interface BaselineEntryFields {
  head: string | null;
  dirty: { path: string; hash: string | null }[];
}

export interface ChangedPath {
  newPath: string | null;
  oldPath: string | null;
  changeKind: DiffFile['changeKind'];
}

type ProofVerdict =
  | { proven: true }
  | { proven: false; cause: 'nonzero-exit' };
