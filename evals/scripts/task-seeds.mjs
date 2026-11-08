// What an earlier /ambicode:plan or /ambicode:investigate leaves in the gitignored .ambicode/tasks/<slug>/ for /ambicode:task to
// pick up: the note file and the ledger line that points at it. A case carries them as `files` named `seed/tasks/<slug>/...`;
// cases.mjs makes its scaffold.sh copy the seed/ folder into .ambicode/.
//
// The ledger line is what src/modules/evidence/notes.ts writes for a note (id and time from appendLocked, then kind, note,
// path, contentHash). task.start reads the latest `plan` note (src/skills/brief.ts briefOf) and search.map(context) the latest
// `investigation` note (investigationOf); task-seeds.test.mjs reads these ledgers back through the real ledger reader.
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
