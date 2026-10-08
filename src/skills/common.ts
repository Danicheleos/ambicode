import { openRepository } from '#platform/git/open';
import { projectForRequest } from '#modules/config/workspace';
import { rankTerms, buildMap, leadsOf, resolveLayers, resolveTuning } from '#modules/search/text/map';
import { pathsCitedIn, symbolsCitedIn } from '#modules/search/text/seed';
import { seedTextOf } from './brief.ts';
import { loadConfigWithNotices } from '#modules/config/load';
import { readLedgerStrict } from '#platform/ledger/ledger';
import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '#types/modules/config';
import { Activity } from '#types/primitives';
import { policyStage } from '#modules/policy/stage';
import { splitAcs } from '#modules/requirements/envelope/acs';
import { envelopeSources, normalizeEnvelope } from '#modules/requirements/envelope/envelope';
import { observedTools } from '#modules/requirements/capture/binding';
import { requirementsTemplate } from '#modules/requirements/capture/template';
import { AmbicodeError } from '#util/errors';
import { latestBound } from '#harness/engine/fold';
import { onGatePrint, onRaisedAnswer } from '#harness/gates/gates';
import { CONFLICT_GATE, recordGoverning } from '#modules/requirements/envelope/conflict';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { Handler, HandlerInput, HandlerResult } from '#types/harness';
import type { EnvelopeSource } from '#types/modules/requirements';

onGatePrint('project-ambiguous', async ({ task, chain }) => {
  const head = chain.findLast((entry) => entry.kind === 'route');
  if (head?.['channel'] !== 'cli') return null;
  return { line: `The user's prompt did not start this route, so no hook records their answer. Ask the user which project with AskUserQuestion and wait for the reply; do not run route next before it. Then run: route next --task ${task} --project <id>` };
});

onRaisedAnswer(CONFLICT_GATE, async (input) => void (await recordGoverning(input)));

const MAX_SOURCE_CHARS = 2500;
const MAX_TOTAL_CHARS = 4500;

export async function configOf(input: HandlerInput): Promise<AmbicodeConfig> {
  const loaded = await loadConfigWithNotices(input.runtime.fs, input.dir.repositoryRoot);
  for (const notice of loaded.notices) if (input.runtime.notices !== undefined && !input.runtime.notices.includes(notice)) input.runtime.notices.push(notice);
  return loaded.config;
}

export async function chainEntries(input: HandlerInput): Promise<LedgerEntry[]> {
  const read = await input.ledger.read();
  return read.state === 'ok' ? read.entries.filter((entry) => input.view.chainIds.includes(entry.kind === 'route' ? entry.id : String(entry['route'] ?? ''))) : [];
}

const failed = (error: unknown): HandlerResult => {
  if (error instanceof AmbicodeError) return { state: 'failed', code: error.code, message: error.message, recoverable: false };
  throw error;
};

/** The project this harness session already chose in another task, so a later route in the session does not ask again. */
async function sessionProject(input: HandlerInput, config: AmbicodeConfig): Promise<string | null> {
  if (config.projects.length < 2) return null;
  const tasks = path.dirname(input.dir.root);
  const names = (await input.runtime.fs.readdir(tasks).catch(() => [])).filter((entry) => entry.isDirectory() && entry.name !== input.view.task).map((entry) => entry.name);
  let found: { at: string; project: string } | null = null;
  for (const name of names) {
    const read = await readLedgerStrict(input.runtime.fs, path.join(tasks, name));
    if (read.state !== 'ok') continue;
    const mine = new Set(read.entries.filter((entry) => entry.kind === 'route' && entry['session'] === input.view.session).map((entry) => String(entry['id'] ?? '')));
    for (const entry of read.entries) {
      const answer = String(entry['answer'] ?? '');
      if (entry.kind === 'acceptance' && entry['gate'] === 'project-ambiguous' && mine.has(String(entry['route'])) && config.projects.some((project) => project.id === answer) && (found === null || entry.at > found.at)) found = { at: entry.at, project: answer };
    }
  }
  return found?.project ?? null;
}

/** The project the route works in: the one its args name, the only one, or the user's answer to `project-ambiguous`. */
export async function projectOf(input: HandlerInput, config: AmbicodeConfig): Promise<ProjectConfig | HandlerResult> {
  const answered = latestBound(await chainEntries(input), 'project-ambiguous');
  const chosen = answered !== null && answered['answer'] !== 'stop' ? String(answered['answer']) : null;
  const requested = input.args.project ?? chosen ?? (await sessionProject(input, config));
  try {
    return projectForRequest(config, requested, []);
  } catch (error) {
    if (error instanceof AmbicodeError && error.code === 'ambiguous-project') return { state: 'raise', gate: 'project-ambiguous', values: { projects: config.projects.map((project) => project.id) } };
    throw error;
  }
}
export const isResult = (value: ProjectConfig | HandlerResult): value is HandlerResult => 'state' in value;

function renderSources(sources: readonly EnvelopeSource[]): string {
  let left = MAX_TOTAL_CHARS;
  return sources
    .map((source) => {
      const body = source.content.slice(0, Math.min(MAX_SOURCE_CHARS, Math.max(0, left)));
      left -= body.length;
      return `## ${source.key}${source.relation === 'args' ? '' : ` (${source.relation})`} ${source.title}\n${body}${body.length < source.content.length ? '\n[cut]' : ''}`;
    })
    .join('\n\n');
}

export const MODULE_HANDLERS: Readonly<Record<string, Handler>> = {
  'requirements.template': async (input) => {
    const config = await configOf(input);
    const first = input.args.text.trim().split(/\s+/)[0] ?? '';
    const sources = [...input.args.requirements, ...(input.args.text.match(/https?:\/\/[^\s)>\]"']+/g) ?? []), ...(/^[A-Z][A-Z0-9]+-\d+$/.test(first) ? [first] : [])];
    const runner = `node "${input.runtime.pluginRoot}/scripts/ambicode.mjs"`;
    const observed = observedTools(await chainEntries(input));
    return { state: 'ok', payload: requirementsTemplate({ sources: [...new Set(sources)], task: input.view.task, mcpServer: config.requirements.mcpServer, acceptanceField: config.requirements.acceptanceField, observedTools: observed, runner }).text };
  },

  'requirements.normalize': async (input) => {
    const config = await configOf(input);
    const result = await normalizeEnvelope({ runtime: input.runtime, dir: input.dir, ledger: input.ledger, view: input.view, args: input.args, mcpServer: config.requirements.mcpServer, acceptanceField: config.requirements.acceptanceField, runner: `node "${input.runtime.pluginRoot}/scripts/ambicode.mjs"` });
    if (result.state === 'failed') return { state: 'failed', code: result.code, message: result.message, recoverable: result.recoverable };
    if (result.state === 'raise') return { state: 'raise', gate: result.gate, values: result.values };
    // The request alone is already in the model's context; repeating it as an envelope adds nothing.
    if (result.notices.length === 0 && result.sources.every((source) => source.relation === 'args')) return { state: 'ok', payload: null };
    return { state: 'ok', payload: [...result.notices, renderSources(result.sources)].filter((part) => part !== '').join('\n\n') };
  },

  'requirements.acs': async (input) => {
    const envelope = (await chainEntries(input)).findLast((entry) => entry.kind === 'envelope');
    if (envelope === undefined) return { state: 'ok', payload: null };
    const sources = await envelopeSources(input, envelope);
    if (sources.every((source) => source.relation === 'args')) return { state: 'ok', payload: null };
    const units = splitAcs(sources);
    return { state: 'ok', payload: units.length === 0 ? null : `Acceptance units (a signal, not a checklist):\n${units.map((unit) => `${unit.id}: ${unit.quote}`).join('\n')}` };
  },

  'search.map': async (input) => {
    const config = await configOf(input);
    const project = await projectOf(input, config);
    if (isResult(project)) return project;
    const mode = input.params[0] === 'context' ? 'context' : 'prompt';
    const stated = input.revise?.args['term'] ?? [];
    let terms = [...stated];
    const chain = await chainEntries(input);
    const { git } = await openRepository(input.runtime);
    const envelope = chain.findLast((entry) => entry.kind === 'envelope');
    const envelopeSourcesOf = envelope === undefined ? [] : await envelopeSources(input, envelope);
    const seedText = mode === 'context' ? await seedTextOf(input, chain) : null;
    const units = splitAcs(envelopeSourcesOf.filter((source) => source.relation !== 'args'));
    const seedable = seedText === null ? null : [seedText, ...units.map((unit) => unit.quote)].join('\n');
    const files = seedable !== null || stated.length === 0 ? await git.listFiles(null) : [];
    const tuning = resolveTuning(config.search);
    const rank = async (withProse: boolean): Promise<string[]> => {
      const sources = seedText === null ? envelopeSourcesOf : [...envelopeSourcesOf.filter((source) => source.relation !== 'args'), { title: '', content: seedText }];
      return rankTerms(sources.length === 0 ? [{ title: '', content: input.args.text }] : sources, { runtime: input.runtime, root: input.dir.repositoryRoot, project, files, withProse, tuning: tuning.tuning });
    };
    if (terms.length === 0) terms = await rank(false);
    const { layers, source } = resolveLayers(config.search, mode);
    const paths = seedable === null ? [] : pathsCitedIn(seedable, files);
    const symbols = seedable === null ? [] : symbolsCitedIn(seedable);
    try {
      const build = (given: readonly string[]) => buildMap({ runtime: input.runtime, project, mode, layers, layersSource: source, terms: given, paths, symbols, tuning });
      let map = await build(terms);
      let retried = false;
      if (map.candidates.length === 0 && stated.length === 0) {
        const wider = await rank(true);
        if (wider.join('\n') !== terms.join('\n')) {
          map = await build(wider);
          retried = true;
        }
      }
      const decisions = { ...(map.entry['decisions'] as object), proseRetry: retried };
      const leads = leadsOf(map, tuning.tuning.leads);
      await input.ledger.append({ kind: 'map', route: input.view.routeId, ...map.entry, decisions, delivered: { leads: leads.leads, feature: leads.feature, bytes: leads.bytes, hash: leads.hash } });
      return { state: 'ok', payload: leads.text };
    } catch (error) {
      return failed(error);
    }
  },

  'policy.stage': async (input) => {
    const stage = input.params[0];
    if (stage !== 'before-work' && stage !== 'before-checks' && stage !== 'before-report') return { state: 'failed', code: 'internal', message: `policy.stage takes before-work, before-checks or before-report, not "${stage ?? ''}".`, recoverable: false };
    const config = await configOf(input);
    const project = await projectOf(input, config);
    if (isResult(project)) return project;
    const activity = Activity.safeParse(input.view.skill);
    try {
      const payload = await policyStage({ runtime: input.runtime as Runtime, project, activity: activity.success ? activity.data : 'task', paths: [], stage, show: false });
      await input.ledger.append({ kind: 'policy', route: input.view.routeId, ...payload.entry });
      // A stage with no prompt and no rule in scope prints only the omitted count, which tells the model nothing.
      const pointerOnly = payload.entry.rules === 0 && /^rulesOmitted: \d+ \(read them: [^\n]*\)$/.test(payload.text.trim());
      return { state: 'ok', payload: pointerOnly ? null : payload.text };
    } catch (error) {
      return failed(error);
    }
  },
};
