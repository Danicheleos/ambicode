import { z } from 'zod';
import { DEFAULTS } from '../config/defaults.ts';
import { AdapterId, Ecosystem } from './primitives.ts';

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

/**
 * Which files `prepare` and `locate` may put on the shortlist. A file must match `include` (empty
 * means any) and no `exclude`. Absent, the ecosystem default applies, so an older config keeps working.
 */
export const ShortlistConfig = z.strictObject({
  include: z.array(Glob).default([]),
  exclude: z.array(Glob).default([]),
});
export type ShortlistConfig = z.infer<typeof ShortlistConfig>;

export const SearchProfile = z.strictObject({
  stamp: z.strictObject({ commit: z.string(), files: z.number().int().nonnegative() }),
  sources: z.array(z.string().min(1)),
  companions: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
  catalogs: z.array(z.string().min(1)),
  featureKinds: z.array(z.string().min(1)),
  exportOnly: z.boolean(),
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
  maxFindings: z.number().int().positive(),
  maxChangedFiles: z.number().int().positive(),
  maxChangedLines: z.number().int().positive(),
  maxContextBytes: z.number().int().positive(),
  /**
   * The only way past the per-file snapshot ceiling, which no limit raises: one
   * large generated file would otherwise block the whole change. `--exclude` adds to it.
   */
  excludePaths: z.array(z.string().min(1)).default([]),
  /** What happens to a finding that fails validation: kept as a voided entry, or dropped. */
  onInvalid: z.enum(['void', 'drop']).default('void'),
});
export type ReviewConfig = z.infer<typeof ReviewConfig>;

export const ChecksConfig = z.strictObject({
  timeoutSeconds: z.number().int().positive(),
  maxSelectedTestFiles: z.number().int().positive(),
});

export const PageConfig = z.strictObject({
  idleTimeoutSeconds: z.number().int().positive(),
  /** 0 lets the OS pick, one page per run. */
  port: z.number().int().min(0).max(65535).default(DEFAULTS.page.port),
});

export const RemoteChecksConfig = z.strictObject({
  image: z.string().min(1).nullable(),
});

export const AuthoringConfig = z.strictObject({
  editReminders: z.boolean().default(true),
});
export type AuthoringConfig = z.infer<typeof AuthoringConfig>;

/** Absent lists mean the defaults in `config/defaults.ts`; the map prints which one it used. */
export const SearchConfig = z.strictObject({
  index: z.enum(['none', 'codeindex']).default('none'),
  layers: z
    .strictObject({
      prompt: z.array(z.string().min(1)).optional(),
      context: z.array(z.string().min(1)).optional(),
    })
    .optional(),
});
export type SearchConfig = z.infer<typeof SearchConfig>;

export const WorkersConfig = z.strictObject({ approved: z.array(z.string().min(1)).default([]) });
export const GuardConfig = z.strictObject({ askOutsideMap: z.boolean().default(false) });

export const AmbicodeConfig = z.strictObject({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Empty string means "no baseline recorded"; branch review then needs --base. */
  baseline: z.string(),
  review: ReviewConfig,
  checks: ChecksConfig,
  page: PageConfig,
  requirements: z.strictObject({
    mcpServer: z.string().min(1).nullable(),
  }),
  search: SearchConfig.default({ index: 'none' }),
  workers: WorkersConfig.default({ approved: [] }),
  guard: GuardConfig.default({ askOutsideMap: false }),
  projects: z.array(ProjectConfig).min(1),
  remoteChecks: RemoteChecksConfig,
  authoring: AuthoringConfig.default({ editReminders: true }),
});
export type AmbicodeConfig = z.infer<typeof AmbicodeConfig>;

export const SchemaVersionProbe = z.looseObject({ schemaVersion: z.unknown() });

export const SUPPORTED_SCHEMA_VERSION = 3;
