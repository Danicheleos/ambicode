// What an earlier /ambicode:plan or /ambicode:investigate leaves in the gitignored .ambicode/tasks/<slug>/ for /ambicode:task to
// pick up: the note file and the ledger line that points at it. A case carries them as `files` named `seed/tasks/<slug>/...`;
// cases.mjs makes its scaffold.sh copy the seed/ folder into .ambicode/.
//
// The ledger line is what src/modules/evidence/notes.ts writes for a note (id and time from appendLocked, then kind, note,
// path, contentHash). task.start reads the latest `plan` note (src/skills/brief.ts briefOf) and search.map(context) the latest
// `investigation` note (investigationOf); task-cases.test.mjs reads these ledgers back through the real ledger reader.
import { contentHash } from '../../src/util/hash.ts';

const AT = '2026-03-01T09:00:00.000Z';
const STAMP = '2026-03-01T09-00';

/** The note's file name below .ambicode/tasks/<slug>/: `plan.md` is the task's one plan file, investigations are stamped. */
export const noteFile = (kind) => (kind === 'plan' ? 'plan.md' : `investigation_${STAMP}.md`);

/** `{ 'seed/tasks/<slug>/<note file>': text, 'seed/tasks/<slug>/ledger.jsonl': line }` for one note. */
export function seedFiles(slug, kind, text) {
  // The task route runs only a plan whose frontmatter says `status: accepted`.
  const body = `${kind === 'plan' ? '---\nstatus: accepted\n---\n\n' : ''}${text.trim()}\n`;
  const entry = { id: '1', at: AT, kind: 'note', note: kind, path: `.ambicode/tasks/${slug}/${noteFile(kind)}`, contentHash: contentHash(body) };
  return {
    [`seed/tasks/${slug}/${noteFile(kind)}`]: body,
    [`seed/tasks/${slug}/ledger.jsonl`]: `${JSON.stringify(entry)}\n`,
  };
}

// ---------------------------------------------------------------- investigations (a final answer with path:line citations)
export const INVESTIGATIONS = {
  'sv-floor': `
The viability floor is a constant in the domain, and the stock report repeats it as a literal.

- VIABILITY_FLOOR_PERCENT = 50 is defined at domain/src/main/kotlin/org/seedvault/domain/lot/Viability.kt:3 and used by Viability.isViable at Viability.kt:7; GerminationRules uses isViable at domain/src/main/kotlin/org/seedvault/domain/germination/GerminationRules.kt:13.
- viabilityBands in application/src/main/kotlin/org/seedvault/application/usecase/report/ViabilityBands.kt:5-13 splits lots into excellent (>= 90), viable (>= 50) and weak with the literal 50 at ViabilityBands.kt:11, so moving the floor would leave the report behind.
- viabilityBands has no caller yet and no test: StockReportService counts viable lots with isViable (application/src/main/kotlin/org/seedvault/application/usecase/report/StockReportService.kt:10).
- The only existing test in the application module is application/src/test/kotlin/org/seedvault/application/usecase/germination/SowLotServiceTest.kt.
`,
};
