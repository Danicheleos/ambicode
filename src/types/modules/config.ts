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

export const Effort = z.enum(['low', 'medium', 'high']);
const Run = { model: Name, effort: Effort, timeoutMinutes: PositiveInt };

export const RuleSource = z.enum(['preset', 'scout', 'manual', 'web']);
/** Where init may look for rules; `presets` names the shipped rule files, `preset` marks a rule that came from one. */
export const RuleSourceKind = z.enum(['presets', 'scout', 'manual', 'web']);
export const Rule = z.strictObject({ source: RuleSource, rule: z.string().min(1) });
export type Rule = z.infer<typeof Rule>;

export const MAX_RULES = 10;

/** `file` runs one file: it must say where the file goes. `null` is an intentionally missing form. */
export const CheckSpec = z.strictObject({
  all: z.string().min(1).nullable(),
  file: z.string().min(1).refine((v) => v.includes('{file}'), { error: 'must contain {file}' }).nullable(),
});
export type CheckSpec = z.infer<typeof CheckSpec>;

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
  packs: z.array(Name).default([]),
  policyFiles: z.array(RelativePath).default([]),
  rules: z.array(Rule).max(MAX_RULES).default([]),
  commands: z.record(Name, z.string().min(1)).default({}),
  checks: z.record(Name, CheckSpec).default({}),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;

export const AmbicodeConfig = z.strictObject({
  schemaVersion: z.literal(4),
  id: Name,
  /** Absent means "no baseline recorded"; branch review then needs --base. */
  baseline: z.string().min(1).optional(),
  context: z.strictObject({ maxTotalTokens: PositiveInt, maxFileTokens: PositiveInt }),
  skills: z.strictObject({
    init: z.strictObject({
      ...Run,
      scout: z.strictObject(Run),
      ruleSources: z.array(RuleSourceKind),
    }),
    review: z.strictObject({
      ...Run,
      maxFindings: Limit,
      maxChangedFiles: Limit,
      maxChangedLines: Limit,
      maxContextBytes: Limit,
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

export const SUPPORTED_SCHEMA_VERSION = 4;

export interface ApplyDeps { runtime: Runtime; session: string | null; context: CommandContext | null }
