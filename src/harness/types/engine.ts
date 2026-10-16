import type { Runtime } from '#types/composition';
import type { LedgerEntry, TaskDir, LockedLedger } from '#types/modules/evidence';
import type { RouteRegistry, RouteDef } from '#types/harness';

/** Binds an answer to what it consents to: a check key, or the values and the draft hash its print showed. */
export interface ConsentBinding { key?: string; set?: readonly string[]; draft?: string }

export type DeliveryChannel = 'cli' | 'hook';

/** One composed message: the step (or `complete`) it is for and what the caller prints. */
export interface Part { text: string; file: string | null; bytes: number; position: string | 'complete'; full: string }

export interface Composed {
  /** What the caller prints. */
  text: string;
  /** The whole message, when it went to a file behind a preview. */
  file: string | null;
  full: string;
  bytes: number;
}


export type { Chain } from '#types/modules/evidence';

/** Everything one advance works on. The ledger lock is held for the whole run (03-O6). */
export interface Run {
  runtime: Runtime;
  routes: RouteRegistry;
  def: RouteDef;
  task: string;
  dir: TaskDir;
  ledger: LockedLedger;
  entries: LedgerEntry[];
  head: LedgerEntry;
  session: string;
  /** The Claude session whose hook state (pointer, delivery markers) this route writes: its harness session, else its owner. */
  stateKey: string;
  cause: string;
  channel: DeliveryChannel;
  scratchpadDir: string | undefined;
  /** Same-session reprint and re-injection: fold and deliver, run and count nothing (03-E2). */
  deliverOnly: boolean;
  written: string[];
  notes: string[];
  exited: string | null;
  /** Entry ids the advancing command wrote for the step it completes (D1). */
  produced?: readonly string[];
}
