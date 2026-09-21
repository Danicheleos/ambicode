import { z } from 'zod';
import { Activity, Authority, CommandAction, Ecosystem, PromptStage, RuleCategory } from './primitives.ts';
import { ProvenanceEntry, RequirementMode, RequirementSource } from './requirements.ts';

/**
 * The `ambicode prepare` boundary contract (doc 04 P2.1): the smallest shared
 * preparation a skill needs before it starts navigating code or asking the
 * user a question — normalized requirement provenance and applicable policy,
 * nothing that reaches a provider, a reviewer, a project command, or a
 * publication path. Investigation is the first caller; a future plan/task
 * skill reuses the same contract rather than inventing a second one.
 *
 * Mirrors `ResolvedPolicy` (doc 02) field for field, reusing its existing
 * central enums, so this is a real machine boundary rather than a duplicate
 * union that can drift from the domain type.
 */

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
   * The prompt's full text, bounded by the same configured limit as a
   * snapshot file and verified to hash to `contentHash` (doc 04 P2.2
   * correction D). Investigate/plan apply this content directly; they do not
   * resolve `declaredPath` against a checkout-specific absolute path
   * themselves, which would be unusable from an installed plugin cache.
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

/**
 * The aggregate byte budget over everything `ambicode prepare` delivers for
 * outer-model use (doc 04 P2.3 correction B): requirement content, rule
 * instructions, prompt content, notices, diagnostics, and the fixed output
 * framing around them, measured as UTF-8 bytes against the one canonical
 * `review.maxContextBytes` limit — not a second hardcoded number.
 */
export const PrepareContextBudget = z.strictObject({
  measuredBytes: z.number().int().nonnegative(),
  limitBytes: z.number().int().positive(),
});
export type PrepareContextBudget = z.infer<typeof PrepareContextBudget>;

/**
 * The canonical shared operating contract (doc 04 P2.4 correction A4),
 * delivered to every `prepare` caller exactly once through this one
 * boundary, content/hash verified against what was actually read, so an
 * authoring skill never locates and reads it independently. Its bytes are
 * included in `provenance` and counted in `contextBudget`, the same as a
 * pack prompt.
 */
export const PrepareSharedContract = z.strictObject({
  reference: z.string().min(1),
  content: z.string(),
  contentHash: z.string().min(1),
});
export type PrepareSharedContract = z.infer<typeof PrepareSharedContract>;

/**
 * Visible code-navigation contract for authoring skills. Availability cannot
 * be inferred from repository files: the active Claude session must observe
 * its own tools and report either LSP use or the reason for the fallback.
 */
export const PrepareNavigation = z.strictObject({
  strategy: z.literal('known-paths-then-lsp-then-targeted-search'),
  ecosystem: Ecosystem,
  plugin: z.string().min(1),
  serverCommand: z.string().min(1),
  setupCommands: z.array(z.string().min(1)).min(1),
  statusSource: z.literal('current-session'),
  evidenceRequirement: z.string().min(1),
});
export type PrepareNavigation = z.infer<typeof PrepareNavigation>;

export const PrepareOutput = z.strictObject({
  command: z.literal('prepare'),
  activity: Activity,
  projectId: z.string().min(1),
  /** Repository-relative paths the caller supplied; empty means activity-level content only. */
  paths: z.array(z.string()),
  /** `source-free` means no requirement URL was supplied, whatever the activity (canonical `RequirementMode`). */
  requirementMode: RequirementMode,
  requirements: z.array(RequirementSource),
  provenance: z.array(ProvenanceEntry),
  notices: z.array(z.string()),
  policy: PreparePolicy,
  navigation: PrepareNavigation,
  sharedOperatingContract: PrepareSharedContract,
  contextBudget: PrepareContextBudget,
});
export type PrepareOutput = z.infer<typeof PrepareOutput>;
