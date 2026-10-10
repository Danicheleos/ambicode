import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describeIssues } from '#modules/config/load';
import { PolicyPack, type Diagnostic, type ResolvedPromptRef, type PackWithPrompts, type PackConstraints } from '#types/modules/policy';
import { AmbicodeError, messageOf } from '#util/errors';
import { resolveInsideBoundary } from '#util/paths';
import type { FileSystem } from '#types/platform/ports';

interface PackSource {
  raw: string;
  filePath: string;
  reference: string;
  origin: 'builtin' | 'project';
}

interface PackValidation {
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
      message: `${reference} is not valid YAML: ${messageOf(cause)}`,
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
      await fs.readText(absolutePath);
      resolvedPrompts.push({
        packId: pack.id,
        packReference: reference,
        authority: pack.authority,
        stage: promptRef.stage,
        absolutePath,
        declaredPath: promptRef.file,
      });
    } catch (error) {
      diagnostics.push({
        severity: 'error',
        code: error instanceof AmbicodeError ? error.code : 'prompt-unreadable',
        message: `${reference}: ${messageOf(error)}`,
        where: filePath,
      });
    }
  }

  if (constraints.commands !== null) {
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

  return {
    pack: { pack, reference, origin, filePath, resolvedPrompts },
    diagnostics,
  };
}

interface PackSetValidation {
  packs: PackWithPrompts[];
  diagnostics: Diagnostic[];
}

/** A project pack with `replaces: builtin/<id>` takes that built-in's place; two enabled packs with one id are an error. */
export function validatePackSet(packs: readonly PackWithPrompts[]): PackSetValidation {
  const diagnostics: Diagnostic[] = [];
  const replaced = new Set(packs.filter((pack) => pack.origin === 'project' && pack.pack.replaces !== undefined).map((pack) => pack.pack.replaces));
  const kept: PackWithPrompts[] = [];
  const seenIds = new Map<string, PackWithPrompts>();
  for (const pack of packs) {
    if (pack.origin === 'builtin' && replaced.has(pack.reference)) continue;
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
  return { packs: kept, diagnostics };
}
