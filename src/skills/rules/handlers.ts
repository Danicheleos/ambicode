import { openWorkspace } from '#modules/config/workspace';
import { chainKey, loadPayload } from '#harness/engine/execute';
import { onGatePrint } from '#harness/gates/gates';
import { AmbicodeError } from '#util/errors';
import { blockingProblem, checkDrafts } from '#modules/policy/authoring/drafts';
import type { RouteArgs } from '#types/harness';
import type { DraftsCheck } from '#types/modules/policy';

/** Under the 16 KiB ledger-entry cap once the gate's own envelope (question, options, values) is added. */
const DISPOSITION_GATE_BYTES = 8_000;

/** One row per rule: applied, or not migrated with the reason. */
function disposition(check: DraftsCheck, root: string): string {
  const rows = check.rules.map((rule) => {
    const file = check.files.find((candidate) => candidate.packId === rule.split('/')[0]);
    const blocked = file === undefined ? undefined : blockingProblem(check, root, file.path);
    const failed = check.notMigrated.find((entry) => entry.rule === rule);
    return `- ${rule}: ${blocked !== undefined ? `not migrated: pack skipped (${blocked.code})` : failed !== undefined ? `not migrated: ${failed.reason}` : 'applied'}`;
  });
  const unusable = check.files.filter((file) => file.packId === null).map((file) => `- ${file.path}: not migrated: unusable pack`);
  const text = ['Disposition if you choose Apply all:', ...rows, ...unusable].join('\n');
  return Buffer.byteLength(text) <= DISPOSITION_GATE_BYTES ? text : `${text.slice(0, DISPOSITION_GATE_BYTES - 40)}\n[cut: ${check.rules.length} rules in all]`;
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
    return { line: disposition(check, workspace.repositoryRoot) };
  } catch (error) {
    if (error instanceof AmbicodeError) return null;
    throw error;
  }
});
