import { openRepository } from '#platform/git/open';
import { Git } from '#platform/git/git';
import { projectForRequest } from '#modules/config/workspace';
import { buildMap } from '#modules/search/map';
import { SEARCH_LAYER_DEFAULTS } from '#types/defaults';
import { pathsCitedIn, symbolsCitedIn } from '#modules/search/map';
import { briefOf, investigationOf } from './brief.ts';
import { iterationHeadings } from '#modules/evidence/task/iterations';
import { loadConfig } from '#modules/config/load';
import { readLedgerStrict } from '#platform/ledger/ledger';
import path from 'node:path';
import type { AmbicodeConfig, ProjectConfig } from '#types/modules/config';
import { proseFiles } from '#modules/context/context';
import { Activity } from '#types/primitives';
import { policyStage } from '#modules/policy/stage';
import { loadPacksForProject } from '#modules/policy/packs/load';
import { builtinPoliciesDirectory } from '#util/plugin-root';
import { envelopeSources, normalizeEnvelope } from '#modules/requirements/envelope/envelope';
import { latestCaptures, mapTextOf } from '#modules/requirements/capture/capture';
import { renderRequirements } from '#modules/requirements/envelope/render';
import { requirementsServer } from '#modules/requirements/capture/has-requirement';
import { isIssueKey } from '#util/issue-key';
import { AmbicodeError } from '#util/errors';
import { baselineIn, touchedSet } from '#modules/checks/workspace/baseline';
import { normalizeRelative, toProjectRelative } from '#util/paths';
import { isTestPath } from '#util/path-classes';
import { latestBound } from '#harness/engine/fold';
import { onGatePrint } from '#harness/gates/gates';
import { ReviewResult } from '#types/modules/review';
import type { Runtime } from '#types/composition';
import type { LedgerEntry } from '#types/modules/evidence';
import type { Handler, HandlerInput, HandlerResult } from '#types/harness';

onGatePrint('project-ambiguous', async ({ task, chain }) => {
  const head = chain.findLast((entry) => entry.kind === 'route');
  if (head?.['channel'] !== 'cli') return null;
  return { note: `The user's prompt did not start this route, so no hook records their answer. Ask the user which project with AskUserQuestion and wait for the reply; do not run route next before it. Then run: route next --task ${task} --project <id>` };
});

async function configOf(input: HandlerInput): Promise<AmbicodeConfig> {
  return (await loadConfig(input.runtime.fs, input.dir.repositoryRoot)).config;
}

export async function chainEntries(input: HandlerInput): Promise<LedgerEntry[]> {
  const read = await input.ledger.read();
  return read.state === 'ok' ? read.entries.filter((entry) => input.view.chainIds.includes(entry.kind === 'route' ? entry.id : String(entry['route'] ?? ''))) : [];
}

export const withoutIterationHeadings = (brief: string | null): string | undefined =>
  brief === null ? undefined : iterationHeadings(brief).reduceRight((text, { index }) => text.slice(0, index) + text.slice(text.indexOf('\n', index) === -1 ? text.length : text.indexOf('\n', index) + 1), brief);

export const failed = (error: unknown): HandlerResult => {
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
async function projectOf(input: HandlerInput, config: AmbicodeConfig): Promise<ProjectConfig | HandlerResult> {
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

/** The latest pinned review's result and the folder holding its changed.diff, or null when none is pinned or its file is unreadable. */
async function pinnedReview(input: HandlerInput, chain: readonly LedgerEntry[]): Promise<{ result: ReviewResult; directory: string } | null> {
  const file = chain.findLast((entry) => entry.kind === 'review')?.['result'];
  if (typeof file !== 'string') return null;
  const parsed = await input.runtime.fs.readText(path.join(input.dir.repositoryRoot, file)).then((text) => ReviewResult.safeParse(JSON.parse(text)), () => null).catch(() => null);
  return parsed?.success ? { result: parsed.data, directory: path.dirname(path.join(input.dir.repositoryRoot, file)) } : null;
}

/** The files of the latest pinned review: a merge request or branch has no local baseline, so its diff is the only list of what the change touches. */
async function reviewedFiles(input: HandlerInput, chain: readonly LedgerEntry[]): Promise<string[]> {
  const pinned = await pinnedReview(input, chain);
  return pinned === null ? [] : pinned.result.changedFiles.filter((changed) => changed.exclusionReason === null).map((changed) => changed.newPath ?? changed.oldPath ?? '').filter((name) => name !== '');
}

/** What a review's map is seeded from: the files of the pinned change and the lines it adds. Null when the head is not checked out (the working tree is not the change) or nothing is pinned. */
async function reviewSeed(input: HandlerInput, chain: readonly LedgerEntry[]): Promise<{ text: string; files: string[]; checkout: string } | null> {
  const pinned = await pinnedReview(input, chain);
  if (pinned === null || (pinned.result.target.kind === 'merge-request' && pinned.result.target.diffOnly != null)) return null;
  const files = await reviewedFiles(input, chain);
  const diff = await input.runtime.fs.readText(path.join(pinned.directory, 'changed.diff')).catch(() => '');
  // A test's lines name matchers and fixtures (`toBe`, `reportId`), not the code under review, and a spec word in the text keeps spec files in the map.
  const added = diff.split(/^(?=diff --git )/m).filter((section) => !isTestPath(/^\+\+\+ b\/(.+)$/m.exec(section)?.[1] ?? '')).flatMap((section) => section.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1)));
  return { text: [...files.filter((file) => !isTestPath(file)), ...added].join('\n'), files, checkout: pinned.result.target.repositoryRoot };
}

/** The files the stage's rules are scoped to: for review the pinned review's files, else the task's touched files once there are any, else the pinned review's; empty means no scoping, so every pack of the activity is delivered (the map's top paths used to scope it, and 8 .ts paths hid a pack scoped to .html from a task that then edited .html). */
async function stagePaths(input: HandlerInput, project: ProjectConfig, chain: readonly LedgerEntry[], activity: Activity): Promise<string[]> {
  const baseline = baselineIn(chain);
  const pinned = activity === 'review' ? await reviewedFiles(input, chain) : [];
  // A task's touched set still holds files the review excludes (a configured `excludePaths`, a narrowing): their rules were staged for files nobody reviewed.
  const touched = pinned.length > 0 || baseline === null ? [] : (await touchedSet(input.runtime as Runtime, baseline)).touched;
  const reviewed = touched.length > 0 ? [] : pinned.length > 0 ? pinned : await reviewedFiles(input, chain);
  const root = normalizeRelative(project.root);
  return (touched.length > 0 ? touched : reviewed).filter((file) => toProjectRelative(root, file) !== null);
}

const isResult = (value: ProjectConfig | HandlerResult): value is HandlerResult => 'state' in value;

export const MODULE_HANDLERS: Readonly<Record<string, Handler>> = {
  'context.list': async (input) => {
    const { git } = await openRepository(input.runtime);
    const docs = await proseFiles(input.runtime.fs, input.dir.repositoryRoot, (await git.listFiles(null)).filter((file) => !file.startsWith('.ambicode/')));
    // Docs are named because no map row reaches a file that shares no word with the request, and the model otherwise has no path to open.
    return { state: 'ok', payload: docs.length === 0 ? null : `Documentation files (path, bytes): ${docs.map((doc) => `${doc.path} ${doc.bytes}`).join(', ')}` };
  },

  'requirements.normalize': async (input) => {
    const result = await normalizeEnvelope({ runtime: input.runtime, dir: input.dir, ledger: input.ledger, view: input.view, args: input.args });
    if (result.state === 'failed') return { state: 'failed', code: result.code, message: result.message, recoverable: result.recoverable };
    if (result.state === 'raise') return { state: 'raise', gate: result.gate, values: result.values };
    // The request alone is already in the model's context; repeating it as an envelope adds nothing.
    if (result.sources.length === 0 && result.missingAsked.length === 0) return { state: 'ok', payload: null };
    // Only the task's implementer works from a file, not from the prompt: for the other routes a request this route just saved is not repeated.
    const savedNow = result.sources.every((source) => source.key === 'request') && (await latestCaptures(input.runtime.fs, input.dir, await chainEntries(input))).has('request');
    if (savedNow && result.missingAsked.length === 0 && input.view.skill !== 'task') return { state: 'ok', payload: null };
    // A bare key that nothing fetched because no requirements server is configured is a different gap from a fetch that failed.
    const unfetched = input.args.hasRequirement || requirementsServer((await configOf(input)).requirements.mcps) !== null ? [] : result.missingAsked.filter(isIssueKey);
    return { state: 'ok', payload: renderRequirements(result.sources, result.missingAsked, unfetched) };
  },

  'search.map': async (input) => {
    const config = await configOf(input);
    const project = await projectOf(input, config);
    if (isResult(project)) return project;
    const stated = input.revise?.args['term'] ?? [];
    const chain = await chainEntries(input);
    // `search.map(review)`: the reviewer brief's related files, seeded from the pinned change instead of an iteration brief or an investigation.
    const reviewing = input.params[0] === 'review';
    const review = reviewing ? await reviewSeed(input, chain) : null;
    if (reviewing && review === null) return { state: 'ok', payload: null };
    const git = review === null ? (await openRepository(input.runtime)).git : new Git({ runner: input.runtime.runner, repositoryRoot: review.checkout });
    const envelope = chain.findLast((entry) => entry.kind === 'envelope');
    const envelopeSourcesOf = envelope === undefined || reviewing ? [] : await envelopeSources(input, envelope);
    // The whole ledger, not the route's chain: the plan and the investigation were written by earlier routes of the task.
    const read = await input.ledger.read();
    const all = read.state === 'ok' ? read.entries : [];
    // Investigating again starts from the code, not from its own earlier report; plan and task build on it.
    const investigation = !reviewing && input.view.skill !== 'investigate' ? await investigationOf(input, all) : null;
    const brief = !reviewing && input.view.skill === 'task' ? withoutIterationHeadings((await briefOf(input, all)).brief) : undefined;
    const seedText = review?.text ?? brief ?? investigation?.text ?? null;
    const files = seedText === null ? [] : await git.listFiles(null);
    // The map searches each source's title and description, not the raw tracker JSON; the envelope and review evidence keep the raw capture.
    const sources = [...envelopeSourcesOf.map((source) => mapTextOf(source.content, source.title)), ...(seedText === null ? [] : [`\n${seedText}`])];
    const request = (sources.length === 0 ? [`\n${input.args.text}`] : sources).join('\n');
    try {
      const map = await buildMap(input.runtime, { project, layers: SEARCH_LAYER_DEFAULTS, terms: stated, request, paths: seedText === null ? [] : pathsCitedIn(seedText, files), symbols: seedText === null ? [] : symbolsCitedIn(seedText), ...(review === null ? {} : { exclude: review.files, checkout: review.checkout }) });
      await input.ledger.append({ kind: 'map', route: input.view.routeId, ...map.entry });
      const pointer = investigation === null ? null : `Investigation: ${investigation.path}. Read it first.`;
      return { state: 'ok', payload: [map.text, pointer].filter((part) => part !== null).join('\n') || null };
    } catch (error) {
      return failed(error);
    }
  },

  'policy.enabled': async (input) => {
    const config = await configOf(input);
    const projects = config.projects.filter((project) => !input.args.project || project.id === input.args.project);
    const seen = new Map<string, string>();
    for (const project of projects) {
      const { packs } = await loadPacksForProject({ fs: input.runtime.fs, project, builtinDirectory: builtinPoliciesDirectory(input.runtime.pluginRoot), repositoryRoot: input.dir.repositoryRoot });
      for (const { pack } of packs) for (const rule of pack.rules) seen.set(`${pack.id}/${rule.id}`, rule.instruction.replace(/\s+/g, ' ').trim());
    }
    if (seen.size === 0) return { state: 'ok', payload: null };
    const lines = [...seen].map(([id, text]) => `- ${id}: ${text}`);
    return { state: 'ok', payload: `Rules already in force; a draft that restates one is rejected:\n${lines.join('\n')}` };
  },

  'policy.stage': async (input) => {
    const stage = input.params[0];
    if (stage !== 'before-work') return { state: 'failed', code: 'internal', message: `policy.stage takes before-work, not "${stage ?? ''}".`, recoverable: false };
    const config = await configOf(input);
    const project = await projectOf(input, config);
    if (isResult(project)) return project;
    // The second param names the activity when the route's own differs: the task route's reviewer brief needs review rules.
    const named = Activity.safeParse(input.params[1] ?? input.view.skill);
    if (input.params[1] !== undefined && !named.success) return { state: 'failed', code: 'internal', message: `policy.stage's activity must be one of ${Activity.options.join(', ')}, not "${input.params[1]}".`, recoverable: false };
    const activity = named.success ? named.data : 'task';
    try {
      // The plan came from an earlier route, so the whole ledger tells whether one exists; without it nothing applied the plan (design) rules.
      const read = await input.ledger.read();
      const planless = input.params[1] === undefined && activity === 'task' && (await briefOf(input, read.state === 'ok' ? read.entries : [])).planPath === null;
      const payload = await policyStage({ runtime: input.runtime as Runtime, project, activity, ...(planless ? { alsoActivity: 'plan' as const } : {}), paths: await stagePaths(input, project, await chainEntries(input), activity), stage });
      await input.ledger.append({ kind: 'policy', route: input.view.routeId, ...payload.entry });
      return { state: 'ok', payload: payload.text.trim() === '' ? null : payload.text };
    } catch (error) {
      return failed(error);
    }
  },
};
