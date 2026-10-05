import type { Ecosystem } from '../contracts/primitives.ts';
import { SHORTLIST_DEFAULTS } from './defaults.ts';

export interface EcosystemFacts {
  sourceGlobs: readonly string[];
  /** Each pattern captures a declared name in group 1. */
  declarationPatterns: readonly RegExp[];
  /** When set, a declaration line must match it to count as reachable from other files. */
  exportFilter: RegExp | null;
  i18nGlobs: readonly string[];
  /** File kinds (`x.<kind>.ts`) that hold data or types, not behaviour: the map's feature line lists them. */
  sharedKinds: readonly string[];
}

const DECLARATIONS: readonly RegExp[] = [
  /(?:^|\s)(?:abstract\s+|async\s+|default\s+)*(?:function\*?|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:public|protected|private|static|async|readonly|get|set|override)\s+(?:(?:static|async|readonly|get|set|override)\s+)*([A-Za-z_$][\w$]*)\s*[(<:=]/,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/,
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/,
  /^\s*(?:public|protected|internal)\s+(?:static\s+)?(?:[\w<>[\],?.]+\s+)+([A-Za-z_]\w*)\s*\(/,
];

/** Step 09 extends this table; nothing else holds per-ecosystem facts. */
export const ECOSYSTEMS: Record<Ecosystem, EcosystemFacts> = {
  typescript: {
    sourceGlobs: SHORTLIST_DEFAULTS.typescript.include,
    declarationPatterns: DECLARATIONS,
    exportFilter: /^\s*export\b/,
    i18nGlobs: ['**/assets/i18n/*.json', '**/i18n/*.json', '**/locales/**/*.json'],
    sharedKinds: ['mocks', 'mock', 'types', 'type', 'constants', 'fixtures'],
  },
  python: {
    sourceGlobs: SHORTLIST_DEFAULTS.python.include,
    declarationPatterns: DECLARATIONS,
    exportFilter: null,
    i18nGlobs: [],
    sharedKinds: [],
  },
};

export const FALLBACK_ECOSYSTEM: EcosystemFacts = {
  sourceGlobs: [...SHORTLIST_DEFAULTS.typescript.include, ...SHORTLIST_DEFAULTS.python.include],
  declarationPatterns: DECLARATIONS,
  exportFilter: null,
  i18nGlobs: [],
  sharedKinds: ['mocks', 'mock', 'types', 'type', 'constants', 'fixtures'],
};

export function ecosystemFacts(ecosystem: Ecosystem | null | undefined): EcosystemFacts {
  return ecosystem === null || ecosystem === undefined ? FALLBACK_ECOSYSTEM : (ECOSYSTEMS[ecosystem] ?? FALLBACK_ECOSYSTEM);
}
