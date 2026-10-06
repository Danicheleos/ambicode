import path from 'node:path';
import type { ProjectConfig } from '#types/modules/config';
import type { Diagnostic, PackWithPrompts } from '#types/modules/policy';
import { readPackText, validatePack, validatePackSet } from './validate.ts';
import type { FileSystem } from '#types/platform/ports';

export type { PackWithPrompts } from '#types/modules/policy';

interface LoadPacksOptions {
  fs: FileSystem;
  project: ProjectConfig;
  builtinDirectory: string;
  repositoryRoot: string;
}

interface LoadedPacks {
  packs: PackWithPrompts[];
  diagnostics: Diagnostic[];
}

/**
 * Loads exactly the packs a project enabled, never one because its file exists.
 * Content judgement is `validate.ts`, shared with `ambicode policy check`.
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
