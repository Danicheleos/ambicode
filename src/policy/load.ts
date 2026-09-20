import type { FileSystem } from '../ports/filesystem.ts';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ProjectConfig } from '../contracts/config.ts';
import { PolicyPack, type Diagnostic, type LoadedPack, type ResolvedPromptRef } from '../contracts/policy.ts';
import { describeIssues } from '../config/load.ts';
import { AmbicodeError } from '../util/errors.ts';
import { contentHash } from '../util/hash.ts';
import { resolveInsideBoundary } from '../util/paths.ts';

export interface PackWithPrompts extends LoadedPack {
  resolvedPrompts: ResolvedPromptRef[];
}

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
 */
export async function loadPacksForProject(options: LoadPacksOptions): Promise<LoadedPacks> {
  const { fs, project, builtinDirectory, repositoryRoot } = options;
  const diagnostics: Diagnostic[] = [];
  const loaded: PackWithPrompts[] = [];

  for (const reference of project.packs) {
    const id = reference.slice('builtin/'.length);
    const filePath = path.join(builtinDirectory, `${id}.yaml`);
    const pack = await loadOne(fs, filePath, reference, 'builtin', diagnostics, project);
    if (pack === null) continue;
    if (pack.pack.id !== id) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-id-mismatch',
        message: `Built-in pack "${reference}" declares id "${pack.pack.id}".`,
        where: filePath,
      });
      continue;
    }
    if (pack.pack.replaces !== undefined) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-replaces-builtin',
        message: `Built-in pack "${reference}" must not declare "replaces".`,
        where: filePath,
      });
      continue;
    }
    loaded.push(pack);
  }

  for (const relativePath of project.policyFiles) {
    const filePath = path.join(repositoryRoot, relativePath);
    const pack = await loadOne(fs, filePath, relativePath, 'project', diagnostics, project);
    if (pack !== null) loaded.push(pack);
  }

  return { packs: applyReplacements(loaded, diagnostics), diagnostics };
}

/**
 * A project pack replaces a built-in only when it says so explicitly.
 * Replacement is whole-pack, and the replaced reference stays visible (doc 05).
 */
function applyReplacements(packs: PackWithPrompts[], diagnostics: Diagnostic[]): PackWithPrompts[] {
  const replacedIds = new Map<string, PackWithPrompts>();
  for (const pack of packs) {
    if (pack.pack.replaces === undefined) continue;
    if (pack.origin !== 'project') {
      diagnostics.push({
        severity: 'error',
        code: 'pack-replaces-not-project',
        message: `Only a project policy file may declare "replaces"; ${pack.reference} is a built-in.`,
        where: pack.filePath,
      });
      continue;
    }
    replacedIds.set(pack.pack.replaces, pack);
  }

  const kept: PackWithPrompts[] = [];
  const seenIds = new Map<string, PackWithPrompts>();

  for (const pack of packs) {
    const replacement = replacedIds.get(pack.reference);
    if (replacement !== undefined && pack.origin === 'builtin') {
      replacement.replacedReference = pack.reference;
      continue; // Superseded whole, not merged.
    }
    const existing = seenIds.get(pack.pack.id);
    if (existing !== undefined) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-duplicate-id',
        message: `Two enabled packs declare id "${pack.pack.id}" (${existing.reference} and ${pack.reference}). Add "replaces: builtin/${pack.pack.id}" if the project pack is meant to supersede the built-in.`,
        where: pack.filePath,
      });
      continue;
    }
    seenIds.set(pack.pack.id, pack);
    kept.push(pack);
  }

  for (const [reference, replacement] of replacedIds) {
    if (replacement.replacedReference === undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'pack-replaces-unused',
        message: `${replacement.reference} declares "replaces: ${reference}", but that pack is not enabled for this project.`,
        where: replacement.filePath,
      });
    }
  }
  return kept;
}

async function loadOne(
  fs: FileSystem,
  filePath: string,
  reference: string,
  origin: 'builtin' | 'project',
  diagnostics: Diagnostic[],
  project: ProjectConfig,
): Promise<PackWithPrompts | null> {
  let raw: string;
  try {
    raw = await fs.readText(filePath);
  } catch {
    diagnostics.push({
      severity: 'error',
      code: 'pack-missing',
      message:
        origin === 'builtin'
          ? `Built-in pack "${reference}" does not exist in this AMBICODE release.`
          : `Policy file "${reference}" was not found. Project policy paths are relative to the repository root.`,
      where: filePath,
    });
    return null;
  }

  let document: unknown;
  try {
    document = parseYaml(raw);
  } catch (cause) {
    diagnostics.push({
      severity: 'error',
      code: 'pack-unparsable',
      message: `${reference} is not valid YAML: ${cause instanceof Error ? cause.message : String(cause)}`,
      where: filePath,
    });
    return null;
  }

  const parsed = PolicyPack.safeParse(document);
  if (!parsed.success) {
    for (const detail of describeIssues(parsed.error)) {
      diagnostics.push({ severity: 'error', code: 'pack-invalid', message: `${reference}: ${detail}`, where: filePath });
    }
    return null;
  }

  const pack = parsed.data;
  const packDirectory = path.dirname(filePath);
  const resolvedPrompts: ResolvedPromptRef[] = [];

  for (const promptRef of pack.prompts) {
    try {
      const absolutePath = await resolveInsideBoundary(
        fs,
        packDirectory,
        promptRef.file,
        `prompt "${promptRef.file}" referenced by ${reference}`,
      );
      const contents = await fs.readText(absolutePath);
      resolvedPrompts.push({
        packId: pack.id,
        packReference: reference,
        stage: promptRef.stage,
        absolutePath,
        declaredPath: promptRef.file,
        contentHash: contentHash(contents),
      });
    } catch (error) {
      diagnostics.push({
        severity: 'error',
        code: error instanceof AmbicodeError ? error.code : 'prompt-unreadable',
        message: `${reference}: ${error instanceof Error ? error.message : String(error)}`,
        where: filePath,
      });
    }
  }

  // A rule or decision naming a command the project does not declare is a
  // configuration error the operator can act on, not a silent no-op (U03).
  for (const decision of pack.commandPolicy) {
    if (!Object.hasOwn(project.commands, decision.command)) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-unknown-command',
        message: `${reference} declares a "${decision.action}" decision for command "${decision.command}", which project "${project.id}" does not declare. Add it to the command catalog, as null if it is not configured yet.`,
        where: filePath,
      });
    }
  }
  for (const rule of pack.rules) {
    if (rule.check.kind === 'command' && !Object.hasOwn(project.commands, rule.check.command)) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-unknown-command',
        message: `${reference}: rule "${rule.id}" is verified by command "${rule.check.command}", which project "${project.id}" does not declare.`,
        where: filePath,
      });
    }
  }

  return {
    pack,
    reference,
    origin,
    filePath,
    contentHash: contentHash(raw),
    resolvedPrompts,
  };
}
