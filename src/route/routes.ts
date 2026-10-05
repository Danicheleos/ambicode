import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { nodeFileSystem, type FileSystem } from '../ports/filesystem.ts';
import { KINDS } from '../task/kinds.ts';
import {
  EXITS,
  RAISED_BY,
  invalid,
  normalizeGate,
  parseCall,
  parseOnError,
  parseQualified,
  parseRevise,
  parseWhen,
  type Call,
  type Exit,
  type GateDef,
  type OnError,
  type Qualified,
  type Revise,
  type When,
} from './dsl.ts';
import { parseRegistry } from './gates.ts';

export type { Call, Exit, GateDef, OnError, Qualified, Revise, When } from './dsl.ts';

export const MAX_INSTRUCTION_CHARS = 1500;

/** Every `run` name a shipped route may use; `handlers.ts` registers exactly these and a test keeps the two equal. */
export const HANDLER_NAMES = [
  'requirements.template',
  'requirements.normalize',
  'requirements.acs',
  'search.map',
  'policy.stage',
  'evidence.navigationLine',
  'evidence.notes.save',
  'evidence.notes.promote',
] as const;

export interface StepDef {
  id: string;
  index: number;
  actor: 'code' | 'model' | 'worker' | 'human';
  run: readonly Call[];
  instruction: string | null;
  payload: readonly string[];
  needs: readonly Qualified[];
  produces: readonly Qualified[];
  when: When | null;
  gate: GateDef | null;
  onFail: Revise | null;
  onError: OnError;
  repeat: number;
}

export interface RouteDef {
  skill: string;
  version: 3;
  budget: { modelSteps: number; wallMinutes?: number };
  exits: readonly Exit[];
  revisable: readonly string[];
  steps: readonly StepDef[];
}

const DEFAULT_REPEAT: Readonly<Record<string, number>> = { ground: 2, design: 2, 'plan-write': 3, draft: 3, fix: 2, 'review-run': 2 };

const list = z.union([z.string(), z.array(z.string())]).transform((value) => (typeof value === 'string' ? [value] : value));

const RawGate = z.strictObject({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(1),
  default: z.string().min(1),
  release: z.string().min(1),
  onAnswer: z.record(z.string(), z.string()).optional(),
  maxRevises: z.number().int().optional(),
  acting: z.array(z.string()).optional(),
  object: z.string().optional(),
});

const RawStep = z.strictObject({
  id: z.string().min(1),
  actor: z.enum(['code', 'model', 'worker', 'human']),
  run: list.optional(),
  instruction: z.string().optional(),
  payload: z.array(z.string()).optional(),
  needs: z.array(z.string()).optional(),
  produces: z.array(z.string()).optional(),
  when: z.string().optional(),
  gate: RawGate.optional(),
  onFail: z.string().optional(),
  onError: z.string().optional(),
  repeat: z.number().int().min(1).optional(),
});

const RawRoute = z.strictObject({
  skill: z.string().min(1),
  version: z.literal(3),
  budget: z.strictObject({ modelSteps: z.number().int().positive(), wallMinutes: z.number().int().positive().optional() }),
  exits: z.array(z.enum(EXITS)),
  revisable: z.array(z.string()).default([]),
  steps: z.array(RawStep).min(1),
});

export interface LoaderContext {
  /** The plugin root: `file:` instructions resolve under it. */
  root: string;
  handlers: readonly string[];
  readInstruction(relative: string): Promise<string>;
}

export function parseYamlFile(file: string, text: string): unknown {
  try {
    return parseYaml(text);
  } catch (cause) {
    const line = (cause as { linePos?: { line: number }[] }).linePos?.[0]?.line;
    throw invalid(file, line === undefined ? 'yaml' : `line ${line}`, cause instanceof Error ? cause.message.split('\n')[0]! : String(cause));
  }
}

export async function loadRoute(file: string, text: string, context: LoaderContext, registry: readonly GateDef[] = []): Promise<RouteDef> {
  const document = parseYamlFile(file, text);
  const parsed = RawRoute.safeParse(document);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw invalid(file, issue?.path.join('.') || 'root', issue?.message ?? 'invalid');
  }
  const raw = parsed.data;
  const steps: StepDef[] = [];
  const seen = new Set<string>();
  for (const [index, step] of raw.steps.entries()) {
    const where = `step ${step.id}`;
    if (seen.has(step.id)) throw invalid(file, where, 'duplicate step id');
    seen.add(step.id);
    steps.push(await normalizeStep(file, step, index, context));
  }
  const route: RouteDef = {
    skill: raw.skill,
    version: 3,
    budget: raw.budget.wallMinutes === undefined ? { modelSteps: raw.budget.modelSteps } : { ...raw.budget },
    exits: raw.exits,
    revisable: raw.revisable,
    steps,
  };
  validateRoute(file, route, registry);
  return route;
}

async function normalizeStep(file: string, raw: z.infer<typeof RawStep>, index: number, context: LoaderContext): Promise<StepDef> {
  const where = `step ${raw.id}`;
  const kinds: readonly string[] = KINDS;
  const run = (raw.run ?? []).map((text) => parseCall(file, `${where}.run`, text));
  for (const call of run) {
    if (!context.handlers.includes(call.name)) throw invalid(file, `${where}.run`, `"${call.name}" is not a registered handler (${context.handlers.join(', ')})`);
  }
  if (raw.actor === 'code' && run.length === 0) throw invalid(file, `${where}.run`, 'a code step runs at least one handler');
  if (raw.actor !== 'code' && run.length > 0) throw invalid(file, `${where}.run`, `only a code step runs handlers; this is ${raw.actor}`);

  let instruction: string | null = null;
  if (raw.actor === 'model') {
    if (raw.instruction === undefined) throw invalid(file, `${where}.instruction`, 'a model step has an instruction');
    instruction = raw.instruction.startsWith('file:')
      ? (await context.readInstruction(raw.instruction.slice('file:'.length)).catch(() => {
          throw invalid(file, `${where}.instruction`, `${raw.instruction} cannot be read`);
        })).trim()
      : raw.instruction.trim();
    if (instruction.length > MAX_INSTRUCTION_CHARS) throw invalid(file, `${where}.instruction`, `${instruction.length} characters; the limit is ${MAX_INSTRUCTION_CHARS}`);
  } else if (raw.instruction !== undefined) {
    throw invalid(file, `${where}.instruction`, `only a model step has an instruction; this is ${raw.actor}`);
  }

  if (raw.actor === 'human' && raw.gate === undefined) throw invalid(file, `${where}.gate`, 'a human step declares its gate');
  if (raw.actor !== 'human' && raw.gate !== undefined) throw invalid(file, `${where}.gate`, `a gate goes on a human step; this is ${raw.actor}`);

  return {
    id: raw.id,
    index,
    actor: raw.actor,
    run,
    instruction,
    payload: raw.payload ?? [],
    needs: (raw.needs ?? []).map((text) => parseQualified(file, `${where}.needs`, text, kinds)),
    produces: (raw.produces ?? []).map((text) => parseQualified(file, `${where}.produces`, text, kinds)),
    when: raw.when === undefined ? null : parseWhen(file, `${where}.when`, raw.when),
    gate: raw.gate === undefined ? null : normalizeGate(file, raw.id, 'declared', raw.gate, kinds),
    onFail: raw.onFail === undefined ? null : parseRevise(file, `${where}.onFail`, raw.onFail),
    onError: raw.onError === undefined ? { kind: 'default' } : parseOnError(file, `${where}.onError`, raw.onError),
    repeat: raw.repeat ?? DEFAULT_REPEAT[raw.id] ?? 1,
  };
}

const samePair = (a: Qualified, b: Qualified): boolean => a.kind === b.kind && (b.value === null || a.value === b.value);

function validateRoute(file: string, route: RouteDef, registry: readonly GateDef[]): void {
  const byId = new Map(route.steps.map((step) => [step.id, step]));
  const gates = new Map(route.steps.filter((step) => step.gate !== null).map((step) => [step.id, step.gate!]));

  for (const id of route.revisable) {
    const target = byId.get(id);
    if (target === undefined) throw invalid(file, 'revisable', `"${id}" is not a step of this route`);
    if (target.actor !== 'human' && target.repeat < 2) throw invalid(file, 'revisable', `"${id}" has repeat 1, so the model could never re-enter it`);
  }

  for (const step of route.steps) {
    const where = `step ${step.id}`;
    if (step.when?.predicate === 'gate.answered' || step.when?.predicate === 'gate.is') {
      const gate = gates.get(step.when.gate);
      if (gate === undefined) throw invalid(file, `${where}.when`, `"${step.when.gate}" is not a gate of this route`);
      if (step.when.predicate === 'gate.is' && !gate.options.includes(step.when.option)) {
        throw invalid(file, `${where}.when`, `"${step.when.option}" is not an option of gate ${gate.id}`);
      }
    }

    const checkTarget = (revise: Revise, field: string, repeatChecked: boolean): void => {
      if (revise.target === RAISED_BY) return;
      const target = byId.get(revise.target);
      if (target === undefined) throw invalid(file, `${where}.${field}`, `"${revise.target}" is not a step of this route`);
      if (target.index > step.index + 1) throw invalid(file, `${where}.${field}`, `"${revise.target}" is later than the next step`);
      if (repeatChecked && target.actor !== 'human' && target.repeat < 2) {
        throw invalid(file, `${where}.${field}`, `"${revise.target}" has repeat 1, so it could never be re-entered`);
      }
    };
    if (step.onFail !== null) checkTarget(step.onFail, 'onFail', true);
    if (step.gate !== null) for (const [option, revise] of Object.entries(step.gate.onAnswer)) checkTarget(revise, `gate.onAnswer.${option}`, false);
    if (step.onError.kind === 'ask' && !gates.has(step.onError.gate) && !registry.some((gate) => gate.id === (step.onError as { gate: string }).gate)) {
      throw invalid(file, `${where}.onError`, `"${step.onError.gate}" is not a gate of this route or the registry`);
    }

    if (step.gate !== null && step.gate.object !== null) {
      const object = step.gate.object;
      const producer = route.steps.slice(0, step.index).find((earlier) => earlier.produces.some((produced) => samePair(produced, object)));
      if (producer === undefined) throw invalid(file, `${where}.gate.object`, `no earlier step produces ${object.kind}${object.value === null ? '' : `{${object.value}}`}`);
    }
  }
}

/** Producer step of a gate's object: the earlier step that `produces` it (03-G10). */
export function objectProducer(route: RouteDef, step: StepDef): StepDef | null {
  const object = step.gate?.object;
  if (object === null || object === undefined) return null;
  return route.steps.slice(0, step.index).find((earlier) => earlier.produces.some((produced) => samePair(produced, object))) ?? null;
}

export interface RouteFiles { routes: RouteDef[]; registry: GateDef[] }

export async function validateRouteFiles(root: string, options: { handlers?: readonly string[]; fs?: FileSystem } = {}): Promise<RouteFiles> {
  const fs = options.fs ?? nodeFileSystem;
  const directory = path.join(root, 'routes');
  const entries = await fs.readdir(directory).catch(() => {
    throw invalid('routes', 'directory', `${directory} cannot be read`);
  });
  const kinds: readonly string[] = KINDS;
  const registryFile = path.join('routes', 'gates.yaml');
  const registry = parseRegistry(registryFile, await fs.readText(path.join(root, registryFile)).catch(() => {
    throw invalid(registryFile, 'file', 'routes/gates.yaml is missing');
  }), kinds);

  const context: LoaderContext = {
    root,
    handlers: options.handlers ?? HANDLER_NAMES,
    readInstruction: (relative) => fs.readText(path.join(root, relative)),
  };
  const routes: RouteDef[] = [];
  for (const entry of entries.filter((candidate) => candidate.isFile() && candidate.name.endsWith('.yaml') && candidate.name !== 'gates.yaml').sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join('routes', entry.name);
    const route = await loadRoute(file, await fs.readText(path.join(root, file)), context, registry);
    if (entry.name !== `${route.skill}.yaml`) throw invalid(file, 'skill', `"${route.skill}" does not match the file name`);
    routes.push(route);
  }
  return { routes, registry };
}

export interface RouteRegistry {
  route(skill: string): RouteDef | null;
  skills(): readonly string[];
  gate(id: string): GateDef | null;
  gates(): readonly GateDef[];
}

export async function loadRouteRegistry(pluginRoot: string, fs: FileSystem): Promise<RouteRegistry> {
  return routeRegistry(await validateRouteFiles(pluginRoot, { fs }));
}

export function routeRegistry(files: RouteFiles): RouteRegistry {
  return {
    route: (skill) => files.routes.find((route) => route.skill === skill) ?? null,
    skills: () => files.routes.map((route) => route.skill),
    gate: (id) => files.registry.find((gate) => gate.id === id) ?? (id.startsWith('decision:') ? (files.registry.find((gate) => gate.class === 'decision') ?? null) : null),
    gates: () => files.registry,
  };
}
