import path from 'node:path';
import { openWorkspace } from '#modules/config/workspace';
import { chainKey, loadPayload } from '#harness/engine/execute';
import { onGatePrint } from '#harness/gates/gates';
import { AmbicodeError } from '#util/errors';
import { blockingProblem, checkDrafts } from '#modules/policy/authoring/drafts';
import type { RouteArgs } from '#types/harness';
import type { DraftsCheck } from '#types/modules/policy';

/** Comfortably under the 16 KiB ledger-entry cap once the gate's own envelope (question, options, values) is added (09-T2/B13). */
const DISPOSITION_GATE_BYTES = 8_000;
/** `rules-table.md` under the task's own steps directory: the full disposition, past any gate cap. */
const DISPOSITION_FILE = 'rules-table.md';

function cap(text: string, bytes: number): string {
  if (Buffer.byteLength(text) <= bytes) return text;
  return `${Buffer.from(text).subarray(0, bytes - 8).toString('utf8').replace(/�$/, '')}\n[cut]`;
}

/** The rules-table guidance: one row per rule, applied or not migrated with the reason (09-T2). */
function disposition(check: DraftsCheck, root: string): string {
  const rows = check.rules.map((rule) => {
    const [pack] = rule.split('/') as [string];
    const file = check.files.find((candidate) => candidate.packId === pack);
    const blocked = file === undefined ? undefined : blockingProblem(check, root, file.path);
    const failed = check.notMigrated.find((entry) => entry.rule === rule);
    return `- ${rule}: ${blocked !== undefined ? `not migrated: pack skipped (${blocked.code})` : failed !== undefined ? `not migrated: ${failed.reason}` : 'applied'}`;
  });
  const unusable = check.files.filter((file) => file.packId === null).map((file) => `- ${file.path}: not migrated: unusable pack`);
  return ['Disposition if you choose Apply all:', ...rows, ...unusable, 'Apply with changes: say what to change and the drafts are revised. Discard drafts applies nothing and deletes nothing.'].join('\n');
}

onGatePrint('sources', async ({ runtime, dir, chain }) => {
  const found = await loadPayload(runtime.fs, dir, chainKey(chain.filter((entry) => entry.kind === 'route').map((entry) => entry.id).reverse()), 'script:discover');
  return found === null || found.trim() === '' ? null : { line: found };
});

onGatePrint('rules-table', async ({ runtime, dir, chain }) => {
  const head = chain.findLast((entry) => entry.kind === 'route');
  try {
    const workspace = await openWorkspace({ ...runtime, cwd: dir.repositoryRoot });
    const check = await checkDrafts(runtime, workspace, { project: (head?.['args'] as RouteArgs | undefined)?.project ?? null });
    const full = disposition(check, workspace.repositoryRoot);
    if (Buffer.byteLength(full) <= DISPOSITION_GATE_BYTES) return { line: full };
    await runtime.fs.mkdirp(dir.steps);
    await runtime.fs.writeText(path.join(dir.steps, DISPOSITION_FILE), full);
    return { line: cap(full, DISPOSITION_GATE_BYTES - 120) + `\n(The full disposition, ${check.rules.length} rules, is at ${path.relative(dir.repositoryRoot, path.join(dir.steps, DISPOSITION_FILE))}; read it before answering.)` };
  } catch (error) {
    if (error instanceof AmbicodeError) return null;
    throw error;
  }
});
