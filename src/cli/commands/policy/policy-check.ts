import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '#types/modules/config';
import { DRAFTS_DIR, type Diagnostic, type PackConstraints, type PackWithPrompts } from '#types/modules/policy';
import { openWorkspace, projectById, toRepositoryRelative } from '#composition/root';
import { checkDrafts } from '#modules/policy/authoring/drafts';
import { loadPacksForProject } from '#modules/policy/packs/load';
import { readPackText, validatePack, validatePackSet } from '#modules/policy/packs/validate';
import { pathExclusionReason } from '#modules/review/snapshot/exclusions';
import { AmbicodeError } from '#util/errors';
import { matchesGlob } from '#util/glob';
import { normalizeRelative } from '#util/paths';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import { openRouteView, ledgerRouteContext } from '#harness/engine/context';
import { runCommandTail } from '#harness/engine/command-tail';
import { withLedgerLock } from '#modules/evidence/ledger/ledger-lock';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { routeTools } from '../route/route.ts';
import type { Runtime, Workspace } from '#types/composition';
import type { FileSystem } from '#types/platform/ports';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const POLICY_CHECK_OPTIONS = {
  values: ['project', 'task'],
  flags: ['json', 'drafts'],
  positionals: true,
} as const;

const EXAMPLES_PER_GLOB = 3;

/**
 * Paths one glob is measured against before the report gives up on an exact count: a
 * setup-time command may walk a whole repository, not hang on one.
 */
const MAX_GLOB_ENTRIES = 20_000;

interface GlobMatch {
  glob: string;
  matched: number;
  examples: string[];
  /** True when enumeration hit `MAX_GLOB_ENTRIES` and `matched` is a floor. */
  truncated: boolean;
}

interface CheckedPackFile {
  path: string;
  packId: string | null;
  authority: string | null;
  appliesTo: GlobMatch[];
  rules: number;
  prompts: number;
  commandDecisions: number;
}

export interface PolicyCheckOutput {
  command: 'policy-check';
  projectId: string | null;
  files: CheckedPackFile[];
  diagnostics: Diagnostic[];
  ok: boolean;
  /** Present with `--drafts`. */
  drafts?: { rulesBySource: Record<string, number>; rules: number; notMigrated: { rule: string; reason: string }[]; aggregateHash: string };
  /** The next step of the task's rules route, printed by the command tail. */
  next?: string;
}

/**
 * Validates every draft under `DRAFTS_DIR` (09-Q2); with `--task` naming the caller's live rules route the result is
 * recorded once and the route's tail runs.
 */
async function runDraftsCheck(runtime: Runtime, args: ParsedArgs): Promise<PolicyCheckOutput> {
  if (args.positionals.length > 0) {
    throw new AmbicodeError('bad-argument', '"policy check --drafts" checks the whole drafts directory and takes no files.', { field: 'policy check', details: [`Drafts live in ${DRAFTS_DIR}/.`] });
  }
  const workspace = await openWorkspace(runtime);
  const task = args.value('task');
  const dir = task === null ? null : await resolveTaskDir(runtime, task);
  const check = await checkDrafts(runtime, workspace, { project: args.value('project'), taskDir: dir });
  const output: PolicyCheckOutput = {
    command: 'policy-check',
    projectId: args.value('project') ?? (workspace.config.projects.length === 1 ? workspace.config.projects[0]!.id : null),
    files: check.files.map((file) => ({ path: file.path, packId: file.packId, authority: null, appliesTo: [], rules: check.rules.filter((rule) => rule.startsWith(`${file.packId}/`)).length, prompts: 0, commandDecisions: 0 })),
    diagnostics: check.diagnostics,
    ok: check.ok,
    drafts: { rulesBySource: check.rulesBySource, rules: check.rules.length, notMigrated: check.notMigrated, aggregateHash: check.aggregateHash },
  };
  if (task === null || dir === null) return output;

  const tools = await routeTools(runtime, task);
  const session = tools.binding.state === 'bound' ? tools.binding.session : null;
  const view = session === null ? null : await openRouteView(runtime, tools.routes, task, session);
  if (view === null || view.skill !== 'rules') {
    output.diagnostics.push({ severity: 'notice', code: 'drafts-not-recorded', message: `Task ${task} has no live rules route of this session, so nothing was recorded.` });
    return output;
  }
  await ledgerRouteContext({ runtime, routes: tools.routes }).assertOwner(view);
  await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), view.session, (ledger) =>
    ledger.append({ kind: 'policy', route: view.routeId, stage: 'drafts', path: DRAFTS_DIR, contentHash: check.aggregateHash, drafts: check.files, errors: check.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length }),
  );
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'policy check --drafts', session: tools.binding });
  if (next !== null) output.next = next.text;
  return output;
}

/**
 * Validates candidate packs not yet referenced from config, using the loader's own validator
 * and the resolver's `matchesGlob`, so a file called clean here cannot be rejected once wired in.
 */
export async function runPolicyCheck(runtime: Runtime, args: ParsedArgs): Promise<PolicyCheckOutput> {
  if (args.flag('drafts')) return runDraftsCheck(runtime, args);
  if (args.value('task') !== null) throw new AmbicodeError('bad-argument', '--task goes with --drafts.', { field: 'task' });
  const workspace = await openWorkspace(runtime);
  if (args.positionals.length === 0) {
    throw new AmbicodeError('bad-argument', '"policy check" needs at least one candidate policy file.', {
      field: 'policy check',
      details: ['Usage: ambicode policy check .ambicode/policies/<id>.yaml [more...]'],
    });
  }

  const project = resolveProject(workspace.config, args.value('project'));
  const diagnostics: Diagnostic[] = [];
  if (project === null) {
    diagnostics.push({
      severity: 'notice',
      code: 'project-not-determined',
      message: `This repository configures ${workspace.config.projects.length} projects and no --project was given, so the pack's scope was not measured against a project layout and its command references were not checked. Pass --project <id>.`,
      where: workspace.configPath,
    });
  }

  const constraints: PackConstraints =
    project === null
      ? { commands: null, projectId: null }
      : { commands: project.commands, projectId: project.id };

  const files: CheckedPackFile[] = [];
  const candidates: PackWithPrompts[] = [];

  for (const operand of args.positionals) {
    const relativePath = await toRepositoryRelative(workspace, operand);
    const filePath = path.join(workspace.repositoryRoot, relativePath);
    const raw = await readPackText(runtime.fs, filePath);
    if (raw === null) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-missing',
        message: `Candidate policy file "${relativePath}" was not found.`,
        where: filePath,
      });
      files.push(unreadable(relativePath));
      continue;
    }

    const validated = await validatePack(
      runtime.fs,
      { raw, filePath, reference: relativePath, origin: 'project' },
      constraints,
    );
    diagnostics.push(...validated.diagnostics);
    if (validated.pack === null) {
      files.push(unreadable(relativePath));
      continue;
    }

    const pack = validated.pack.pack;
    const globs = await describeGlobs(runtime.fs, workspace, project, pack.appliesTo);
    for (const glob of globs) {
      if (glob.matched > 0 || project === null) continue;
      diagnostics.push({
        severity: 'warning',
        code: 'pack-glob-matches-nothing',
        message: `${relativePath}: appliesTo glob "${glob.glob}" matches no file under project "${project.id}" (root "${project.root}") today. A rule scoped to a path that does not exist never applies; derive the glob from the repository's actual layout.`,
        where: filePath,
      });
    }

    candidates.push(validated.pack);
    files.push({
      path: relativePath,
      packId: pack.id,
      authority: pack.authority,
      appliesTo: globs,
      rules: pack.rules.length,
      prompts: pack.prompts.length,
      commandDecisions: pack.commandPolicy.length,
    });
  }

  if (project !== null && candidates.length > 0) {
    diagnostics.push(...(await crossPackDiagnostics(workspace, project, candidates)));
  }

  const ok = !diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return {
    command: 'policy-check',
    projectId: project?.id ?? null,
    files,
    diagnostics,
    ok,
  };
}

function unreadable(relativePath: string): CheckedPackFile {
  return { path: relativePath, packId: null, authority: null, appliesTo: [], rules: 0, prompts: 0, commandDecisions: 0 };
}

/**
 * An explicit `--project` wins and a single project needs no flag; otherwise undetermined, not
 * the first project, because the wrong root makes every glob count meaningless.
 */
function resolveProject(config: AmbicodeConfig, requested: string | null): ProjectConfig | null {
  if (requested !== null) return projectById(config, requested);
  return config.projects.length === 1 ? (config.projects[0] ?? null) : null;
}

/**
 * Judged against the packs the project already enables. Only diagnostics naming a candidate
 * are reported: problems in the existing configuration are `ambicode policy`'s subject.
 */
async function crossPackDiagnostics(
  workspace: Workspace,
  project: ProjectConfig,
  candidates: readonly PackWithPrompts[],
): Promise<Diagnostic[]> {
  const enabled = await loadPacksForProject({
    fs: workspace.runtime.fs,
    project,
    builtinDirectory: builtinPoliciesDirectory(workspace.runtime.pluginRoot),
    repositoryRoot: workspace.repositoryRoot,
  });

  // A candidate that is already listed in `policyFiles` — a re-check after
  // wiring it in — must not be reported as a duplicate of itself.
  const candidatePaths = new Set(candidates.map((candidate) => candidate.filePath));
  const others = enabled.packs.filter((loaded) => !candidatePaths.has(loaded.filePath));
  const set = validatePackSet([...others, ...candidates]);

  const diagnostics = set.diagnostics.filter(
    (diagnostic) => diagnostic.where !== undefined && candidatePaths.has(diagnostic.where),
  );

  if (enabled.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    diagnostics.push({
      severity: 'notice',
      code: 'enabled-packs-have-errors',
      message: `Project "${project.id}" already has errors in the packs it enables, reported separately by "ambicode policy --project ${project.id}". They are not attributed to the candidate files checked here.`,
      where: workspace.configPath,
    });
  }
  return diagnostics;
}

async function describeGlobs(
  fs: FileSystem,
  workspace: Workspace,
  project: ProjectConfig | null,
  globs: readonly string[],
): Promise<GlobMatch[]> {
  if (project === null) {
    return globs.map((glob) => ({ glob, matched: 0, examples: [], truncated: false }));
  }
  const projectRoot = path.join(workspace.repositoryRoot, normalizeRelative(project.root));
  const described: GlobMatch[] = [];

  for (const glob of globs) {
    let entries: string[];
    try {
      entries = await fs.glob(glob, projectRoot);
    } catch {
      described.push({ glob, matched: 0, examples: [], truncated: false });
      continue;
    }

    const truncated = entries.length > MAX_GLOB_ENTRIES;
    const examined = truncated ? entries.slice(0, MAX_GLOB_ENTRIES) : entries;
    const matched: string[] = [];

    for (const entry of examined) {
      const relative = normalizeRelative(entry);
      if (relative === '') continue;
      if (pathExclusionReason(relative) !== null) continue;
      if (!matchesGlob(relative, glob)) continue;
      if (!(await isFile(fs, path.join(projectRoot, relative)))) continue;
      matched.push(relative);
    }

    matched.sort();
    described.push({
      glob,
      matched: matched.length,
      examples: matched.slice(0, EXAMPLES_PER_GLOB),
      truncated,
    });
  }
  return described;
}

async function isFile(fs: FileSystem, absolutePath: string): Promise<boolean> {
  try {
    return (await fs.lstat(absolutePath)).isFile();
  } catch {
    return false;
  }
}

export function renderPolicyCheck(output: PolicyCheckOutput): string {
  const lines = [
    `project: ${output.projectId ?? '(not determined)'}`,
    `files:   ${output.files.length}`,
    '',
  ];

  for (const file of output.files) {
    lines.push(`${file.path}`);
    if (file.packId === null) {
      lines.push('  (not a usable pack — see the diagnostics below)');
      lines.push('');
      continue;
    }
    lines.push(`  id: ${file.packId}  authority: ${file.authority}`);
    lines.push(`  rules: ${file.rules}  prompts: ${file.prompts}  command decisions: ${file.commandDecisions}`);
    lines.push('  appliesTo');
    for (const glob of file.appliesTo) {
      const count = `${glob.matched}${glob.truncated ? '+' : ''} file${glob.matched === 1 && !glob.truncated ? '' : 's'}`;
      const examples = glob.examples.length === 0 ? '' : `  e.g. ${glob.examples.join(', ')}`;
      lines.push(`    ${glob.glob}  -> ${count}${examples}`);
    }
    lines.push('');
  }

  if (output.diagnostics.length > 0) {
    lines.push('diagnostics');
    for (const diagnostic of output.diagnostics) {
      lines.push(`  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
    }
    lines.push('');
  }

  if (output.drafts !== undefined) {
    const sources = Object.entries(output.drafts.rulesBySource).map(([location, count]) => `  ${location}: ${count}`);
    lines.push(`rules: ${output.drafts.rules}`, 'rules by source', ...sources, '');
    for (const entry of output.drafts.notMigrated) lines.push(`not migrated: ${entry.rule} (${entry.reason})`);
    if (output.drafts.notMigrated.length > 0) lines.push('');
  }

  lines.push(
    output.ok
      ? 'No errors. These files can be added to the project\'s policyFiles.'
      : 'Errors above. Fix them before adding these files to the project\'s policyFiles.',
  );
  if (output.next !== undefined) lines.push('', output.next);
  return lines.join('\n');
}

export const policyCheckCommand: CliCommand = {
  name: 'policy check',
  options: POLICY_CHECK_OPTIONS,
  run: async (runtime, args) => {
    const output = await runPolicyCheck(runtime, args);
    return { text: renderPolicyCheck(output), data: output, ...(output.ok ? {} : { exitCode: 1 }) };
  },
};
