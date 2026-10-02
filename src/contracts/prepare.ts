import { z } from 'zod';
import { PrepareShortlist } from './locate.ts';
import { Activity, Authority, CommandAction, Ecosystem, PromptStage, RuleCategory } from './primitives.ts';
import { ProvenanceEntry, RequirementMode, RequirementSource } from './requirements.ts';

const PrepareDiagnostic = z.strictObject({
  severity: z.enum(['error', 'warning', 'notice']),
  code: z.string().min(1),
  message: z.string().min(1),
  where: z.string().min(1).optional(),
});

const PreparePack = z.strictObject({
  id: z.string().min(1),
  reference: z.string().min(1),
  origin: z.enum(['builtin', 'project']),
  authority: Authority,
  sourceLocation: z.string().min(1),
  sourceExternalVersion: z.string().min(1).optional(),
  contentHash: z.string().min(1),
  replacedReference: z.string().min(1).optional(),
  matchedPaths: z.array(z.string()),
});

const PrepareRule = z.strictObject({
  qualifiedId: z.string().min(1),
  packId: z.string().min(1),
  packReference: z.string().min(1),
  authority: Authority,
  category: RuleCategory,
  instruction: z.string().min(1),
  checkKind: z.enum(['reviewer', 'command', 'none']),
  checkExplanation: z.string().min(1),
  checkCommand: z.string().min(1).nullable(),
  remindOnEdit: z.boolean(),
});

const PreparePrompt = z.strictObject({
  packId: z.string().min(1),
  packReference: z.string().min(1),
  authority: Authority,
  stage: PromptStage,
  declaredPath: z.string().min(1),
  contentHash: z.string().min(1),
  /**
   * Verified to hash to `contentHash`. Callers use this text rather than resolving
   * `declaredPath`, which is unusable from an installed plugin cache.
   */
  content: z.string(),
});

const PrepareCommandDecisionSource = z.strictObject({
  packId: z.string().min(1),
  packReference: z.string().min(1),
  action: CommandAction,
  reason: z.string().min(1).optional(),
});

const PrepareCommandDecision = z.strictObject({
  command: z.string().min(1),
  action: CommandAction,
  /** Config sets the command to null: it never runs, whatever `action` allows. */
  unavailable: z.literal(true).optional(),
  sources: z.array(PrepareCommandDecisionSource),
});

export const PreparePolicy = z.strictObject({
  activity: Activity,
  projectId: z.string().min(1).nullable(),
  packs: z.array(PreparePack),
  rules: z.array(PrepareRule),
  prompts: z.array(PreparePrompt),
  commandDecisions: z.array(PrepareCommandDecision),
  diagnostics: z.array(PrepareDiagnostic),
});
export type PreparePolicy = z.infer<typeof PreparePolicy>;

export const PrepareContextBudget = z.strictObject({
  measuredBytes: z.number().int().nonnegative(),
  limitBytes: z.number().int().positive(),
});
export type PrepareContextBudget = z.infer<typeof PrepareContextBudget>;

export const PrepareSharedContract = z.strictObject({
  reference: z.string().min(1),
  content: z.string(),
  contentHash: z.string().min(1),
});
export type PrepareSharedContract = z.infer<typeof PrepareSharedContract>;

export const PrepareNavigation = z.strictObject({
  strategy: z.literal('shortlist-then-known-paths-then-lsp-then-targeted-search'),
  ecosystem: Ecosystem,
  plugin: z.string().min(1),
  serverCommand: z.string().min(1),
  setupCommands: z.array(z.string().min(1)).min(1),
  statusSource: z.literal('current-session'),
  evidenceRequirement: z.string().min(1),
  readGuidance: z.string().min(1),
  /** Absent means no shortlist was asked for, never that the repository holds no candidates. */
  shortlist: PrepareShortlist.optional(),
});
export type PrepareNavigation = z.infer<typeof PrepareNavigation>;

/** Where this request's notes and reviews go. Minted by the CLI so every skill for one request names the same directory. */
export const PrepareTask = z.strictObject({
  slug: z.string().min(1),
  directory: z.string().min(1),
  /** The directory already holds an earlier skill's output for this request. */
  existing: z.boolean(),
});
export type PrepareTask = z.infer<typeof PrepareTask>;

export const PrepareOutput = z.strictObject({
  command: z.literal('prepare'),
  activity: Activity,
  projectId: z.string().min(1),
  paths: z.array(z.string()),
  requirementMode: RequirementMode,
  requirements: z.array(RequirementSource),
  provenance: z.array(ProvenanceEntry),
  notices: z.array(z.string()),
  task: PrepareTask.optional(),
  // Before `policy`: a truncated read loses the tail, and navigation must survive it.
  // Zod re-emits keys in shape order, so this declaration fixes the printed order.
  navigation: PrepareNavigation,
  policy: PreparePolicy,
  sharedOperatingContract: PrepareSharedContract,
  contextBudget: PrepareContextBudget,
});
export type PrepareOutput = z.infer<typeof PrepareOutput>;

const PrepareCompactRule = z
  .strictObject({
    /** Rule id within its pack. The qualified id is `<pack.id>/<id>`. */
    id: z.string().min(1),
    category: RuleCategory,
    instruction: z.string().min(1),
    check: z.string().min(1),
    /** Only for a rule nothing verifies. Absent means the reviewer judges it. */
    checkKind: z.literal('none').optional(),
    checkCommand: z.string().min(1).optional(),
  })
  .refine((rule) => !(rule.checkKind === 'none' && rule.checkCommand !== undefined), {
    message: 'A rule with checkKind "none" cannot also name a check command.',
  });
export type PrepareCompactRule = z.infer<typeof PrepareCompactRule>;

const PrepareCompactPack = z.strictObject({
  id: z.string().min(1),
  reference: z.string().min(1),
  /** Hoisted here from every rule it owns; a rule's authority is its pack's. */
  authority: Authority,
  replacedReference: z.string().min(1).optional(),
  rules: z.array(PrepareCompactRule).min(1).optional(),
});

const PrepareCompactCommandSource = z.strictObject({
  pack: z.string().min(1),
  /** Only when this pack's own action differs from the resolved one. */
  action: CommandAction.optional(),
  reason: z.string().min(1).optional(),
});

const PrepareCompactCommandDecision = z.union([
  z.strictObject({
    command: z.string().min(1),
    action: CommandAction,
    unavailable: z.literal(true).optional(),
    pack: z.string().min(1),
    reason: z.string().min(1).optional(),
  }),
  z.strictObject({
    command: z.string().min(1),
    action: CommandAction,
    unavailable: z.literal(true).optional(),
    sources: z.array(PrepareCompactCommandSource).min(2),
  }),
]);

const PrepareCompactPolicy = z.strictObject({
  packs: z.array(PrepareCompactPack),
  /** Present only when rules were left out for this activity; `read` is the command that returns them. */
  rulesOmitted: z.strictObject({ count: z.number().int().positive(), read: z.string().min(1) }).optional(),
  prompts: z.array(PreparePrompt).min(1).optional(),
  commandDecisions: z.array(PrepareCompactCommandDecision).min(1).optional(),
  diagnostics: z.array(PrepareDiagnostic).min(1).optional(),
});

const PrepareCompactNavigation = z.strictObject({
  strategy: z.literal('shortlist-then-known-paths-then-lsp-then-targeted-search'),
  ecosystem: Ecosystem,
  evidenceRequirement: z.string().min(1),
  readGuidance: z.string().min(1),
  shortlist: PrepareShortlist.optional(),
});

/**
 * By reference: the plugin's hook delivers the text once per context epoch.
 * `--with-contract` inlines `content` for a session that never received the hook's copy.
 */
const PrepareCompactSharedContract = z.strictObject({
  reference: z.string().min(1),
  contentHash: z.string().min(1),
  content: z.string().optional(),
});

export const PrepareCompactOutput = z.strictObject({
  command: z.literal('prepare'),
  activity: Activity,
  projectId: z.string().min(1),
  paths: z.array(z.string()).min(1).optional(),
  requirementMode: RequirementMode,
  requirements: z.array(RequirementSource).min(1).optional(),
  notices: z.array(z.string()).min(1).optional(),
  task: PrepareTask.optional(),
  // Same order as the verbose shape, for the same reason.
  navigation: PrepareCompactNavigation,
  policy: PrepareCompactPolicy,
  sharedOperatingContract: PrepareCompactSharedContract,
  provenance: z.array(ProvenanceEntry),
  contextBudget: PrepareContextBudget,
});
export type PrepareCompactOutput = z.infer<typeof PrepareCompactOutput>;
