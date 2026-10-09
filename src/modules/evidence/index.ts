// Notes, the evidence report and task directories (the ledger itself is #platform/ledger). Nothing here is deliberately omitted.

// root: saved notes and plan promotion.
export { NOTE_LABELS } from './notes.ts';
export { SAVE_KINDS } from '#types/modules/evidence';
export type { SaveKind } from '#types/modules/evidence';
/** owningRoute(ledger, session, task) — the route a `plan-draft` is saved for, or null for a routeless save; other states refuse. */
export { owningRoute } from './notes.ts';
/** promotePlan(…) — makes the draft the human accepted, and only that draft, the plan. */
export { promotePlan } from './notes.ts';
/** saveNote(…) — writes a note file and its ledger entry for an investigation, plan draft or notes. */
export { saveNote } from './notes.ts';

// report/: the report generated from the ledger alone.
/** navigationLine(entries) — one line stating the code-made navigation calls recorded (a model's own reads are not). */
export { navigationLine } from './report/navigation-line.ts';
/** buildReport(…) — Evidence and Not verified sections generated deterministically from ledger entries. */
export { buildReport } from './report/report.ts';

// task/: task slugs and directories.
/** mintTaskSlug(text) — deterministic slug from a request (ticket key beats prose, hash when no Latin words); null when none. */
export { mintTaskSlug } from './task/slug.ts';
/** excludeWorkingDirs(runtime, repositoryRoot) — adds the working dirs to `.git/info/exclude` so agent searches skip them. */
export { excludeWorkingDirs } from './task/task-dir.ts';
/** resolveTaskDir(runtime, slug) — the task directory for a slug, under the configured repository below the session dir. */
export { resolveTaskDir } from './task/task-dir.ts';
/** taskDirFor(repositoryRoot, slug, where?) — the only place that joins TASKS_DIR and a slug. */
export { taskDirFor } from './task/task-dir.ts';
