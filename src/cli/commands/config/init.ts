import { openRepository } from '#composition/root';
import { applyInit } from '#modules/config/init/apply';
import { parseSets } from '#modules/config/init/init-sets';
import { buildProposal } from '#modules/config/init/proposal';
import type { SearchProfile, DoctorTable, InitProposal } from '#types/config';
import { runCommandTail } from '#harness/engine/command-tail';
import { ledgerRouteContext } from '#harness/engine/context';
import { AmbicodeError } from '#util/errors';
import { routeTools } from '../route/route.ts';
import type { Runtime } from '#types/composition';
import type { ParsedArgs } from '../../types/cli.ts';

export interface InitApplyOutput {
  command: 'init';
  mode: 'apply';
  configPath: string;
  created: boolean;
  changes: string[];
  notices: string[];
  gitignoreAdded: string[];
  doctor: DoctorTable;
  next?: string;
}

export type InitOutput = InitProposal | InitApplyOutput;

/**
 * Without `--apply` a dry run: it proposes and writes nothing (D1). `--apply` writes only after the
 * human's answer to the init question in the live init route (09-G4).
 */
export async function runInit(runtime: Runtime, args: ParsedArgs): Promise<InitOutput> {
  const sets = args.all('set');
  if (!args.flag('apply')) {
    const { repositoryRoot } = await openRepository(runtime);
    const task = args.value('task');
    return buildProposal(runtime, repositoryRoot, parseSets(sets), { refreshProfile: args.flag('refresh-profile'), ...(task === null ? {} : { task }) });
  }
  const task = args.value('task');
  if (task === null) throw new AmbicodeError('bad-argument', '"init --apply" needs --task <slug>: the init task the question was asked in.', { field: 'task' });
  const tools = await routeTools(runtime, task);
  const session = tools.binding.state === 'bound' ? tools.binding.session : null;
  const result = await applyInit({ runtime, session, context: ledgerRouteContext({ runtime, routes: tools.routes }) }, { task, sets, refreshProfile: args.flag('refresh-profile') });
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'init --apply', session: tools.binding });
  return { command: 'init', mode: 'apply', ...result, ...(next === null ? {} : { next: next.text }) };
}

export function renderInit(output: InitOutput): string {
  return output.mode === 'apply' ? renderApply(output) : renderProposal(output);
}

function renderApply(output: InitApplyOutput): string {
  const lines = [`${output.created ? 'Created' : 'Updated'} ${output.configPath}`];
  if (output.gitignoreAdded.length > 0) lines.push(`Added to .gitignore: ${output.gitignoreAdded.join(', ')}`);
  if (output.changes.length > 0) lines.push('', 'Changes:', ...output.changes.map((change) => `  - ${change}`));
  if (output.notices.length > 0) lines.push('', 'Notices:', ...output.notices.map((notice) => `  - ${notice.split('\n').join('\n    ')}`));
  lines.push('', 'Doctor:', output.doctor.text.trimEnd());
  if (output.next !== undefined) lines.push('', output.next);
  return lines.join('\n');
}

function renderProposal(output: InitProposal): string {
  const lines = [`Proposal for ${output.configPath} (${output.configState}; dry run: nothing was written)`];
  for (const project of output.projects) {
    lines.push('', `${project.id}  [${project.ecosystem}]  root: ${project.root}`);
    for (const [slot, argv] of Object.entries({ ...project.commands, format: project.format })) lines.push(`  ${slot.padEnd(7)} ${argv === null ? '(none)' : argv.join(' ')}`);
    lines.push(`  packs   ${project.packs.join(', ') || '(none)'}`);
    lines.push(...profileLines(project.profile));
  }
  lines.push('', `index: ${output.index.proposed} (tool: ${output.index.tool ?? 'not found'}; decision 5-I: ${output.index.decision5I})`);
  lines.push(`search layers: prompt ${output.searchLayers.prompt.join(', ')}; context ${output.searchLayers.context.join(', ')}`);
  if (output.gitignore.missing.length > 0) lines.push(`.gitignore lines to add: ${output.gitignore.missing.join(', ')}`);
  if (output.removedFields.length > 0) lines.push(`removed fields: ${output.removedFields.join(', ')}`);
  if (output.ruleSources.length > 0) {
    lines.push('', 'Rule sources to migrate (none was read):', ...output.ruleSources.map((source) => `  - ${source}`));
    lines.push('  Run /ambicode:rules to turn the rules these state into scoped YAML packs.');
  }
  if (output.changes.length > 0) lines.push('', 'Changes:', ...output.changes.map((change) => `  - ${change}`));
  if (output.notices.length > 0) lines.push('', 'Notices:', ...output.notices.map((notice) => `  - ${notice.split('\n').join('\n    ')}`));
  if (output.noticesOmitted > 0) lines.push(`  (${output.noticesOmitted} more notices omitted)`);
  lines.push('', 'Apply it through /ambicode:init: the init question records your answer; then the route runs:', `  ${output.applyLine}`);
  return lines.join('\n');
}

/** The search profile, one line per field (03c-P7). */
export function profileLines(profile: SearchProfile | null): string[] {
  if (profile === null) return ['  search profile:    none (run `ambicode init --refresh-profile`)'];
  return [
    `  search profile:    measured at ${profile.stamp.commit.slice(0, 12) || '(no commit)'}, ${profile.stamp.files} files`,
    `    sources       ${profile.sources.join(', ') || '(none)'}`,
    `    companions    ${profile.companions.map(([from, to]) => `${from} → ${to}`).join(', ') || '(none)'}`,
    `    catalogs      ${profile.catalogs.join(', ') || '(none)'}`,
    `    featureKinds  ${profile.featureKinds.join(', ') || '(none)'}`,
    `    exportOnly    ${String(profile.exportOnly)}`,
  ];
}
