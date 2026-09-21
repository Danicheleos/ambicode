import type { FileSystem } from '../ports/filesystem.ts';
import path from 'node:path';
import type { ProjectConfig } from '../contracts/config.ts';
import type { Diagnostic } from '../contracts/policy.ts';
import {
  readPackText,
  validatePack,
  validatePackSet,
  type PackWithPrompts,
} from './validate.ts';

/**
 * Re-exported so `src/policy/resolve.ts` and the commands keep importing the
 * loader's own vocabulary; the type itself belongs with the validation rules
 * that produce it.
 */
export type { PackWithPrompts } from './validate.ts';

export interface LoadPacksOptions {
  fs: FileSystem;
  project: ProjectConfig;
  /** `<pluginRoot>/policies`. */
  builtinDirectory: string;
  repositoryRoot: string;
}

export interface LoadedPacks {
  packs: PackWithPrompts[];
  diagnostics: Diagnostic[];
}

/**
 * Loads exactly the packs a project enabled. Packs are never activated because
 * a file happens to exist on disk (doc 05).
 *
 * Reading a file and knowing which files to read is this module's work; every
 * judgement about the content is `src/policy/validate.ts`, shared with
 * `ambicode policy check` so a candidate pack is held to the same rules as an
 * enabled one (R3 part 1).
 */
export async function loadPacksForProject(options: LoadPacksOptions): Promise<LoadedPacks> {
  const { fs, project, builtinDirectory, repositoryRoot } = options;
  const diagnostics: Diagnostic[] = [];
  const loaded: PackWithPrompts[] = [];
  const constraints = { commands: project.commands, projectId: project.id };

  for (const reference of project.packs) {
    const id = reference.slice('builtin/'.length);
    const filePath = path.join(builtinDirectory, `${id}.yaml`);
    const raw = await readPackText(fs, filePath);
    if (raw === null) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-missing',
        message: `Built-in pack "${reference}" does not exist in this AMBICODE release.`,
        where: filePath,
      });
      continue;
    }
    const validated = await validatePack(fs, { raw, filePath, reference, origin: 'builtin' }, constraints);
    diagnostics.push(...validated.diagnostics);
    if (validated.pack === null) continue;
    if (validated.pack.pack.id !== id) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-id-mismatch',
        message: `Built-in pack "${reference}" declares id "${validated.pack.pack.id}".`,
        where: filePath,
      });
      continue;
    }
    loaded.push(validated.pack);
  }

  for (const relativePath of project.policyFiles) {
    const filePath = path.join(repositoryRoot, relativePath);
    const raw = await readPackText(fs, filePath);
    if (raw === null) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-missing',
        message: `Policy file "${relativePath}" was not found. Project policy paths are relative to the repository root.`,
        where: filePath,
      });
      continue;
    }
    const validated = await validatePack(
      fs,
      { raw, filePath, reference: relativePath, origin: 'project' },
      constraints,
    );
    diagnostics.push(...validated.diagnostics);
    if (validated.pack !== null) loaded.push(validated.pack);
  }

  const set = validatePackSet(loaded);
  return { packs: set.packs, diagnostics: [...diagnostics, ...set.diagnostics] };
}
