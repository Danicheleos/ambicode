import type { TypedEntry } from '#modules/evidence/ledger/kinds';
import type { Runtime } from '../composition.ts';
import type { RouteContextPort } from '../harness.ts';

export const MAX_NOTE_BYTES = 262_144;

export interface NoteDeps {
  runtime: Runtime;
  session: string | null;
  context: RouteContextPort | null;
  /** Present when the caller already holds the task's ledger lock; nothing here locks again. */
  ledger?: LockedLedger;
}

export interface NoteRow {
  id: string;
  note: string;
  path: string;
  at: string;
  heading: string;
  iteration: number | null;
  link: string | null;
}

export const KINDS = ['route', 'step', 'gate', 'acceptance', 'declined', 'default-taken', 'preanswer', 'revise',
  'limit', 'exit', 'requirement', 'envelope', 'map', 'search', 'policy', 'baseline', 'check', 'format', 'review',
  'worker', 'note'] as const;

export interface ArtifactRef { kind: string; value: string; id: string; path: string; contentHash: string }

export interface LockedLedger {
  append(entry: NewEntry): Promise<LedgerEntry>;
  read(): Promise<StrictRead>;
}

export interface LedgerEntry {
  id: string;
  at: string;
  kind: string;
  [field: string]: unknown;
}

export type NewEntry = { kind: string; [field: string]: unknown };

export type StrictRead =
  | { state: 'absent' }
  | { state: 'ok'; entries: TypedEntry[] }
  | { state: 'unreadable'; reason: string; line: number | null };

export interface TaskDir {
  slug: string;
  root: string;
  repositoryRoot: string;
  /** The directory the repository sits in, relative to the session: `.` or its name. */
  where: string;
  ledger: string;
  steps: string;
  planBody: string;
  requirements: string;
  workers: string;
  reviews: string;
  stopCheck: string;
  answerBlocked: string;
}

export const NOTE_KINDS = {
  investigation: { stem: 'investigation', stamped: true, label: '**investigation note** — not an accepted plan, not a task, not a decision record.' },
  'plan-draft': { stem: 'plan-draft', stamped: true, label: '**plan draft** — acceptance is recorded by `note promote`, not in this file.' },
  plan: { stem: 'plan', stamped: true, label: '**plan** — accepted' },
  notes: { stem: 'notes', stamped: false, label: '**task note**' },
} as const;

export type NoteKind = keyof typeof NOTE_KINDS;

/** A `plan` note is written only by promotion; legacy ones stay readable. */
export type SaveKind = Exclude<NoteKind, 'plan'>;

export const SAVE_KINDS: readonly SaveKind[] = ['investigation', 'plan-draft', 'notes'];

export const LEDGER_FILE = 'ledger.jsonl';
