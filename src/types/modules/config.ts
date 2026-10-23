import { z } from 'zod';
import type { Runtime } from '../composition.ts';
import type { CommandContext } from '../harness.ts';

const RelativePath = z
  .string()
  .min(1)
  .refine((v) => !v.startsWith('/'), { error: 'must be a repository-relative path' })
  .refine((v) => !/^[a-zA-Z]:[\\/]/.test(v), { error: 'must not be an absolute Windows path' })
  .refine((v) => !v.split('/').includes('..'), { error: 'must not contain ".." segments' });

const Glob = z.string().min(1);
const Name = z.string().min(1);
const PositiveInt = z.number().int().positive();
const Limit = PositiveInt.nullable();

const Effort = z.enum(['low', 'medium', 'high']);
const Run = { model: Name, effort: Effort, timeoutMinutes: PositiveInt };

/** `file` runs one file: it must say where the file goes. `null` is an intentionally missing form; a bare `null` check is both forms unknown (7 of 10 init runs wrote it), so consumers only ever see the object. */
const CheckSpec = z.preprocess((v) => (v === null ? { all: null, file: null } : v), z.strictObject({
  all: z.string().min(1).nullable(),
  file: z.string().min(1).refine((v) => v.includes('{file}'), { error: 'must contain {file}' }).nullable(),
}));
type CheckSpec = z.infer<typeof CheckSpec>;

export const ProjectConfig = z.strictObject({
  id: z.string().min(1).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'must be kebab-case' }),
  root: z.union([z.literal('.'), RelativePath]).default('.'),
  paths: z.array(RelativePath).default([]),
  ecosystem: z.strictObject({
    languages: z.array(Name).default([]),
    frameworks: z.array(Name).default([]),
    packageManager: Name.nullable().default(null),
  }),
  include: z.array(Glob).default([]),
  exclude: z.array(Glob).default([]),
  /** Git-ignored paths relative to `root`, a directory ends with `/`; the Glob hook drops results under them. */
  ignored: z.array(RelativePath).default([]),
  packs: z.array(Name).default([]),
  policyFiles: z.array(RelativePath).default([]),
  commands: z.record(Name, z.string().min(1)).default({}),
  checks: z.record(Name, CheckSpec).default({}),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;

export const AmbicodeConfig = z.strictObject({
  schemaVersion: z.literal(5),
  id: Name,
  /** Absent means "no baseline recorded"; branch review then needs --base. */
  baseline: z.string().min(1).optional(),
  context: z.strictObject({ maxTotalTokens: PositiveInt, maxFileTokens: PositiveInt, maxIndexTokens: PositiveInt }),
  skills: z.strictObject({
    init: z.strictObject({
      ...Run,
      scout: z.strictObject(Run),
    }),
    review: z.strictObject({
      ...Run,
      maxFindings: Limit,
      maxChangedFiles: Limit,
      maxChangedLines: Limit,
      maxContextBytes: Limit,
      /** The review page binds this port on 127.0.0.1 (an ssh forward needs a fixed one); null picks a free port. */
      pagePort: z.number().int().min(1).max(65535).nullable().default(null),
      /**
       * The only way past the per-file snapshot ceiling, which no limit raises: one
       * large generated file would otherwise block the whole change. `--exclude` adds to it.
       */
      excludePaths: z.array(Name).default([]),
    }),
    task: z.strictObject({ ...Run, checkTimeoutSeconds: PositiveInt }),
    plan: z.strictObject(Run),
    investigate: z.strictObject(Run),
    rules: z.strictObject(Run),
  }),
  requirements: z.strictObject({
    runtimes: z.record(Name, z.string()).default({}),
    mcps: z.array(Name).default([]),
    lsps: z.array(Name).default([]),
    env: z.array(Name).default([]),
  }),
  projects: z.array(ProjectConfig).min(1),
});
export type AmbicodeConfig = z.infer<typeof AmbicodeConfig>;

export const SUPPORTED_SCHEMA_VERSION = 5;

export interface ApplyDeps { runtime: Runtime; session: string | null; context: CommandContext | null }
