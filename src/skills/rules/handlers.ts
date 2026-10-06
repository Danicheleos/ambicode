import path from 'node:path';
import { openWorkspace } from '#composition/root';
import { loadConfigWithNotices } from '#modules/config/load';
import { chainKey, loadPayload, savePayload } from '#harness/engine/delivery';
import { latestBound } from '#harness/engine/fold';
import { tokenize } from '#harness/definition/flags';
import { onGatePrint } from '#harness/gates/gates';
import { AmbicodeError } from '#util/errors';
import { blockingProblem, checkDrafts } from '#modules/policy/authoring/drafts';
import { loadPacksForProject } from '#modules/policy/packs/load';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import { discoverRules } from '#modules/policy/authoring/rules';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { RouteArgs, Handler, HandlerInput, HandlerResult } from '#types/harness';
import { DRAFTS_DIR, type DraftsCheck } from '#types/modules/policy';

const NONE = 'none — stop';
/** Comfortably under the 16 KiB ledger-entry cap once the gate's own envelope (question, options, values) is added (09-T2/B13). */
const DISPOSITION_GATE_BYTES = 8_000;

function cap(text: string, bytes: number): string {
  if (Buffer.byteLength(text) <= bytes) return text;
  return `${Buffer.from(text).subarray(0, bytes - 8).toString('utf8').replace(/�$/, '')}\n[cut]`;
}

const failedWith = (error: unknown): HandlerResult => {
  if (error instanceof AmbicodeError) return { state: 'failed', code: error.code, message: error.message, recoverable: false };
  throw error;
};

async function chainEntries(input: HandlerInput): Promise<LedgerEntry[]> {
  const read = await input.ledger.read();
  return read.state === 'ok' ? read.entries.filter((entry) => input.view.chainIds.includes(entry.kind === 'route' ? entry.id : String(entry['route'] ?? ''))) : [];
}

/** One line per diagnostic and per rule that will not be migrated; what the draft step needs to fix. */
function checkText(check: DraftsCheck): string {
  const sources = Object.entries(check.rulesBySource).map(([location, count]) => `${location} (${count})`).join(', ');
  return [
    `Drafts: ${check.files.length} files, ${check.rules.length} rules. By source: ${sources || 'none'}`,
    ...check.diagnostics.filter((diagnostic) => diagnostic.severity !== 'notice').map((diagnostic) => `${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}`),
    ...check.notMigrated.map((entry) => `not migrated: ${entry.reason.split(':')[0]} ${entry.rule} (${entry.reason})`),
  ].join('\n');
}

/** The rules-table guidance: one row per rule, applied or not migrated with the reason, duplicates named (09-T2). */
function disposition(check: DraftsCheck, root: string): string {
  const rows = check.rules.map((rule) => {
    const [pack, name] = rule.split('/') as [string, string];
    const file = check.files.find((candidate) => candidate.packId === pack);
    const blocked = file === undefined ? undefined : blockingProblem(check, root, file.path);
    const failed = check.notMigrated.find((entry) => entry.rule === rule);
    const twin = check.diagnostics.find((diagnostic) => diagnostic.code === 'pack-duplicates-builtin' && diagnostic.message.includes(`rule "${name}"`) && diagnostic.where === path.join(root, file?.path ?? ''));
    const status = blocked !== undefined ? `not migrated: pack skipped (${blocked.code})` : failed !== undefined ? `not migrated: ${failed.reason}` : 'applied';
    return `- ${rule}: ${status}${twin === undefined ? '' : `; duplicates ${/built-in (\S+)/.exec(twin.message)?.[1] ?? 'a built-in rule'}`}`;
  });
  const unusable = check.files.filter((file) => file.packId === null).map((file) => `- ${file.path}: not migrated: unusable pack`);
  return ['Disposition if you choose Apply all:', ...rows, ...unusable, 'Apply with changes: say what to change and the drafts are revised. Discard drafts applies nothing and deletes nothing.'].join('\n');
}

async function checkFor(runtime: Runtime, dir: HandlerInput['dir'], project: string | null) {
  const workspace = await openWorkspace({ ...runtime, cwd: dir.repositoryRoot });
  return { workspace, check: await checkDrafts(runtime, workspace, { project, taskDir: dir }) };
}

onGatePrint('sources', async ({ runtime, dir, chain }) => {
  const first = chain.find((entry) => entry.kind === 'route');
  const found = first === undefined ? null : await loadPayload(runtime.fs, dir, first.id, 'rules.discover');
  return found === null || found.trim() === '' ? null : { line: found };
});

/** `rules-table.md` under the task's own steps directory: the full disposition, past any gate cap. */
const DISPOSITION_FILE = 'rules-table.md';

onGatePrint('rules-table', async ({ runtime, dir, chain }) => {
  const head = chain.findLast((entry) => entry.kind === 'route');
  try {
    const { workspace, check } = await checkFor(runtime, dir, ((head?.['args'] as RouteArgs | undefined)?.project ?? null));
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

/** Code steps of `routes/rules/rules.yaml` (09-T1). */
export const RULES_HANDLERS: Readonly<Record<string, Handler>> = {
  'rules.discover': async (input) => {
    const chosen = input.revise?.args['source']?.flatMap((value) => value.split(/[\s,]+/)).filter((value) => value !== '');
    try {
      return { state: 'ok', payload: cap((await discoverRules(input.runtime, chosen ?? tokenize(input.args.text), { task: input.view.task })).text, 2_048) };
    } catch (error) {
      return failedWith(error);
    }
  },

  'rules.context': async (input) => {
    if (latestBound(await chainEntries(input), 'sources')?.['answer'] === NONE) {
      return { state: 'failed', code: 'rules-no-sources', message: 'No rule source was chosen.', recoverable: false };
    }
    try {
      const { config } = await loadConfigWithNotices(input.runtime.fs, input.dir.repositoryRoot);
      const lines = ['Projects (pass --project <id> when there is more than one) and the rules already in force:'];
      for (const project of config.projects) {
        lines.push(`- ${project.id} root=${project.root} ecosystem=${project.ecosystem}`);
        const loaded = await loadPacksForProject({ fs: input.runtime.fs, project, builtinDirectory: builtinPoliciesDirectory(input.runtime.pluginRoot), repositoryRoot: input.dir.repositoryRoot });
        for (const pack of loaded.packs) lines.push(`  ${pack.pack.id}: ${pack.pack.rules.map((rule) => rule.id).join(', ')}`);
      }
      return { state: 'ok', payload: cap(lines.join('\n'), 4_096) };
    } catch (error) {
      return failedWith(error);
    }
  },

  'rules.draftsCheck': async (input) => {
    try {
      const { check } = await checkFor(input.runtime, input.dir, input.args.project);
      const window = await input.context.window(input.view, 'drafts-check');
      if (!window.some((entry) => entry.kind === 'policy' && entry['stage'] === 'drafts' && entry['contentHash'] === check.aggregateHash)) {
        await input.ledger.append({ kind: 'policy', route: input.view.routeId, stage: 'drafts', path: DRAFTS_DIR, contentHash: check.aggregateHash, drafts: check.files, errors: check.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length });
      }
      const text = checkText(check);
      if (check.ok) return { state: 'ok', payload: text };
      await savePayload(input.runtime.fs, input.dir, chainKey(input.view.chainIds), 'rules.draftsCheck', text);
      return { state: 'failed', code: check.diagnostics.find((diagnostic) => diagnostic.severity === 'error')!.code, message: text, recoverable: true };
    } catch (error) {
      return failedWith(error);
    }
  },

  'rules.close': async (input) => {
    const applied = (await chainEntries(input)).findLast((entry) => entry.kind === 'policy' && entry['stage'] === 'apply');
    if (applied === undefined) {
      return { state: 'ok', payload: `No pack was applied. The drafts stay in ${DRAFTS_DIR}/ and nothing was deleted; run /ambicode:rules again to apply them.` };
    }
    const table = await input.runtime.fs.readText(path.join(input.dir.steps, 'rules-apply.md')).catch(() => '');
    const runner = `node "${input.runtime.pluginRoot}/scripts/ambicode.mjs"`;
    return { state: 'ok', payload: `${table}\nShow this table to the user as it is. Undo one pack only if the user asks: ${runner} rules revert <pack-id>` };
  },
};
