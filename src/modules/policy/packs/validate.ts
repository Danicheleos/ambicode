import { parse as parseYaml } from 'yaml';
import { describeIssues } from '#modules/config/load';
import { PolicyPack, type Diagnostic, type LoadedPack, type PackConstraints } from '#types/modules/policy';
import { messageOf } from '#util/errors';
import type { FileSystem } from '#types/platform/ports';

interface PackSource {
  raw: string;
  filePath: string;
  reference: string;
  origin: 'builtin' | 'project';
}

interface PackValidation {
  pack: LoadedPack | null;
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

  for (const rule of pack.rules) {
    const outside = (rule.activities ?? []).filter((activity) => !pack.activities.includes(activity));
    if (outside.length > 0) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-invalid',
        message: `${reference}: rule "${rule.id}" lists activities ${outside.join(', ')} that the pack does not carry; a rule only narrows its pack.`,
        where: filePath,
      });
    }
  }

  // A built-in naming an undeclared command is unavailable, like null. A copy (`replaces`) keeps that
  // for the commands its built-in names; any other name in it is a typo.
  if (constraints.commands !== null && origin === 'project') {
    const inherited = pack.replaces === undefined ? undefined : (await constraints.builtinCommands()).get(pack.replaces.slice('builtin/'.length));
    const declared = (name: string): boolean => Object.hasOwn(constraints.commands!, name) || inherited?.has(name) === true;
    const owner = constraints.projectId ?? 'this project';
    for (const decision of pack.commandPolicy) {
      if (!declared(decision.command)) {
        diagnostics.push({
          severity: 'error',
          code: 'pack-unknown-command',
          message: `${reference} declares a "${decision.action}" decision for command "${decision.command}", which project "${owner}" does not declare. Add it to the command catalog, as null if it is not configured yet.`,
          where: filePath,
        });
      }
    }
    for (const rule of pack.rules) {
      if (rule.check.kind === 'command' && !declared(rule.check.command)) {
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
    pack: { pack, reference, origin, filePath },
    diagnostics,
  };
}

interface PackSetValidation {
  packs: LoadedPack[];
  diagnostics: Diagnostic[];
}

/** A project pack with `replaces: builtin/<id>` takes that built-in's place; two enabled packs with one id are an
 * error. With `builtinIds`, a `replaces` naming a built-in this release lacks is an error too (an old copy would
 * otherwise load beside its replacements). */
export function validatePackSet(packs: readonly LoadedPack[], builtinIds?: ReadonlySet<string>): PackSetValidation {
  const diagnostics: Diagnostic[] = [];
  for (const pack of packs) {
    const target = pack.origin === 'project' ? pack.pack.replaces : undefined;
    if (target !== undefined && builtinIds !== undefined && !builtinIds.has(target.slice('builtin/'.length))) {
      diagnostics.push({
        severity: 'error',
        code: 'pack-replaces-missing',
        message: `${pack.reference} replaces "${target}", which this AMBICODE release does not have. Remove the file from policyFiles or re-copy the packs that replaced it; see docs/rule-migration.md.`,
        where: pack.filePath,
      });
    }
  }
  const replaced = new Set(packs.filter((pack) => pack.origin === 'project' && pack.pack.replaces !== undefined).map((pack) => pack.pack.replaces));
  const kept: LoadedPack[] = [];
  const seenIds = new Map<string, LoadedPack>();
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
