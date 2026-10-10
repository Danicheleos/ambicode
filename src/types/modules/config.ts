import { z } from 'zod';
import { DEFAULTS } from '../defaults.ts';
import { Ecosystem } from '../primitives.ts';
import type { Runtime } from '../composition.ts';
import type { CommandContext } from '../harness.ts';

const RelativePath = z
  .string()
  .min(1)
  .refine((v) => !v.startsWith('/'), { error: 'must be a repository-relative path' })
  .refine((v) => !/^[a-zA-Z]:[\\/]/.test(v), { error: 'must not be an absolute Windows path' })
  .refine((v) => !v.split('/').includes('..'), { error: 'must not contain ".." segments' });

const Glob = z.string().min(1);

export const CommandSpec = z.strictObject({
  argv: z.array(z.string()).min(1),
  cwd: RelativePath.optional(),
  timeoutSeconds: z.number().int().positive().optional(),
});
export type CommandSpec = z.infer<typeof CommandSpec>;

/** `null` is an intentionally unavailable command, not a missing field. */
export const CommandEntry = CommandSpec.nullable();

export const CheckSpec = z.strictObject({
  command: z.string().min(1),
  include: z.array(Glob).optional(),
});
export type CheckSpec = z.infer<typeof CheckSpec>;

/**
 * Which files `prepare` and `locate` may put on the shortlist. A file must match `include` (empty
 * means any) and no `exclude`. Absent, the ecosystem default applies, so an older config keeps working.
 */
export const ShortlistConfig = z.strictObject({
  include: z.array(Glob).default([]),
  exclude: z.array(Glob).default([]),
});
export type ShortlistConfig = z.infer<typeof ShortlistConfig>;

const RegexSource = z.string().min(1).refine((source) => {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}, 'not a valid regular expression');

export const SearchProfile = z.strictObject({
  stamp: z.strictObject({ commit: z.string(), files: z.number().int().nonnegative() }),
  sources: z.array(z.string().min(1)),
  companions: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
  catalogs: z.array(z.string().min(1)),
  featureKinds: z.array(z.string().min(1)),
  exportOnly: z.boolean(),
  /** Declaration patterns (regex sources) measured in the project's sources; absent means the catalog. */
  declarations: z.array(RegexSource).optional(),
  /** Test-path patterns (regex sources) measured over the tracked files; absent means the catalog. */
  tests: z.array(RegexSource).optional(),
  /** Measured by init from the index tool itself; absent means not measured, and the tool decides. */
  index: z.strictObject({ tool: z.literal('codeindex'), languages: z.array(z.string().min(1)), files: z.number().int().nonnegative() }).optional(),
});
export type SearchProfile = z.infer<typeof SearchProfile>;

export const ProjectConfig = z.strictObject({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'must be kebab-case' }),
  root: z.union([z.literal('.'), RelativePath]),
  ecosystem: Ecosystem,
  packs: z.array(z.string().min(1)).default([]),
  policyFiles: z.array(RelativePath).default([]),
  shortlist: ShortlistConfig.optional(),
  profile: SearchProfile.optional(),
  commands: z.record(z.string().min(1), CommandEntry).default({}),
  checks: z.record(z.string().min(1), CheckSpec.nullable()).default({}),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;

export const ReviewConfig = z.strictObject({
  model: z.string().min(1),
  timeoutSeconds: z.number().int().positive(),
  maxFindings: z.number().int().positive().nullable(),
  maxChangedFiles: z.number().int().positive().nullable(),
  maxChangedLines: z.number().int().positive().nullable(),
  maxContextBytes: z.number().int().positive().nullable(),
  /**
   * The only way past the per-file snapshot ceiling, which no limit raises: one
   * large generated file would otherwise block the whole change. `--exclude` adds to it.
   */
  excludePaths: z.array(z.string().min(1)).default([]),
});
export type ReviewConfig = z.infer<typeof ReviewConfig>;

export const ChecksConfig = z.strictObject({
  timeoutSeconds: z.number().int().positive(),
});

/** Absent lists mean the defaults in `config/defaults.ts`; the map prints which one it used. */
export const SearchConfig = z.strictObject({
  layers: z
    .strictObject({
      prompt: z.array(z.string().min(1)).optional(),
      context: z.array(z.string().min(1)).optional(),
    })
    .optional(),
});
export type SearchConfig = z.infer<typeof SearchConfig>;

export const GuardConfig = z.strictObject({ askOutsideMap: z.boolean().default(false) });

export const AmbicodeConfig = z.strictObject({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Empty string means "no baseline recorded"; branch review then needs --base. */
  baseline: z.string(),
  review: ReviewConfig,
  checks: ChecksConfig,
  requirements: z.strictObject({
    mcpServer: z.string().min(1).nullable(),
    acceptanceField: z.string().regex(/^customfield_\d+$/).nullable().default(DEFAULTS.requirements.acceptanceField),
  }),
  search: SearchConfig.default({}),
  guard: GuardConfig.default({ askOutsideMap: false }),
  projects: z.array(ProjectConfig).min(1),
});
export type AmbicodeConfig = z.infer<typeof AmbicodeConfig>;

export const SUPPORTED_SCHEMA_VERSION = 3;

export const APPLY_OPTIONS = ['Apply'] as const;

export interface ApplyDeps { runtime: Runtime; session: string | null; context: CommandContext | null }
