import path from 'node:path';
import { PROPOSAL_INPUT_FILE, applyInit } from '#modules/config/init/apply';
import type { DoctorTable } from '#types/modules/config';
import { runCommandTail } from '#harness/engine/command-tail';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import { COMMAND_SPECS } from '#skills/init/commands';
import { AmbicodeError } from '#util/errors';
import { routeTools } from '../route/route.ts';
import type { Runtime } from '#types/composition';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const INIT_OPTIONS = { values: ['task'], flags: ['json', 'apply'] } as const;
export const INIT_PROPOSE_OPTIONS = { values: ['task'], flags: ['json'] } as const;
const MAX_PROPOSAL_YAML_BYTES = 32_768;

interface InitApplyOutput {
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

interface InitHint { command: 'init'; mode: 'hint' }
type InitOutput = InitApplyOutput | InitHint;

/** Without `--apply` init only points at the skill: the proposal is the model's judgment, made inside the init route. `--apply` writes only after the human's answer to the init question. */
export async function runInit(runtime: Runtime, args: ParsedArgs): Promise<InitOutput> {
  if (!args.flag('apply')) return { command: 'init', mode: 'hint' };
  const task = args.value('task');
  if (task === null) throw new AmbicodeError('bad-argument', '"init --apply" needs --task <slug>: the init task the question was asked in.', { field: 'task' });
  const tools = await routeTools(runtime, task);
  const { result, binding } = await tools.engine.command(COMMAND_SPECS.initApply, { task }, async ({ session, context, binding }) => ({
    binding,
    result: await applyInit({ runtime, session, context }, { task }),
  }));
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'init --apply', session: binding });
  return { command: 'init', mode: 'apply', ...result, ...(next === null ? {} : { next: next.text }) };
}

/** Stores the model's proposal YAML in the task and advances the route; `init.propose` validates it there, so a bad field returns to `detect`. */
export async function runInitPropose(runtime: Runtime, args: ParsedArgs): Promise<{ command: 'init propose'; task: string; bytes: number; next?: string }> {
  const task = args.value('task');
  if (task === null) throw new AmbicodeError('bad-argument', '"init propose" needs --task <slug>: the init task the proposal belongs to.', { field: 'task' });
  const text = (await runtime.stdin.read(MAX_PROPOSAL_YAML_BYTES)) ?? '';
  if (text.trim() === '') throw new AmbicodeError('bad-argument', '"init propose" reads the proposal YAML from standard input.', { field: 'stdin' });
  const tools = await routeTools(runtime, task);
  const { binding } = await tools.engine.command(COMMAND_SPECS.initPropose, { task }, async ({ binding }) => ({ binding }));
  const dir = await resolveTaskDir(runtime, task);
  await runtime.fs.mkdirp(dir.steps);
  await runtime.fs.writeText(path.join(dir.steps, PROPOSAL_INPUT_FILE), text);
  const next = await runCommandTail({ engine: tools.engine }, { task, cause: 'init propose', session: binding });
  return { command: 'init propose', task, bytes: Buffer.byteLength(text), ...(next === null ? {} : { next: next.text }) };
}

export function renderInit(output: InitOutput): string {
  if (output.mode === 'hint') return 'Run /ambicode:init: the route scans the repository, proposes the configuration and asks you before anything is written.';
  const lines = [`${output.created ? 'Created' : 'Updated'} ${output.configPath}`];
  if (output.gitignoreAdded.length > 0) lines.push(`Added to .gitignore: ${output.gitignoreAdded.join(', ')}`);
  if (output.changes.length > 0) lines.push('', 'Changes:', ...output.changes.map((change) => `  - ${change}`));
  if (output.notices.length > 0) lines.push('', 'Notices:', ...output.notices.map((notice) => `  - ${notice.split('\n').join('\n    ')}`));
  lines.push('', 'Doctor:', output.doctor.text.trimEnd());
  if (output.next !== undefined) lines.push('', output.next);
  return lines.join('\n');
}

export const initCommand: CliCommand = {
  name: 'init',
  summary: 'Point at /ambicode:init; --apply writes the accepted config, inside the init route only.',
  options: INIT_OPTIONS,
  run: async (runtime, args) => {
    const output = await runInit(runtime, args);
    return { text: renderInit(output), data: output };
  },
};

export const initProposeCommand: CliCommand = {
  name: 'init propose',
  summary: 'Hand the init route the proposal YAML on standard input (--task).',
  options: INIT_PROPOSE_OPTIONS,
  run: async (runtime, args) => {
    const output = await runInitPropose(runtime, args);
    return { text: output.next ?? `Proposal stored (${output.bytes} bytes); no live init route advanced.`, data: output };
  },
};
