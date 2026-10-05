import { z } from 'zod';

export const KINDS = ['route', 'step', 'gate', 'acceptance', 'declined', 'default-taken', 'preanswer', 'revise',
  'limit', 'exit', 'requirement', 'envelope', 'map', 'search', 'policy', 'baseline', 'check', 'format', 'review',
  'worker', 'note'] as const;
export type Kind = (typeof KINDS)[number];

export interface ArtifactRef { kind: string; value: string; id: string; path: string; contentHash: string }

/** Legacy `L<n>`, or `<writer8>-<n>`. */
const ID = /^(?:L\d+|[0-9a-z]{8}-\d+)$/;

const text = z.string();
const count = z.number().int().nonnegative();
/** A field v6 names without a type: it must be present, its value is not read here. */
const present = z.custom<unknown>((value) => value !== undefined);
const optionalList = z.array(z.unknown()).optional();

export const ArtifactRefSchema = z.object({ kind: text, value: text, id: text, path: text, contentHash: text }) satisfies z.ZodType<ArtifactRef>;

const base = { id: z.string().regex(ID), at: text, route: text.optional(), session: text.optional() };
const entry = <K extends Kind, S extends z.ZodRawShape>(kind: K, shape: S) => z.looseObject({ ...base, kind: z.literal(kind), ...shape });

const answer = {
  gate: text, instance: text.nullable(), answer: text, via: z.enum(['hook', 'flag', 'prompt', 'headless', 'never-asked', 'unanswered']),
  object: ArtifactRefSchema.optional(), reason: text.optional(), unbound: z.literal(true).optional(),
};
// An unbound answer belongs to no route; every other one names the route whose consent it is.
const routed = (value: { route?: string | undefined; unbound?: true | undefined }, context: z.RefinementCtx) => {
  if (value.unbound !== true && value.route === undefined) context.addIssue({ code: 'custom', path: ['route'], message: 'required unless unbound' });
};

const schemas = [
  entry('route', {
    skill: text, args: z.union([text, z.looseObject({})]), mode: z.enum(['interactive', 'headless']), channel: z.enum(['hook', 'cli', 'harness']), trusted: z.boolean(),
    session: text, harnessSession: text.optional(), scratchpad: text.optional(), epoch: z.number().int().min(1), resumes: text.optional(), adopts: z.boolean().optional(),
  }).refine((value) => value.trusted === (value.channel !== 'cli'), { path: ['trusted'], message: 'must equal channel !== cli' }),
  entry('step', {
    route: text, step: text, actor: z.enum(['code', 'model', 'human', 'worker']), status: z.enum(['delivered', 'completed', 'skipped', 'failed', 'repeated']), cause: text,
    channel: text.optional(), bytes: count.optional(), file: text.optional(),
  }),
  entry('gate', {
    route: text, gate: text, class: z.enum(['declared', 'raised', 'decision']), question: text, print: z.number().int().min(1),
    raisedBy: text.optional(), object: ArtifactRefSchema.optional(),
  }),
  entry('acceptance', answer).superRefine(routed),
  entry('declined', answer).superRefine(routed),
  entry('default-taken', answer).superRefine(routed),
  entry('preanswer', { route: text, gate: text, option: text, via: z.literal('prompt'), trusted: z.boolean() }),
  entry('revise', { route: text, from: text, via: z.enum(['gate', 'code', 'model']), cycle: count, reason: text }),
  entry('limit', { route: text, which: text, count, step: text.optional() }),
  entry('exit', { route: text, reason: text, detail: present.optional() }),
  entry('requirement', {
    key: text, via: text, rawHash: text, bytes: count, relation: present, capture: present, derivedFrom: text.nullable().optional(),
  }),
  entry('envelope', {
    sources: z.array(z.unknown()), builtFrom: z.enum(['captures', 'args']), asked: z.array(text), missingAsked: z.array(text), hash: text,
  }),
  entry('map', {
    mode: z.enum(['prompt', 'context']), layers: z.array(z.object({ name: text, ms: z.number(), hits: count })), layersSource: z.enum(['config', 'default', 'route']),
    terms: z.object({ pass1: z.array(text), pass2: z.array(text) }), candidates: count, limitations: z.array(text), index: text, bytes: count, collisions: z.array(text).optional(),
  }),
  entry('search', { command: z.enum(['refs', 'find']), names: z.array(text), hits: count, bytes: count }),
  entry('policy', { stage: z.enum(['before-work', 'before-report']), packs: z.array(text), rules: count, omitted: count, bytes: count }),
  // Written by later steps; each owner tightens its schema here (02-D4).
  entry('baseline', { head: text.optional(), dirty: optionalList }),
  entry('check', {
    key: text, argv: z.array(text), only: z.array(text), exit: z.number().int(), phase: text,
    summary: z.object({ ran: count, failed: count }).nullable(), ms: z.number(), mutations: z.unknown().optional(),
  }),
  entry('format', { key: text.optional(), files: optionalList, exit: z.number().int().optional(), via: text.optional() }),
  entry('review', {
    reviewId: text, status: text.optional(), statusReason: text.nullable().optional(), reviewerRan: z.boolean().optional(),
    findings: count.optional(), omissions: z.unknown().optional(),
  }),
  entry('worker', { worker: text, outcome: text, ms: z.number(), artifact: text, costUsd: z.number().optional() }),
  entry('note', {
    note: z.enum(['investigation', 'plan-draft', 'plan', 'notes']), path: text, contentHash: text,
    iteration: z.number().int().min(1).optional(), promotedFrom: text.optional(), from: text.optional(),
  }),
] as const;

export type TypedEntry = z.infer<(typeof schemas)[number]>;

const byKind = new Map<string, (typeof schemas)[number]>(schemas.map((schema) => [schema.shape.kind.value, schema]));

export function parseEntry(raw: unknown):
  | { ok: true; entry: TypedEntry }
  | { ok: false; unknownKind: true }
  | { ok: false; unknownKind: false; reason: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, unknownKind: false, reason: 'not a JSON object' };
  const { id, kind } = raw as { id?: unknown; kind?: unknown };
  if (typeof id !== 'string' || typeof kind !== 'string') return { ok: false, unknownKind: false, reason: 'no string id and kind' };
  const schema = byKind.get(kind);
  if (schema === undefined) return { ok: false, unknownKind: true };
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, entry: parsed.data as TypedEntry };
  const issue = parsed.error.issues[0];
  return { ok: false, unknownKind: false, reason: `${kind} ${id}: ${issue?.path.join('.') || 'entry'}: ${issue?.message ?? 'invalid'}` };
}
