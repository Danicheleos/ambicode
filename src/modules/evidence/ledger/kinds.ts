import { z } from 'zod';
import { KINDS, type ArtifactRef } from '#types/evidence';
export type Kind = (typeof KINDS)[number];

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
    terms: z.object({ pass1: z.array(text), pass2: z.array(text) }), candidates: count, limitations: z.array(text), index: z.union([z.literal('none'), z.object({ tool: text, state: text, fresh: z.boolean(), builtMs: z.number().nullable() })]), bytes: count, collisions: z.array(text).optional(),
    candidatePaths: z.array(text).optional(), feature: z.object({ root: text, paths: count }).optional(),
  }),
  entry('search', { command: z.enum(['refs', 'find', 'relates']), names: z.array(text), hits: count, bytes: count }),
  entry('policy', {
    stage: z.enum(['before-work', 'before-checks', 'before-report', 'drafts', 'apply']), packs: optionalList, rules: count.optional(), omitted: count.optional(), bytes: count.optional(),
    path: text.optional(), contentHash: text.optional(), drafts: optionalList, errors: count.optional(), probes: optionalList,
  }).superRefine((value, context) => {
    const required = { drafts: ['path', 'contentHash', 'drafts', 'errors'], apply: ['packs', 'probes'] }[value.stage as string] ?? ['packs', 'rules', 'omitted', 'bytes'];
    for (const field of required) if ((value as Record<string, unknown>)[field] === undefined) context.addIssue({ code: 'custom', path: [field], message: `required for stage ${value.stage}` });
  }),
  entry('baseline', { head: text.nullable(), dirty: z.array(z.object({ path: text, hash: text.nullable() })) }),
  entry('check', {
    key: text, argv: z.array(text), only: z.array(text), exit: z.number().int(), phase: z.enum(['red', 'green']),
    summary: z.object({ ran: count, failed: count }).nullable(), ms: z.number(), mutations: z.unknown().optional(),
  }),
  entry('format', {
    key: text, files: z.array(text), exit: z.number().int().nullable(), via: z.literal('model'), outcome: z.enum(['formatted', 'unconfigured', 'failed', 'refused']),
  }),
  entry('review', {
    reviewId: text, status: text.optional(), statusReason: text.nullable().optional(), reviewerRan: z.boolean().optional(),
    findings: count.optional(), omissions: z.unknown().optional(), preexisting: z.array(text).optional(), baseline: text.nullable().optional(),
  }),
  entry('worker', {
    worker: text, outcome: z.enum(['ran', 'inline', 'skipped']), ms: z.number(), artifact: text.nullable(), costUsd: z.number().optional(), reason: text.optional(),
    summary: z.object({ failed: z.boolean(), anchorsBad: count, acsUnmapped: count, duplicates: count }).optional(),
  }),
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
