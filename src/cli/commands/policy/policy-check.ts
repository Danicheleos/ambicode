import path from 'node:path';
import { DRAFTS_DIR, type Diagnostic } from '#types/modules/policy';
import { openWorkspace, projectById, toRepositoryRelative } from '#modules/config/workspace';
import { checkDrafts } from '#modules/policy/authoring/drafts';
import { readPackText, validatePack } from '#modules/policy/packs/validate';
import { AmbicodeError } from '#util/errors';
import { COMMAND_SPECS } from '#skills/rules/commands';
import { runCommandTail } from '#harness/engine/engine';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { routeTools } from '../route/route.ts';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const POLICY_CHECK_OPTIONS = { values: ['project', 'task'], flags: ['json', 'drafts'], positionals: true } as const;

export interface PolicyCheckOutput {
  command: 'policy-check';
  files: { path: string; packId: string | null }[];
  diagnostics: Diagnostic[];
  ok: boolean;
  /** Present with `--drafts`. */
  drafts?: { rulesBySource: Record<string, number>; rules: number; notMigrated: { rule: string; reason: string }[]; aggregateHash: string };
  /** The next step of the task's rules route, printed by the command tail. */
  next?: string;
}

/**
 * Validates every draft under `DRAFTS_DIR` (09-Q2); with `--task` naming the caller's live rules route a result
 * without errors is recorded once and the route's tail runs.
 */
async function runDraftsCheck(runtime: Runtime, args: ParsedArgs): Promise<PolicyCheckOutput> {
  if (args.positionals.length > 0) throw new AmbicodeError('bad-argument', '"policy check --drafts" checks the whole drafts directory and takes no files.', { field: 'policy check', details: [`Drafts live in ${DRAFTS_DIR}/.`] });
  const workspace = await openWorkspace(runtime);
  const task = args.value('task');
  const dir = task === null ? null : await resolveTaskDir(runtime, task);
  const check = await checkDrafts(runtime, workspace, { project: args.value('project') });
  const output: PolicyCheckOutput = {
    command: 'policy-check',
    files: check.files.map((file) => ({ path: file.path, packId: file.packId })),
    diagnostics: check.diagnostics,
    ok: check.ok,
    drafts: { rulesBySource: check.rulesBySource, rules: check.rules.length, notMigrated: check.notMigrated, aggregateHash: check.aggregateHash },
  };
  // Only a clean check is evidence: the route's draft step stays open until the drafts pass, so the model fixes what this lists.
  if (task === null || dir === null || !check.ok) return output;

  const tools = await routeTools(runtime, task);
  const { view, context } = await tools.engine.command(COMMAND_SPECS.policyCheckDrafts, { task }, async (scope) => scope);
  if (view === null || view.skill !== 'rules') {
    output.diagnostics.push({ severity: 'notice', code: 'drafts-not-recorded', message: `Task ${task} has no live rules route of this session, so nothing was recorded.` });
    return output;
  }
  await context.assertOwner(view);
  await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), view.session, (ledger) =>
    ledger.append({ kind: 'policy', route: view.routeId, stage: 'drafts', path: DRAFTS_DIR, contentHash: check.aggregateHash, drafts: check.files, errors: check.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length }),
  );
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'policy check --drafts', session: tools.binding });
  if (next !== null) output.next = next.text;
  return output;
}

/** Validates candidate packs with the loader's own validator, so a file called clean here is not rejected once wired in. */
export async function runPolicyCheck(runtime: Runtime, args: ParsedArgs): Promise<PolicyCheckOutput> {
  if (args.flag('drafts')) return runDraftsCheck(runtime, args);
  if (args.value('task') !== null) throw new AmbicodeError('bad-argument', '--task goes with --drafts.', { field: 'task' });
  if (args.positionals.length === 0) throw new AmbicodeError('bad-argument', '"policy check" needs at least one candidate policy file.', { field: 'policy check', details: ['Usage: ambicode policy check .ambicode/policies/<id>.yaml [more...]'] });
  const workspace = await openWorkspace(runtime);
  const requested = args.value('project');
  const project = requested !== null ? projectById(workspace.config, requested) : workspace.config.projects.length === 1 ? workspace.config.projects[0]! : null;
  const constraints = project === null ? { commands: null, projectId: null } : { commands: { ...project.commands, ...project.checks }, projectId: project.id };
  const diagnostics: Diagnostic[] = [];
  const files: PolicyCheckOutput['files'] = [];
  for (const operand of args.positionals) {
    const relativePath = await toRepositoryRelative(workspace, operand);
    const filePath = path.join(workspace.repositoryRoot, relativePath);
    const raw = await readPackText(runtime.fs, filePath);
    if (raw === null) diagnostics.push({ severity: 'error', code: 'pack-missing', message: `Candidate policy file "${relativePath}" was not found.`, where: filePath });
    const validated = raw === null ? null : await validatePack(runtime.fs, { raw, filePath, reference: relativePath, origin: 'project' }, constraints);
    diagnostics.push(...(validated?.diagnostics ?? []));
    files.push({ path: relativePath, packId: validated?.pack?.pack.id ?? null });
  }
  return { command: 'policy-check', files, diagnostics, ok: !diagnostics.some((diagnostic) => diagnostic.severity === 'error') };
}

function renderPolicyCheck(output: PolicyCheckOutput): string {
  const lines = output.files.map((file) => `${file.path}: ${file.packId ?? 'not a usable pack'}`);
  for (const diagnostic of output.diagnostics) lines.push(`[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
  for (const entry of output.drafts?.notMigrated ?? []) lines.push(`not migrated: ${entry.rule} (${entry.reason})`);
  lines.push(output.ok ? 'No errors.' : 'Errors above.');
  if (output.next !== undefined) lines.push('', output.next);
  return lines.join('\n');
}

export const policyCheckCommand: CliCommand = {
  name: 'policy check',
  summary: 'Validate candidate policy pack files; nonzero exit on an error.',
  options: POLICY_CHECK_OPTIONS,
  run: async (runtime, args) => {
    const output = await runPolicyCheck(runtime, args);
    return { text: renderPolicyCheck(output), data: output, ...(output.ok ? {} : { exitCode: 1 }) };
  },
};
