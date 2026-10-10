import type { TypedEntry } from '#platform/ledger/kinds';
import type { Runtime } from '../composition.ts';
import type { CommandContext } from '../harness.ts';

export const MAX_NOTE_BYTES = 262_144;

export interface NoteDeps {
  runtime: Runtime;
  session: string | null;
  context: CommandContext | null;
  /** Present when the caller already holds the task's ledger lock; nothing here locks again. */
  ledger?: LockedLedger;
}

export const KINDS = ['route', 'step', 'gate', 'acceptance', 'declined', 'default-taken', 'preanswer', 'revise',
  'limit', 'exit', 'requirement', 'envelope', 'map', 'search', 'policy', 'baseline', 'check', 'format', 'review',
  'worker', 'note', 'capture'] as const;

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
  stopCheck: string;
  answerBlocked: string;
}

export const NOTE_KINDS = {
  investigation: { stem: 'investigation', stamped: true },
  'plan-draft': { stem: 'plan-draft', stamped: true },
  plan: { stem: 'plan', stamped: true },
  notes: { stem: 'notes', stamped: false },
} as const;

export type NoteKind = keyof typeof NOTE_KINDS;

/** A `plan` note is written only by promotion; legacy ones stay readable. */
export type SaveKind = Exclude<NoteKind, 'plan'>;

export const SAVE_KINDS: readonly SaveKind[] = ['investigation', 'plan-draft', 'notes'];

export const LEDGER_FILE = 'ledger.jsonl';

/** Entries of the route a session resolved plus the routes it resumes, in file order and from any session (03-F1). */
export interface Chain {
  head: LedgerEntry;
  ids: ReadonlySet<string>;
  entries: LedgerEntry[];
}
