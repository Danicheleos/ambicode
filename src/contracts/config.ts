import { z } from 'zod';
import { AdapterId, Ecosystem } from './primitives.ts';

/**
 * `.ambicode/config.yaml`. Unknown fields are errors (doc 05): every object is
 * strict so a typo is reported at its own path rather than silently ignored.
 */

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

export const RelatedSelector = z.strictObject({
  kind: z.literal('related'),
  maxFiles: z.number().int().positive().optional(),
});

export const MappingSelector = z.strictObject({
  kind: z.literal('mapping'),
  maxFiles: z.number().int().positive().optional(),
  mappings: z
    .array(
      z.strictObject({
        source: z.array(Glob).min(1),
        tests: z.array(Glob).min(1),
      }),
    )
    .min(1),
});

export const CommandSelector = z.strictObject({
  kind: z.literal('command'),
  maxFiles: z.number().int().positive().optional(),
  /** An existing command-catalog ID; selection is not a bypass around policy. */
  command: z.string().min(1),
});

export const Selector = z.discriminatedUnion('kind', [
  RelatedSelector,
  MappingSelector,
  CommandSelector,
]);
export type Selector = z.infer<typeof Selector>;

export const CheckSpec = z.strictObject({
  command: z.string().min(1),
  adapter: AdapterId,
  include: z.array(Glob).optional(),
  selector: Selector.optional(),
});
export type CheckSpec = z.infer<typeof CheckSpec>;

export const ProjectConfig = z.strictObject({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'must be kebab-case' }),
  root: z.union([z.literal('.'), RelativePath]),
  ecosystem: Ecosystem,
  packs: z.array(z.string().min(1)).default([]),
  policyFiles: z.array(RelativePath).default([]),
  commands: z.record(z.string().min(1), CommandEntry).default({}),
  checks: z.record(z.string().min(1), CheckSpec.nullable()).default({}),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;

export const ReviewConfig = z.strictObject({
  model: z.string().min(1),
  timeoutSeconds: z.number().int().positive(),
  maxFindings: z.number().int().positive(),
  maxChangedFiles: z.number().int().positive(),
  maxChangedLines: z.number().int().positive(),
  maxContextBytes: z.number().int().positive(),
  /**
   * Paths this repository never wants reviewed — generated translations, a
   * committed bundle. Empty by default, and `--exclude` adds to it per run.
   * The one way past the per-file snapshot ceiling, which no limit can raise:
   * a single 390 KB generated file otherwise blocks the whole change.
   * `.default([])` so a config written before this key existed still parses.
   */
  excludePaths: z.array(z.string().min(1)).default([]),
});
export type ReviewConfig = z.infer<typeof ReviewConfig>;

export const ChecksConfig = z.strictObject({
  timeoutSeconds: z.number().int().positive(),
  maxSelectedTestFiles: z.number().int().positive(),
});

export const PageConfig = z.strictObject({
  idleTimeoutSeconds: z.number().int().positive(),
});

export const RemoteChecksConfig = z.strictObject({
  /** Pinned by digest. Null keeps remote executable checks disabled (doc 05). */
  image: z.string().min(1).nullable(),
});

/**
 * Doc 04 P2.4 correction F: one explicit switch for the packaged edit-time
 * reminder hook. `editReminders: false` disables it entirely for this
 * repository, independent of any pack's own `remindOnEdit` declarations.
 * Defaults to `true` so an existing schema-version-1 config (written before
 * this field existed) receives the documented default without a destructive
 * rewrite — `AmbicodeConfig.parse` fills it in via `.default()` the same way
 * it already does for other additive fields.
 */
export const AuthoringConfig = z.strictObject({
  editReminders: z.boolean().default(true),
});
export type AuthoringConfig = z.infer<typeof AuthoringConfig>;

export const AmbicodeConfig = z.strictObject({
  schemaVersion: z.literal(1),
  /** Empty string means "no baseline recorded"; branch review then needs --base. */
  baseline: z.string(),
  review: ReviewConfig,
  checks: ChecksConfig,
  page: PageConfig,
  requirements: z.strictObject({
    mcpServer: z.string().min(1).nullable(),
  }),
  projects: z.array(ProjectConfig).min(1),
  remoteChecks: RemoteChecksConfig,
  authoring: AuthoringConfig.default({ editReminders: true }),
});
export type AmbicodeConfig = z.infer<typeof AmbicodeConfig>;

/**
 * Parsed before schema validation so an unsupported future schemaVersion gets an
 * explicit upgrade message instead of a field-by-field mismatch report.
 */
export const SchemaVersionProbe = z.looseObject({ schemaVersion: z.unknown() });

export const SUPPORTED_SCHEMA_VERSION = 1;
