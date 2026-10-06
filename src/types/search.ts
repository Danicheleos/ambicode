import type { ProjectConfig } from './config.ts';
import type { LocateCandidate } from './locate.ts';
import type { Ecosystem } from './primitives.ts';

export type IndexName = 'none' | 'codeindex';

export type IndexState = 'none' | 'fresh' | 'stale' | 'building' | 'absent' | 'error';

export interface IndexStatus {
  tool: IndexName;
  state: IndexState;
  /** `state === 'fresh'`. */
  fresh: boolean;
  builtMs: number | null;
  reason: string | null;
  /** Project files that differ from the indexed commit, untracked ones included; null when not measured. */
  drift: number | null;
}

export interface IndexDeclaration { name: string; path: string; line: number | null; kind: string | null }

export interface IndexReference { path: string; line: number | null }

export type IndexAnswer<T> = { ok: true; value: T; status: IndexStatus } | { ok: false; status: IndexStatus };

export interface IndexAdapter {
  readonly name: IndexName;
  build(project: ProjectConfig, options: { detached: boolean }): Promise<IndexStatus>;
  status(project: ProjectConfig): Promise<IndexStatus>;
  find(name: string, options?: { kind?: string }): Promise<IndexAnswer<IndexDeclaration[]>>;
  refs(names: readonly string[]): Promise<IndexAnswer<IndexReference[]>>;
  relates(path: string): Promise<IndexAnswer<{ imports: string[] | null; importers: string[] }>>;
  /** `base` is a revision; not parsed before step 08, so it answers not ok. */
  delta(base: string): Promise<IndexAnswer<string[]>>;
}

export interface Dependent {
  path: string;
  reasons: string[];
}

export interface RefsResult {
  names: { name: string; hits: number; files: number; declarations: number | null; collides: boolean | null }[];
  hits: number;
  limitations: string[];
  /** Cut to 4,096 bytes with the command that prints the rest. */
  text: string;
  full: string;
  bytes: number;
  truncated: boolean;
}

export const DEFAULT_LOCATE_LIMIT = 20;

/** Two reasons cut a 10-candidate BE payload from 9,165 to 8,531 bytes; the third reason repeats what the first two imply. */
export const PREPARE_REASONS_PER_CANDIDATE = 2;

export interface LocateShortlist {
  terms: string[];
  candidates: LocateCandidate[];
  limitations: string[];
}

/** AMBICODE never starts a language server; the plugin to install is setup guidance only. */
export interface NavigationGuidance {
  strategy: 'shortlist-then-known-paths-then-lsp-then-targeted-search';
  ecosystem: Ecosystem;
  plugin: string;
  serverCommand: string;
  setupCommands: string[];
  statusSource: 'current-session';
  evidenceRequirement: string;
  readGuidance: string;
}

/** `line`: where the model starts reading, a declaration named like a term or the first line holding one (prompt mode). */
export interface MapCandidate { path: string; score: number; reasons: string[]; spans?: string[]; line?: number }

export interface MapSymbol { name: string; kind: string; at: string; declarations: number; collides: boolean }

/** The directory most top leads share, and its files named like those leads or like the directory itself. */
export interface MapFeature { root: string; paths: string[]; name?: string }

/**
 * Offline recall over 116 localize tickets: @10 0.269, @15 0.314, @20 0.346 (shortlist-recall.mjs).
 * 15 is what fits beside the 5.5KB policy in the hook's 9,800-character inline window; `ambicode locate` gives the long list.
 */
export const PREPARE_SHORTLIST_LIMIT = 15;
