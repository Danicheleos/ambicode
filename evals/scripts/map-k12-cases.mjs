// Second-stack map bench (acceptance A2): five synthetic tickets over k12-backend (Python, FastAPI, SQLAlchemy, Celery).
//   node evals/scripts/map-k12-cases.mjs <k12-checkout> [--out evals/local/bench/map-k12]
//   node evals/scripts/map-bench.mjs --bench <k12-checkout-with-.ambicode> --cases evals/local/bench/map-k12
// Truth is the source folders each first-parent merge touched (git diff of the merge against its first parent), corrected like map-cases.mjs
// (files absent at HEAD, non-code files) and without tests, migrations and assets. The tickets were written from the merge titles, commit
// messages and the behaviour of the diff, in a product person's words; none names a path, a class or a function.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { correctTruth } from './map-cases.mjs';
import { ancestorShares } from './folder-truth.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// [id, merge sha, title, body, manual drops {file: reason}]
export const K12 = [
  ['division-manager-remove', '8d18e1e', 'Remove a manager from a division',
    'When a division manager leaves or is replaced there is no way to take the role away from them, so support has to do it by hand. We need an action on a division that removes its manager and archives that person. Superusers can use it everywhere and district admins only for the divisions of their own district. It must refuse an employee who is not the manager of that division.',
    {}],
  ['dashboard-participant-filters', 'a502478', 'Dashboard issue and recognition totals ignore the new filters',
    'On the dashboard, picking a template or a person changes the round counts but the issue and recognition totals stay the same. Managers also want to filter by the type of person who was rounded, and by one employee, counting everything that employee took part in as rounder, roundee, reporter or recipient. Issues, recognitions and rounds should all answer to the same filters.',
    {}],
  ['template-action-permissions', '357ae29', 'Show which templates the user can edit or archive',
    'The template list offers Edit and Archive on every template and people only learn they are not allowed when the request fails. Each template sent to the app should say whether the current user may archive it and whether they may change it. A superuser can do both everywhere, a district admin only for the templates of their own district and divisions, and an author for their own templates. The rounds report should also tell which templates are BCI ones.',
    { 'src/domain/entities/employee/enums.py': 'reformat only (a set expression split over lines)', 'src/config.py': 'a constant for the name of the leader-rounding template, no behaviour' }],
  ['issue-resolved-date', 'e8fe018', 'Record and sort issues by when they were resolved',
    'Nobody can tell when an issue was closed: the issue list shows when it was raised but cannot be sorted by resolution. When an issue is marked as resolved the system should remember the date and time, return it with the issue, and let the list be sorted by it. In the organisation settings the select-all option should also be on by default.',
    {}],
  ['round-report-email', '8a82600', 'Email the roundee a summary after a round',
    'When a rounder finishes a round and asks to send the summary, nothing is sent: the feature was never finished. The person who was rounded should get an email with the round date, who rounded them, the template used, every question with the answer and any note, the recognitions given and the issues raised. If the round has no roundee to send to, saving should fail with a clear error instead of passing silently.',
    { 'src/adapters/auth_backend.py': 'import reorder only', 'src/config.py': 'test-mode flags for the task queue, not the feature', 'src/domain/entities/schemas/template': 'a TODO comment only' }],
];

const isNoise = (file) => /^(tests|src\/migrations|src\/assets)\//.test(file);

/** The corrected truth of one merge: `touched` are `git diff --name-status` rows [status, file]; `benchFiles` the tracked files at HEAD. */
export function truthOf({ touched, benchFiles, drops = {} }) {
  const files = touched.filter(([, file]) => !isNoise(file));
  const manual = [];
  const kept = [];
  for (const [, file] of files) {
    const reason = Object.entries(drops).find(([item]) => file === item || file.startsWith(`${item}/`));
    if (reason === undefined) kept.push(file);
    else manual.push({ item: file, reason: reason[1] });
  }
  const created = touched.filter(([status]) => status === 'A').map(([, file]) => file);
  const corrected = correctTruth({ relevant: kept, source: { missingFromSnapshot: created }, benchFiles });
  return { relevant: corrected.relevant, dropped: [...manual, ...corrected.dropped] };
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Writes `<out>/NN-<id>/{prompt.md,truth.json}`; `touchedOf(sha)` returns the merge's name-status rows. */
export function generate({ benchFiles, head, out, touchedOf }) {
  rmSync(out, { recursive: true, force: true });
  return K12.map(([id, sha, title, body, drops], at) => {
    const { relevant, dropped } = truthOf({ touched: touchedOf(sha), benchFiles, drops });
    if (relevant.length === 0) throw new Error(`${id}: no target left after the corrections`);
    const name = `k12-${id}-map`;
    const truth = { name, source: 'merge-diff', level: 'folder', ancestorShare: 0.3, merge: sha, relevant, allowed: [], ancestors: ancestorShares(relevant, benchFiles), dropped, bench: { head, files: benchFiles.length } };
    const dir = path.join(out, `${String(at + 1).padStart(2, '0')}-${slug(id)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'truth.json'), `${JSON.stringify(truth, null, 2)}\n`);
    writeFileSync(path.join(dir, 'prompt.md'), `---\nname: ${name}\ndescription: 'Synthetic ticket over a merge of a Python repository (map bench, second stack).'\ntags: ["map", "synthetic"]\n---\n\n${title}\n\n${body}\n`);
    return { dir: path.basename(dir), relevant: relevant.length, dropped };
  });
}

function main(argv) {
  const bench = argv[0];
  const flag = argv.indexOf('--out');
  const out = flag >= 0 ? path.resolve(argv[flag + 1]) : path.join(REPO, 'evals', 'local', 'bench', 'map-k12');
  if (!bench) throw new Error('usage: map-k12-cases.mjs <k12-checkout> [--out dir]');
  const git = (...args) => execFileSync('git', args, { cwd: bench, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
  const touchedOf = (sha) => git('diff', '--name-status', `${sha}^1`, sha).split('\n').filter(Boolean).map((row) => { const [status, file] = row.split('\t'); return [status[0], file]; });
  const rows = generate({ benchFiles: git('ls-files').split('\n').filter(Boolean), head: git('rev-parse', 'HEAD'), out, touchedOf });
  for (const row of rows) console.log(`${row.dir}: ${row.relevant} files kept, dropped ${JSON.stringify(row.dropped)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
