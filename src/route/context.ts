// Types only: step 03 owns this file from then on and implements the port over the strict ledger reader and `ownerOf`.
import type { ArtifactRef, TypedEntry } from '../task/kinds.ts';
import type { LedgerEntry } from '../task/ledger.ts';

export type StartChannel = 'hook' | 'cli' | 'harness';

export type AcceptanceEntry = Extract<TypedEntry, { kind: 'acceptance' }>;

export interface RouteView {
  routeId: string;
  chainIds: readonly string[];
  skill: string;
  session: string;
  mode: 'interactive' | 'headless';
  channel: StartChannel;
  trusted: boolean;
  position: string | 'complete';
}

export type ConsentResult =
  | { state: 'honoured'; source: AcceptanceEntry; object: ArtifactRef | null }
  | { state: 'refused'; reason: 'no-answer' | 'superseded' | 'unbound' | 'acting-needs-human' | 'not-accepted'; source: LedgerEntry | null };

export interface RouteContextPort {
  resolve(task: string, session: string): Promise<RouteView | null>;
  assertOwner(view: RouteView): Promise<void>;
  window(view: RouteView, stepId: string): Promise<readonly LedgerEntry[]>;
  object(view: RouteView, gateId: string): Promise<ArtifactRef | null>;
  consent(view: RouteView, gateId: string, binding?: object): Promise<ConsentResult>;
}
