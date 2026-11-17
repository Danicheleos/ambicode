import { z } from 'zod';

/** The kinds `agents/plan-critic.md` names; a defect of any kind sends the first draft back to draft once. */
const PlanCriticKind = z.enum(['claim-wrong', 'requirement-uncovered', 'requirement-altered', 'caller-missed', 'duplicate', 'assumption-premise', 'order']);

export const PlanCriticDefect = z.strictObject({ kind: PlanCriticKind, where: z.string().min(1), evidence: z.string().min(1), fix: z.string().min(1) });
export type PlanCriticDefect = z.infer<typeof PlanCriticDefect>;

/** One row per claim of the `## script:plan-check` list: `n` is its number there. `where` (`plan.md:L`) is filled by the record step, not by the critic. */
export const PlanCriticClaim = z.strictObject({ n: z.number().int().min(1), verdict: z.enum(['holds', 'wrong', 'not-checked']), evidence: z.string().min(1), where: z.string().min(1).optional() });
export type PlanCriticClaim = z.infer<typeof PlanCriticClaim>;

/** What the plan-critic subagent writes to its answer file. The claim rows are parsed one by one (`PlanCriticClaim`), so a malformed row costs only itself. */
export const PlanCriticOutput = z.strictObject({ defects: z.array(PlanCriticDefect), claims: z.array(z.unknown()).default([]) });
export type PlanCriticOutput = z.infer<typeof PlanCriticOutput>;

/** What the record step puts on the ledger's `plan-critic` worker entry: one claim row per listed claim, and the rows that named no listed claim. */
export const PlanCriticSummary = z.strictObject({ defects: z.array(PlanCriticDefect), claims: z.array(PlanCriticClaim).default([]), unknownRows: z.number().int().nonnegative().default(0), unknownNs: z.array(z.string()).default([]), iterations: z.number().int().nonnegative().optional() });
