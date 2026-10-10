import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { RawGate, invalid, normalizeGate, parseCall, parseOnError, parseQualified, parseRevise, parseWhen } from './dsl.ts';
import { parseRegistry } from '../gates/gates.ts';
import { KINDS } from '#types/modules/evidence';
import { HANDLER_NAMES, RAISED_BY, type GateDef, type Qualified, type Revise, type RouteDef, type StepDef, type RouteRegistry } from '#types/harness';
import type { FileSystem } from '#types/platform/ports';

export type { Call, Exit, GateDef, OnError, Qualified, Revise, When } from '#types/harness';

const list = z.union([z.string(), z.array(z.string())]).transform((value) => (typeof value === 'string' ? [value] : value));

const RawStep = z.strictObject({
  id: z.string().min(1),
  actor: z.enum(['code', 'model', 'human']),
  run: list.optional(),
  instruction: z.string().optional(),
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
  revisable: z.array(z.string()).default([]),
  steps: z.array(RawStep).min(1),
});

interface LoaderContext {
  /** The plugin root: `file:` instructions resolve under it. */
  root: string;
  handlers: readonly string[];
  readInstruction(relative: string): Promise<string>;
}

function parseYamlFile(file: string, text: string): unknown {
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
  } else if (raw.instruction !== undefined) {
    throw invalid(file, `${where}.instruction`, `only a model step has an instruction; this is ${raw.actor}`);
  }

  if (raw.actor === 'human' && raw.gate === undefined) throw invalid(file, `${where}.gate`, 'a human step declares its gate');
  if (raw.actor !== 'human' && raw.gate !== undefined) throw invalid(file, `${where}.gate`, `a gate goes on a human step; this is ${raw.actor}`);

  const gate = raw.gate === undefined ? null : normalizeGate(file, raw.id, 'declared', raw.gate, kinds);
  return {
    id: raw.id,
    index,
    actor: raw.actor,
    run,
    instruction,
    payload: raw.payload ?? [],
    produces: (raw.produces ?? []).map((text) => parseQualified(file, `${where}.produces`, text, kinds)),
    when: raw.when === undefined ? null : parseWhen(file, `${where}.when`, raw.when),
    gate,
    onFail: raw.onFail === undefined ? null : parseRevise(file, `${where}.onFail`, raw.onFail),
    onError: raw.onError === undefined ? { kind: 'default' } : parseOnError(file, `${where}.onError`, raw.onError),
    repeat: gate?.repeat ?? raw.repeat ?? 1,
    final: raw.final ?? false,
  };
}

function validateRoute(file: string, route: RouteDef, registry: readonly GateDef[]): void {
  const byId = new Map(route.steps.map((step) => [step.id, step]));
  const gates = new Map(route.steps.filter((step) => step.gate !== null).map((step) => [step.id, step.gate!]));

  for (const id of route.revisable) if (!byId.has(id)) throw invalid(file, 'revisable', `"${id}" is not a step of this route`);

  for (const step of route.steps) {
    const where = `step ${step.id}`;
    if (step.when?.predicate === 'gate.is' || step.when?.predicate === 'gate.isnt') {
      const gate = gates.get(step.when.gate);
      if (gate === undefined) throw invalid(file, `${where}.when`, `"${step.when.gate}" is not a gate of this route`);
      if (!gate.options.includes(step.when.option)) {
        throw invalid(file, `${where}.when`, `"${step.when.option}" is not an option of gate ${gate.id}`);
      }
    }

    const checkTarget = (revise: Revise, field: string): void => {
      if (revise.target !== RAISED_BY && !byId.has(revise.target)) throw invalid(file, `${where}.${field}`, `"${revise.target}" is not a step of this route`);
    };
    if (step.onFail !== null) checkTarget(step.onFail, 'onFail');
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
    root,
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
    const route = await loadRoute(file, text, context, registry);
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
