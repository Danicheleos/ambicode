import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describeIssues } from '../config/load.ts';
import { PolicyPack, type Diagnostic, type LoadedPack, type ResolvedPromptRef } from '../contracts/policy.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { AmbicodeError } from '../util/errors.ts';
import { contentHash } from '../util/hash.ts';
import { resolveInsideBoundary } from '../util/paths.ts';

export interface PackWithPrompts extends LoadedPack {
  resolvedPrompts: ResolvedPromptRef[];
}

export interface PackSource {
  raw: string;
  filePath: string;
  reference: string;
  origin: 'builtin' | 'project';
}

export interface PackConstraints {
  /**
   * `null` when no project owns the pack yet: command checks are then reported as skipped
   * rather than guessed against an arbitrary project's catalog.
   */
  commands: Readonly<Record<string, unknown>> | null;
  projectId: string | null;
}

export interface PackValidation {
  pack: PackWithPrompts | null;
  diagnostics: Diagnostic[];
}

export async function readPackText(fs: FileSystem, filePath: string): Promise<string | null> {
  try {
    return await fs.readText(filePath);
  } catch {
    return null;
  }
}

export async function validatePack(
  fs: FileSystem,
  source: PackSource,
  constraints: PackConstraints,
): Promise<PackValidation> {
  const { raw, filePath, reference, origin } = source;
  const diagnostics: Diagnostic[] = [];

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
    return { pack: null, diagnostics };
  }

  const parsed = PolicyPack.safeParse(document);
  if (!parsed.success) {
    for (const detail of describeIssues(parsed.error)) {
      diagnostics.push({ severity: 'error', code: 'pack-invalid', message: `${reference}: ${detail}`, where: filePath });
    }
    return { pack: null, diagnostics };
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
        authority: pack.authority,
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

  if (constraints.commands === null) {
    if (pack.commandPolicy.length > 0 || pack.rules.some((rule) => rule.check.kind === 'command')) {
      diagnostics.push({
        severity: 'notice',
        code: 'pack-commands-unchecked',
        message: `${reference} names project commands, but no project was determined for this check, so those references were not verified against a command catalog. Pass --project <id>.`,
        where: filePath,
      });
    }
  } else {
    const commands = constraints.commands;
    const owner = constraints.projectId ?? 'this project';
    for (const decision of pack.commandPolicy) {
      if (!Object.hasOwn(commands, decision.command)) {
        diagnostics.push({
          severity: 'error',
          code: 'pack-unknown-command',
          message: `${reference} declares a "${decision.action}" decision for command "${decision.command}", which project "${owner}" does not declare. Add it to the command catalog, as null if it is not configured yet.`,
          where: filePath,
        });
      }
    }
    for (const rule of pack.rules) {
      if (rule.check.kind === 'command' && !Object.hasOwn(commands, rule.check.command)) {
        diagnostics.push({
          severity: 'error',
          code: 'pack-unknown-command',
          message: `${reference}: rule "${rule.id}" is verified by command "${rule.check.command}", which project "${owner}" does not declare.`,
          where: filePath,
        });
      }
    }
  }

  // A `**/*` pack would remind on every edit anywhere, the very noise `remindOnEdit` exists to avoid.
  if (pack.appliesTo.includes('**/*')) {
    for (const rule of pack.rules) {
      if (rule.remindOnEdit) {
        diagnostics.push({
          severity: 'error',
          code: 'remind-on-edit-broad-pack',
          message: `${reference}: rule "${rule.id}" declares remindOnEdit: true, but this pack applies broadly ("**/*"). A reminder is allowed only for a path-specific pack; narrow "appliesTo" or remove remindOnEdit.`,
          where: filePath,
        });
      }
    }
  }

  // The schema checks the form of `replaces` but cannot see where the file came from.
  if (pack.replaces !== undefined && origin !== 'project') {
    diagnostics.push({
      severity: 'error',
      code: 'pack-replaces-builtin',
      message: `Built-in pack "${reference}" must not declare "replaces".`,
      where: filePath,
    });
    return { pack: null, diagnostics };
  }

  return {
    pack: { pack, reference, origin, filePath, contentHash: contentHash(raw), resolvedPrompts },
    diagnostics,
  };
}

export interface PackSetValidation {
  packs: PackWithPrompts[];
  diagnostics: Diagnostic[];
}

export function validatePackSet(packs: readonly PackWithPrompts[]): PackSetValidation {
  const diagnostics: Diagnostic[] = [];
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
      continue;
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
  return { packs: kept, diagnostics };
}
