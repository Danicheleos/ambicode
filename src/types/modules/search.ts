import type { ProjectConfig, SearchProfile, AmbicodeConfig } from './config.ts';
import type { Ecosystem } from '../primitives.ts';
import { z } from 'zod';
import { DECLARATION_PATTERNS } from './ecosystems.ts';
import { TEST_PATH_PATTERNS } from '#util/path-classes';
import type { Git } from '#platform/git/git';
import type { Runtime } from '../composition.ts';

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

export interface NavigationGuidance {
  strategy: 'shortlist-then-known-paths-then-lsp-then-targeted-search';
  ecosystem: Ecosystem;
  statusSource: 'current-session';
  evidenceRequirement: string;
  readGuidance: string;
}

/** `line`: where the model starts reading, a declaration named like a term or the first line holding one (prompt mode). */
export interface MapCandidate { path: string; score: number; reasons: string[]; spans?: string[]; line?: number; end?: number }

export interface MapSymbol { name: string; kind: string; at: string; declarations: number; collides: boolean }

/** The directory most top leads share, and its files named like those leads or like the directory itself. */
export interface MapFeature { root: string; paths: string[]; name?: string }

/**
 * Offline recall over 116 localize tickets: @10 0.269, @15 0.314, @20 0.346 (shortlist-recall.mjs).
 * 15 is what fits beside the 5.5KB policy in the hook's 9,800-character inline window; `ambicode locate` gives the long list.
 */
export const PREPARE_SHORTLIST_LIMIT = 15;

/** The reviewer reads these on top of the change; eight keeps a wide change inside the input limit. */
export const MAX_DEPENDENTS = 8;

/** A profile keeps the ones its sources use. Each captures the name in group 1. */
export const DECLARATION_CANDIDATES: readonly RegExp[] = DECLARATION_PATTERNS;

/** The test-file shapes search knows; a profile keeps the ones that match tracked files. */
export const TEST_CANDIDATES: readonly RegExp[] = TEST_PATH_PATTERNS;

/** Used when a project has no profile: today's source extensions, nothing else assumed. */
export const GENERIC_PROFILE: Omit<SearchProfile, 'stamp'> = {
  sources: ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte', 'astro', 'graphql', 'gql', 'py', 'pyi'],
  companions: [],
  catalogs: [],
  featureKinds: [],
  exportOnly: false,
};

/**
 * Deliberately not an index: nothing is persisted, every field is recomputed from
 * git on each call. A shortlist that found nothing says so; it never widens to the project.
 */

export const LocateCandidate = z.strictObject({
  path: z.string().min(1),
  /** Higher ranks first. Comparable within one call, not across calls. */
  score: z.number().positive(),
  reasons: z.array(z.string().min(1)).min(1),
});
export type LocateCandidate = z.infer<typeof LocateCandidate>;

/** Empty lists are omitted, except `candidates`: an explicit empty array is how emptiness is reported. */
export const PrepareShortlist = z.strictObject({
  terms: z.array(z.string().min(1)).min(1),
  candidates: z.array(LocateCandidate),
  limitations: z.array(z.string().min(1)).min(1).optional(),
});
export type PrepareShortlist = z.infer<typeof PrepareShortlist>;

export const LocateOutput = z.strictObject({
  command: z.literal('locate'),
  projectId: z.string().min(1),
  terms: z.array(z.string().min(1)),
  limit: z.number().int().positive(),
  candidates: z.array(LocateCandidate),
  limitations: z.array(z.string().min(1)),
});
export type LocateOutput = z.infer<typeof LocateOutput>;

export interface IndexDeps {
  runtime: Runtime;
  git: Git;
  repositoryRoot: string;
  config: AmbicodeConfig;
  /** Production: `[process.execPath, process.argv[1]]`; the hook and the CLI are the same script. */
  selfArgv: readonly string[];
  /** Set only by the offline recall script. */
  indexDir?: string;
  isAlive?: (pid: number) => boolean;
}

export const SCORE_FILENAME = 3;

/** Names that mean nothing on their own: matching them finds the whole project. */
export const COMMON_NAMES = new Set(['constructor', 'index', 'default', 'main', 'get', 'set', 'run', 'init', 'test', 'it', 'describe', 'props', 'state']);

export interface Declaration {
  name: string;
  kind: string;
  path: string;
  line: number;
  /** Files, among those harvested, that declare this name. */
  declarations: number;
}

/** The ranking constants the map applies; `search.tuning` in the config overrides any of them. */
export interface SearchTuning {
  topFiles: number;
  maxTerms: number;
  proseRetryTerms: number;
  pass2Names: number;
  pass2Outside: number;
  spansPerCandidate: number;
  sequenceDirMin: number;
  sequenceShare: number;
  layerMin: number;
  layeredShare: number;
  nameMaxFiles: number;
  leads: number;
  featureLeads: number;
  featurePaths: number;
}

export const SEARCH_TUNING_DEFAULTS: Readonly<SearchTuning> = {
  topFiles: 8,
  maxTerms: 12,
  proseRetryTerms: 8,
  pass2Names: 6,
  pass2Outside: 0.5,
  spansPerCandidate: 3,
  sequenceDirMin: 5,
  sequenceShare: 0.8,
  layerMin: 3,
  layeredShare: 0.6,
  nameMaxFiles: 60,
  leads: 8,
  featureLeads: 4,
  featurePaths: 12,
};
