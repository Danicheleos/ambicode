import path from 'node:path';
import { z } from 'zod';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { RawGate, invalid, normalizeGate, parseCall, parseOnError, parseQualified, parseRevise, parseWhen, parseYamlFile } from './dsl.ts';
import { parseRegistry } from '../gates/gates.ts';
import { KINDS } from '#types/modules/evidence';
import { HANDLER_NAMES, RAISED_BY, type GateDef, type Revise, type RouteDef, type StepDef, type RouteRegistry } from '#types/harness';
import type { FileSystem } from '#types/platform/ports';

export type { Call, Exit, GateDef, OnError, Qualified, Revise, When } from '#types/harness';

const list = z.union([z.string(), z.array(z.string())]).transform((value) => (typeof value === 'string' ? [value] : value));

const RawStep = z.strictObject({
  id: z.string().min(1),
  actor: z.enum(['code', 'model', 'human']),
  run: list.optional(),
  instruction: z.string().optional(),
  work: z.string().optional(),
  payload: z.array(z.string()).optional(),
  produces: z.array(z.string()).optional(),
  when: z.string().optional(),
  gate: RawGate.optional(),
  onFail: z.string().optional(),
  onError: z.string().optional(),
  repeat: z.number().int().min(1).optional(),
  final: z.boolean().optional(),
});

const RawRoute = z.strictObject({
  skill: z.string().min(1),
  version: z.literal(3),
  needsRequest: z.literal(true).optional(),
  steps: z.array(RawStep).min(1),
});

interface LoaderContext {
  handlers: readonly string[];
  readInstruction(relative: string): Promise<string>;
}

export async function loadRoute(file: string, text: string, context: LoaderContext): Promise<RouteDef> {
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
    ...(raw.needsRequest === true ? { needsRequest: true as const } : {}),
    steps,
  };
  validateRoute(file, route);
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

  const text = async (field: 'instruction' | 'work', value: string): Promise<string> =>
    value.startsWith('file:')
      ? (await context.readInstruction(value.slice('file:'.length)).catch(() => {
          throw invalid(file, `${where}.${field}`, `${value} cannot be read`);
        })).trim()
      : value.trim();
  let instruction: string | null = null;
  if (raw.actor === 'model') {
    if (raw.instruction === undefined) throw invalid(file, `${where}.instruction`, 'a model step has an instruction');
    instruction = await text('instruction', raw.instruction);
  } else if (raw.instruction !== undefined) {
    throw invalid(file, `${where}.instruction`, `only a model step has an instruction; this is ${raw.actor}`);
  }
  if (raw.work !== undefined && raw.actor !== 'model') throw invalid(file, `${where}.work`, `only a model step delegates work; this is ${raw.actor}`);
  const work = raw.work === undefined ? null : await text('work', raw.work);

  if (raw.actor === 'human' && raw.gate === undefined) throw invalid(file, `${where}.gate`, 'a human step declares its gate');
  if (raw.actor !== 'human' && raw.gate !== undefined) throw invalid(file, `${where}.gate`, `a gate goes on a human step; this is ${raw.actor}`);

  const gate = raw.gate === undefined ? null : normalizeGate(file, raw.id, 'declared', raw.gate, kinds);
  return {
    id: raw.id,
    index,
    actor: raw.actor,
    run,
    instruction,
    work,
    payload: raw.payload ?? [],
    produces: (raw.produces ?? []).map((text) => parseQualified(file, `${where}.produces`, text, kinds)),
    when: raw.when === undefined ? null : parseWhen(file, `${where}.when`, raw.when),
    gate,
    onFail: raw.onFail === undefined ? null : raw.onFail.trim() === 'record' ? 'record' : parseRevise(file, `${where}.onFail`, raw.onFail),
    onError: raw.onError === undefined ? { kind: 'default' } : parseOnError(file, `${where}.onError`, raw.onError),
    repeat: gate?.repeat ?? raw.repeat ?? 1,
    final: raw.final ?? false,
  };
}

function validateRoute(file: string, route: RouteDef): void {
  const byId = new Map(route.steps.map((step) => [step.id, step]));
  const gates = new Map(route.steps.filter((step) => step.gate !== null).map((step) => [step.id, step.gate!]));

  for (const step of route.steps) {
    const where = `step ${step.id}`;
    for (const when of step.when?.predicate === 'any' ? step.when.of : step.when === null ? [] : [step.when]) {
      if (when.predicate !== 'gate.is' && when.predicate !== 'gate.isnt') continue;
      const gate = gates.get(when.gate);
      if (gate === undefined) throw invalid(file, `${where}.when`, `"${when.gate}" is not a gate of this route`);
      if (!gate.options.includes(when.option)) {
        throw invalid(file, `${where}.when`, `"${when.option}" is not an option of gate ${gate.id}`);
      }
    }

    const checkTarget = (revise: Revise, field: string): void => {
      if (revise.target !== RAISED_BY && !byId.has(revise.target)) throw invalid(file, `${where}.${field}`, `"${revise.target}" is not a step of this route`);
    };
    if (step.onFail !== null && step.onFail !== 'record') checkTarget(step.onFail, 'onFail');
    if (step.gate !== null) for (const [option, revise] of Object.entries(step.gate.onAnswer)) checkTarget(revise, `gate.onAnswer.${option}`);
  }
}

interface RouteFiles { routes: RouteDef[]; registry: GateDef[] }

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
    handlers: options.handlers ?? HANDLER_NAMES,
    readInstruction: (relative) => fs.readText(path.join(root, relative)),
  };
  const routes: RouteDef[] = [];
  // One folder per route: `routes/<skill>/<skill>.yaml` beside its step texts.
  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join('routes', entry.name, `${entry.name}.yaml`);
    const text = await fs.readText(path.join(root, file)).catch(() => {
      throw invalid(file, 'file', `routes/${entry.name}/ holds no ${entry.name}.yaml`);
    });
    const route = await loadRoute(file, text, context);
    if (entry.name !== route.skill) throw invalid(file, 'skill', `"${route.skill}" does not match the folder name`);
    routes.push(route);
  }
  return { routes, registry };
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
