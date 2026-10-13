import path from 'node:path';
import type { ProjectConfig } from '#types/modules/config';
import type { Diagnostic, PackWithPrompts } from '#types/modules/policy';
import { listBuiltinPackFiles, packConstraints } from './builtin.ts';
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
  const constraints = await packConstraints(fs, builtinDirectory, project);

  const builtinFiles = project.packs.length === 0 && project.policyFiles.length === 0 ? [] : await listBuiltinPackFiles(fs, builtinDirectory);
  for (const reference of project.packs) {
    const id = reference.slice('builtin/'.length);
    const filePath = builtinFiles.find((file) => file.id === id)?.filePath ?? path.join(builtinDirectory, `${id}.yaml`);
    const raw = await readPackText(fs, filePath);
    if (raw === null) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-missing',
        message: `Built-in pack "${reference}" does not exist in this AMBICODE release; if it was renamed or split, see docs/rule-migration.md.`,
        where: filePath,
      });
      continue;
    }
    const validated = await validatePack(fs, { raw, filePath, reference, origin: 'builtin' }, constraints);
    diagnostics.push(...validated.diagnostics);
    if (validated.pack === null) continue;
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

  const set = validatePackSet(loaded, new Set(builtinFiles.map((file) => file.id)));
  return { packs: set.packs, diagnostics: [...diagnostics, ...set.diagnostics] };
}
