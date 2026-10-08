import type { Ecosystem } from '#types/primitives';
import type { NavigationGuidance } from '#types/modules/search';

// Sent on every call; the full reading guidance is a route step's text.
const EVIDENCE_REQUIREMENT = 'Only CLI calls (map, refs, find, read) are recorded. Run find before adding a helper.';
const READ_GUIDANCE = 'The map is a hypothesis. Read all files in one `read` call. Verify imports for colliding names.';

export function navigationFor(ecosystem: Ecosystem): NavigationGuidance {
  return {
    ecosystem,
    strategy: 'shortlist-then-known-paths-then-lsp-then-targeted-search',
    statusSource: 'current-session',
    evidenceRequirement: EVIDENCE_REQUIREMENT,
    readGuidance: READ_GUIDANCE,
  };
}
