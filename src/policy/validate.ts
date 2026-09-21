import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describeIssues } from '../config/load.ts';
import { PolicyPack, type Diagnostic, type LoadedPack, type ResolvedPromptRef } from '../contracts/policy.ts';
import type { FileSystem } from '../ports/filesystem.ts';
import { AmbicodeError } from '../util/errors.ts';
import { contentHash } from '../util/hash.ts';
import { resolveInsideBoundary } from '../util/paths.ts';

/**
 * Everything a policy pack must satisfy beyond its Zod schema, in one place.
 *
 * `src/policy/load.ts` calls this while loading the packs a project enabled,
 * and `ambicode policy check` calls it on a candidate file that is not yet
 * referenced from `.ambicode/config.yaml` (R3 part 1). The two were one
 * function before, so the only way to give the candidate check the same rules
 * was to copy them; a rule added here is now enforced on both paths by
 * construction, which is what `src/cli/policy-check.test.ts` asserts.
 *
 * What lives here rather than in `src/contracts/policy.ts` is exactly the set
 * of checks a schema cannot express: they need the pack's own `appliesTo`
 * alongside one of its rules, the pack directory on disk, the project's
 * command catalog, or the other enabled packs.
 */

export interface PackWithPrompts extends LoadedPack {
  resolvedPrompts: ResolvedPromptRef[];
}

/** The pack file as read, before anything has been decided about it. */
export interface PackSource {
  raw: string;
  /** Absolute path; prompt references resolve against its directory. */
  filePath: string;
  /** `builtin/<id>` or the repository-relative config path. */
  reference: string;
  origin: 'builtin' | 'project';
}

export interface PackConstraints {
  /**
   * The command catalog that a `commandPolicy` decision or a `command` check
   * must name. `null` means no project owns this pack yet — a candidate file
   * checked in a repository with more than one project and no `--project` —
   * and that one check is then reported as skipped rather than guessed
   * against an arbitrary project's catalog.
   */
  commands: Readonly<Record<string, unknown>> | null;
  projectId: string | null;
}

export interface PackValidation {
  /** Null when the pack could not be understood well enough to be used. */
  pack: PackWithPrompts | null;
  diagnostics: Diagnostic[];
}

/** The file's text, or null when it is not there; the caller words the diagnostic. */
export async function readPackText(fs: FileSystem, filePath: string): Promise<string | null> {
  try {
    return await fs.readText(filePath);
  } catch {
    return null;
  }
}

/**
 * Parses one pack and applies every non-schema rule that can be decided from
 * the pack alone. The cross-pack rules — duplicate ids and `replaces` — need
 * the whole enabled set and live in `validatePackSet`.
 */
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

  // A rule or decision naming a command the project does not declare is a
  // configuration error the operator can act on, not a silent no-op (U03).
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

  // A reminder is allowed only for a path-specific pack (doc 04 P2.4
  // correction F): a pack applying broadly to `**/*` would otherwise fire a
  // reminder on every edit anywhere in the project, exactly the per-file
  // noise `remindOnEdit` is meant to avoid — this is a configuration error,
  // not a silently ignored flag.
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

  // `replaces` is a project-pack mechanism. Its form (`builtin/<id>`) is in the
  // schema; that a built-in must not carry it at all is not, because the schema
  // cannot see where the file came from.
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

/**
 * The rules that only exist between packs. A project pack replaces a built-in
 * only when it says so explicitly; replacement is whole-pack, and the replaced
 * reference stays visible (doc 05).
 */
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
  return { packs: kept, diagnostics };
}
