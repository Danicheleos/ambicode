import { z } from 'zod';
import { Activity, Authority, CommandAction, PromptStage, RuleCategory } from './primitives.ts';

/** Policy pack file schema (doc 05, "Canonical policy pack"). */

export const RuleCheck = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('reviewer'),
    explanation: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal('command'),
    command: z.string().min(1),
    explanation: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal('none'),
    explanation: z.string().min(1),
  }),
]);
export type RuleCheck = z.infer<typeof RuleCheck>;

const KebabId = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'must be kebab-case' });

export const PolicyRule = z.strictObject({
  id: KebabId,
  category: RuleCategory,
  instruction: z.string().min(1),
  check: RuleCheck,
});
export type PolicyRule = z.infer<typeof PolicyRule>;

export const PolicyPromptRef = z.strictObject({
  stage: PromptStage,
  file: z.string().min(1),
});
export type PolicyPromptRef = z.infer<typeof PolicyPromptRef>;

export const PolicyCommandDecision = z.strictObject({
  command: z.string().min(1),
  action: CommandAction,
  reason: z.string().min(1).optional(),
});
export type PolicyCommandDecision = z.infer<typeof PolicyCommandDecision>;

export const PolicyPack = z.strictObject({
  schemaVersion: z.literal(1),
  id: KebabId,
  authority: Authority,
  appliesTo: z.array(z.string().min(1)).min(1),
  activities: z.array(Activity).min(1),
  source: z.strictObject({
    location: z.string().min(1),
    externalVersion: z.string().min(1).optional(),
  }),
  rules: z.array(PolicyRule).default([]),
  prompts: z.array(PolicyPromptRef).default([]),
  commandPolicy: z.array(PolicyCommandDecision).default([]),
  /** Only a project pack may declare this, and only as `builtin/<id>` (doc 05). */
  replaces: z
    .string()
    .regex(/^builtin\/[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'must be "builtin/<pack-id>"' })
    .optional(),
});
export type PolicyPack = z.infer<typeof PolicyPack>;

/** A pack plus where it came from; provenance survives replacement. */
export interface LoadedPack {
  pack: PolicyPack;
  /** `builtin/<id>` or the repository-relative config path. */
  reference: string;
  origin: 'builtin' | 'project';
  /** Absolute path of the pack file; prompt references resolve against its directory. */
  filePath: string;
  contentHash: string;
  replacedReference?: string;
}

export interface ResolvedRule {
  /** `pack-id/rule-id`. */
  qualifiedId: string;
  packId: string;
  packReference: string;
  authority: z.infer<typeof Authority>;
  sourceLocation: string;
  sourceExternalVersion?: string;
  category: z.infer<typeof RuleCategory>;
  instruction: string;
  check: RuleCheck;
}

export interface ResolvedPromptRef {
  packId: string;
  packReference: string;
  stage: z.infer<typeof PromptStage>;
  /** Absolute path, already proven to sit inside the pack directory. */
  absolutePath: string;
  /** Path as written in the pack, for diagnostics. */
  declaredPath: string;
  contentHash: string;
}

export interface ResolvedCommandDecision {
  command: string;
  action: z.infer<typeof CommandAction>;
  /** Every pack that contributed, so a refusal can name it. */
  sources: Array<{ packId: string; packReference: string; action: z.infer<typeof CommandAction>; reason?: string }>;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'notice';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  /** Dotted config path or file path the problem belongs to. */
  where?: string;
}

export interface ResolvedPolicy {
  activity: z.infer<typeof Activity>;
  projectId: string | null;
  packs: Array<{
    id: string;
    reference: string;
    origin: 'builtin' | 'project';
    authority: z.infer<typeof Authority>;
    sourceLocation: string;
    sourceExternalVersion?: string;
    contentHash: string;
    replacedReference?: string;
    matchedPaths: string[];
  }>;
  rules: ResolvedRule[];
  prompts: ResolvedPromptRef[];
  commandDecisions: ResolvedCommandDecision[];
  diagnostics: Diagnostic[];
}
