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
  'worker', 'note', 'init'] as const;

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
  /** The task's one plan file: written as a draft, accepted in place. */
  plan: string;
  requirements: string;
  workers: string;
  answerBlocked: string;
}

export const NOTE_KINDS = {
  investigation: { stem: 'investigation', stamped: true },
  plan: { stem: 'plan', stamped: false },
  notes: { stem: 'notes', stamped: false },
  result: { stem: 'result', stamped: true },
  /** One implementer round's `Changed:`/`Gaps:` message, saved by the SubagentStop hook. */
  changed: { stem: 'changed', stamped: true },
  /** The task report the implementer wrote as its final message: one file per task, the latest route's. */
  report: { stem: 'report', stamped: false },
} as const;

export type NoteKind = keyof typeof NOTE_KINDS;

/** A `plan` note is recorded only when the plan route accepts the plan file. */
export type SaveKind = Exclude<NoteKind, 'plan'>;

export const SAVE_KINDS: readonly SaveKind[] = ['investigation', 'notes', 'result', 'changed', 'report'];

export const LEDGER_FILE = 'ledger.jsonl';

/** Entries of the route a session resolved plus the routes it resumes, in file order and from any session (03-F1). */
export interface Chain {
  head: LedgerEntry;
  ids: ReadonlySet<string>;
  entries: LedgerEntry[];
}
