
export const LAYER_NAMES = ['retrieve', 'shortlist', 'harvest'] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

export interface RefsResult {
  names: { name: string; hits: number; files: number; declarations: number; collides: boolean }[];
  hits: number;
  limitations: string[];
  text: string;
  bytes: number;
}

/** `spans`: the line ranges (`40-52`) where the terms occur. */
export interface MapCandidate {
  path: string;
  score: number;
  reasons: string[];
  spans?: string[];
  /** The request terms (lowercased) behind the score, so the pool can tell one repeated word from independent evidence. Not printed. */
  terms?: string[];
}

export interface MapSymbol { name: string; kind: string; at: string; declarations: number; collides: boolean }

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

