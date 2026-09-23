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
  // The operands are the candidate pack files.
  positionals: true,
} as const;

/** How many matched paths a report names, per glob. */
const EXAMPLES_PER_GLOB = 3;

/**
 * Enumerated project paths a single glob is measured against before the report
 * gives up on an exact count. A setup-time command may walk a whole repository;
 * it may not hang on one.
 */
const MAX_GLOB_ENTRIES = 20_000;

export interface GlobMatch {
  glob: string;
  /** Project-relative files this glob matches today, after path exclusions. */
  matched: number;
  examples: string[];
  /** True when enumeration hit `MAX_GLOB_ENTRIES` and `matched` is a floor. */
  truncated: boolean;
}

export interface CheckedPackFile {
  /** Repository-relative, as it would be written into `policyFiles`. */
  path: string;
  /** Null when the file could not be parsed or validated. */
  packId: string | null;
  authority: string | null;
  appliesTo: GlobMatch[];
  rules: number;
  prompts: number;
  commandDecisions: number;
}

export interface PolicyCheckOutput {
  command: 'policy-check';
  /** The project whose root, layout and command catalog the check used. */
  projectId: string | null;
  files: CheckedPackFile[];
  diagnostics: Diagnostic[];
  /** False when any diagnostic is an error; the process exits nonzero. */
  ok: boolean;
}

/**
 * Validates candidate policy pack files that are not yet referenced from
 * `.ambicode/config.yaml` (R3 part 1).
 *
 * `ambicode policy` answers "what applies here" for an already-configured
 * project. This answers the question that comes first, while a pack is being
 * authored: is this file a valid pack, and does its scope match anything that
 * actually exists? Both questions are answered by one set of rules — the
 * checks come from `src/policy/validate.ts`, which the loader also calls, and
 * glob matching uses `matchesGlob`, the resolver's own matcher — so a file
 * this command calls clean cannot be rejected once it is wired in.
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
 * The project whose layout and command catalog the candidate is judged
 * against. An explicit `--project` wins; a single-project repository needs no
 * flag; anything else is reported as undetermined rather than resolved to the
 * first project, because scoping a pack to the wrong root would make every
 * glob count meaningless.
 */
function resolveProject(config: AmbicodeConfig, requested: string | null): ProjectConfig | null {
  if (requested !== null) return projectById(config, requested);
  return config.projects.length === 1 ? (config.projects[0] ?? null) : null;
}

/**
 * Duplicate ids and `replaces`, judged against the packs the project already
 * enables — the candidates are appended to that set exactly as wiring them in
 * would. Only diagnostics that name a candidate file are reported: a problem
 * in the project's existing configuration is `ambicode policy`'s subject, not
 * this command's, and blaming the candidate for it would be wrong.
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

/**
 * What each `appliesTo` glob matches in the repository as it stands. The
 * schema cannot see this, and a glob scoped to a path that does not exist is
 * the most likely authoring mistake: the pack validates, is enabled, and never
 * applies to anything.
 *
 * `appliesTo` is project-relative (doc 05), so enumeration starts at the
 * project root. Discovery uses `fs.glob`; the decision uses `matchesGlob`,
 * which is what `src/policy/resolve.ts` itself matches with, so a count here
 * cannot claim a match the resolver would not make.
 */
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
      // An unusable pattern matches nothing, which the caller reports as such.
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
      // A glob such as `**/*` matches directories too; a rule applies to files.
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
