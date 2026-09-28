import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '../../contracts/config.ts';
import type { Diagnostic } from '../../contracts/policy.ts';
import { openWorkspace, projectById, toRepositoryRelative, type Runtime, type Workspace } from '../../composition/root.ts';
import type { FileSystem } from '../../ports/filesystem.ts';
import { loadPacksForProject } from '../../policy/load.ts';
import {
  readPackText,
  validatePack,
  validatePackSet,
  type PackConstraints,
  type PackWithPrompts,
} from '../../policy/validate.ts';
import { pathExclusionReason } from '../../snapshot/exclusions.ts';
import { AmbicodeError } from '../../util/errors.ts';
import { matchesGlob } from '../../util/glob.ts';
import { normalizeRelative } from '../../util/paths.ts';
import { builtinPoliciesDirectory } from '../../util/plugin-root.ts';
import type { ParsedArgs } from '../args.ts';

export const POLICY_CHECK_OPTIONS = {
  values: ['project'],
  flags: ['json'],
  positionals: true,
} as const;

const EXAMPLES_PER_GLOB = 3;

/**
 * Paths one glob is measured against before the report gives up on an exact count: a
 * setup-time command may walk a whole repository, not hang on one.
 */
const MAX_GLOB_ENTRIES = 20_000;

export interface GlobMatch {
  glob: string;
  matched: number;
  examples: string[];
  /** True when enumeration hit `MAX_GLOB_ENTRIES` and `matched` is a floor. */
  truncated: boolean;
}

export interface CheckedPackFile {
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
}

/**
 * Validates candidate packs not yet referenced from config, using the loader's own validator
 * and the resolver's `matchesGlob`, so a file called clean here cannot be rejected once wired in.
 */
export async function runPolicyCheck(runtime: Runtime, args: ParsedArgs): Promise<PolicyCheckOutput> {
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

  lines.push(
    output.ok
      ? 'No errors. These files can be added to the project\'s policyFiles.'
      : 'Errors above. Fix them before adding these files to the project\'s policyFiles.',
  );
  return lines.join('\n');
}
