import type { Ecosystem } from '#types/primitives';
import type { NavigationGuidance } from '#types/modules/search';

// Sent on every call; the full reading guidance is a route step's text.
const EVIDENCE_REQUIREMENT = 'Only CLI calls (map, refs) are recorded. Run refs --declarations <name> before adding a helper.';
const READ_GUIDANCE = 'The map is a hypothesis. Read the leads yourself. Verify imports for colliding names.';

export function navigationFor(ecosystem: Ecosystem): NavigationGuidance {
  return {
    ecosystem,
    strategy: 'shortlist-then-known-paths-then-lsp-then-targeted-search',
    statusSource: 'current-session',
    evidenceRequirement: EVIDENCE_REQUIREMENT,
    readGuidance: READ_GUIDANCE,
  };
}
