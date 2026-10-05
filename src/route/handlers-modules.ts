import type { Runtime } from '../composition/root.ts';
import { openRepository, projectForRequest } from '../composition/root.ts';
import { rankTerms, buildMap, leadsText, resolveLayers } from '../code-intelligence/map.ts';
import { ecosystemFacts } from '../config/ecosystems.ts';
import { loadConfigWithNotices } from '../config/load.ts';
import type { AmbicodeConfig, ProjectConfig } from '../contracts/config.ts';
import { Activity } from '../contracts/primitives.ts';
import { policyStage } from '../policy/stage.ts';
import { splitAcs } from '../requirements/acs.ts';
import { envelopeSources, normalizeEnvelope, type EnvelopeSource } from '../requirements/envelope.ts';
import { requirementsTemplate } from '../requirements/template.ts';
import type { LedgerEntry } from '../task/ledger.ts';
import { AmbicodeError } from '../util/errors.ts';
import { latestBound } from './fold.ts';
import type { Handler, HandlerInput, HandlerResult } from './handlers.ts';

const MAX_SOURCE_CHARS = 2500;
const MAX_TOTAL_CHARS = 4500;

async function configOf(input: HandlerInput): Promise<AmbicodeConfig> {
  const loaded = await loadConfigWithNotices(input.runtime.fs, input.dir.repositoryRoot);
  for (const notice of loaded.notices) if (input.runtime.notices !== undefined && !input.runtime.notices.includes(notice)) input.runtime.notices.push(notice);
  return loaded.config;
}

async function chainEntries(input: HandlerInput): Promise<LedgerEntry[]> {
  const read = await input.ledger.read();
  return read.state === 'ok' ? read.entries.filter((entry) => input.view.chainIds.includes(entry.kind === 'route' ? entry.id : String(entry['route'] ?? ''))) : [];
}

const failed = (error: unknown): HandlerResult => {
  if (error instanceof AmbicodeError) return { state: 'failed', code: error.code, message: error.message, recoverable: false };
  throw error;
};

/** The project the route works in: the one its args name, the only one, or the user's answer to `project-ambiguous`. */
async function projectOf(input: HandlerInput, config: AmbicodeConfig): Promise<ProjectConfig | HandlerResult> {
  const answered = latestBound(await chainEntries(input), 'project-ambiguous');
  const requested = input.args.project ?? (answered !== null && answered['answer'] !== 'stop' ? String(answered['answer']) : null);
  try {
    return projectForRequest(config, requested, []);
  } catch (error) {
    if (error instanceof AmbicodeError && error.code === 'ambiguous-project') return { state: 'raise', gate: 'project-ambiguous', values: { projects: config.projects.map((project) => project.id) } };
    throw error;
  }
}
const isResult = (value: ProjectConfig | HandlerResult): value is HandlerResult => 'state' in value;

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
    return { state: 'ok', payload: requirementsTemplate({ sources: [...new Set(sources)], task: input.view.task, mcpServer: config.requirements.mcpServer, runner }).text };
  },

  'requirements.normalize': async (input) => {
    const config = await configOf(input);
    const result = await normalizeEnvelope({ runtime: input.runtime, dir: input.dir, ledger: input.ledger, view: input.view, args: input.args, mcpServer: config.requirements.mcpServer });
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
    const rank = async (withProse: boolean): Promise<string[]> => {
      const envelope = (await chainEntries(input)).findLast((entry) => entry.kind === 'envelope');
      const sources = envelope === undefined ? [] : await envelopeSources(input, envelope);
      const { git } = await openRepository(input.runtime);
      const files = ecosystemFacts(project.ecosystem).i18nGlobs.length === 0 ? [] : await git.listFiles(null);
      return rankTerms(sources.length === 0 ? [{ title: '', content: input.args.text }] : sources, { runtime: input.runtime, root: input.dir.repositoryRoot, project, files, withProse });
    };
    if (terms.length === 0) terms = await rank(false);
    const { layers, source } = resolveLayers(config.search, mode);
    try {
      const build = (given: readonly string[]) => buildMap({ runtime: input.runtime, project, mode, layers, layersSource: source, terms: given, paths: [], symbols: [] });
      let map = await build(terms);
      if (map.candidates.length === 0 && stated.length === 0) {
        const wider = await rank(true);
        if (wider.join('\n') !== terms.join('\n')) map = await build(wider);
      }
      await input.ledger.append({ kind: 'map', route: input.view.routeId, ...map.entry });
      return { state: 'ok', payload: leadsText(map) };
    } catch (error) {
      return failed(error);
    }
  },

  'policy.stage': async (input) => {
    const stage = input.params[0];
    if (stage !== 'before-work' && stage !== 'before-report') return { state: 'failed', code: 'internal', message: `policy.stage takes before-work or before-report, not "${stage ?? ''}".`, recoverable: false };
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
