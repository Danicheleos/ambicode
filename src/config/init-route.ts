import path from 'node:path';
import type { Runtime } from '../composition/root.ts';
import type { Handler } from '../route/handlers.ts';
import { onGatePrint } from '../route/gates.ts';
import type { LedgerEntry } from '../task/ledger.ts';
import type { TaskDir } from '../task/task-dir.ts';
import { localTimestamp } from '../review/review-name.ts';
import { isAmbicodeError } from '../util/errors.ts';
import { APPLY_OPTIONS, backupOf, valuesLine } from './apply.ts';
import { CONFIG_FILE, TASKS_DIR } from './defaults.ts';
import { adjustTokens, canonicalSets, parseSet, projectOfKey, type SetPair } from './init-sets.ts';
import { applyLineFor, buildProposal, configFileState, type InitProposal } from './proposal.ts';

const GATE = 'init-apply';
const BACK_UP = 'back up and regenerate';
const PROPOSAL_FILE = 'proposal.json';

export interface InForce { pairs: SetPair[]; latest: string | null; notUnderstood: string[] }

/** Merges the `key=value` tokens of every free-text answer to the gate; later tokens win (09-G2). */
export function valuesInForce(chain: readonly LedgerEntry[], declared: readonly string[], projects: readonly string[] | null): InForce {
  const merged = new Map<string, SetPair>();
  let latest: string | null = null;
  let notUnderstood: string[] = [];
  for (const entry of chain) {
    if (entry.kind !== 'acceptance' || entry['gate'] !== GATE || declared.includes(String(entry['answer']))) continue;
    latest = String(entry['answer']);
    notUnderstood = [];
    for (const token of adjustTokens(latest)) {
      try {
        const pair = parseSet(token);
        const project = projectOfKey(pair.key);
        if (project !== null && projects !== null && !projects.includes(project)) throw new Error(`no project ${project}`);
        merged.set(pair.key, pair);
      } catch {
        notUnderstood.push(token);
      }
    }
  }
  return { pairs: [...merged.values()], latest, notUnderstood };
}

async function readProposal(runtime: Runtime, dir: TaskDir): Promise<InitProposal | null> {
  const text = await runtime.fs.readText(path.join(dir.steps, PROPOSAL_FILE)).catch(() => null);
  return text === null ? null : (JSON.parse(text) as InitProposal);
}

const relative = (dir: TaskDir, file: string): string => path.relative(dir.repositoryRoot, file);

onGatePrint(GATE, async ({ runtime, dir, task, chain, gate }) => {
  const proposal = await readProposal(runtime, dir);
  const { pairs, latest, notUnderstood } = valuesInForce(chain, gate.options, proposal?.projects.map((project) => project.id) ?? null);
  const adjusted = pairs.length > 0;
  const lines = [
    valuesLine(canonicalSets(pairs)),
    ...(latest === null ? [] : [`You wrote: "${latest}"`]),
    ...(notUnderstood.length === 0 ? [] : [`not understood: ${notUnderstood.join(' ')}`]),
    `Proposal: ${relative(dir, path.join(dir.steps, PROPOSAL_FILE))} (summarise it for the user before asking).`,
    `${adjusted ? 'Apply as adjusted' : 'Apply as proposed'} runs: ${applyLineFor(runtime, task, pairs)}`,
    'Adjust takes key=value pairs: requirements.mcpServer=<server> (name the Jira or Confluence MCP servers you can see), requirements.acceptanceField=customfield_<n>, search.index=none|codeindex, projects.<id>.commands.<lint|unit|e2e|format>=["cmd","arg"] or null.',
  ];
  return { line: lines.join('\n'), offered: [adjusted ? 'Apply as adjusted' : 'Apply as proposed', 'Adjust', 'Cancel'] };
});

/** Code steps of `routes/init.yaml` (09-R1). */
export const INIT_HANDLERS: Readonly<Record<string, Handler>> = {
  'init.propose': async ({ runtime, view, context, dir }) => {
    const root = dir.repositoryRoot;
    const file = await configFileState(runtime.fs, root);
    if (!file.parses) {
      const consent = await context.consent(view, 'config-unparsable');
      if (consent.state !== 'honoured' || consent.source.answer !== BACK_UP) return { state: 'raise', gate: 'config-unparsable', values: {} };
      if ((await backupOf(runtime.fs, root, file.raw!)) === null) {
        await runtime.fs.createExclusive(path.join(root, `${CONFIG_FILE}.bak-${localTimestamp(runtime.clock.now())}`), file.raw!);
      }
    }
    try {
      const proposal = await buildProposal(runtime, root, [], { task: view.task, regenerate: !file.parses });
      await runtime.fs.mkdirp(dir.steps);
      await runtime.fs.writeText(path.join(dir.steps, PROPOSAL_FILE), `${JSON.stringify(proposal, null, 2)}\n`);
      return { state: 'ok', payload: JSON.stringify(proposal) };
    } catch (error) {
      if (isAmbicodeError(error)) return { state: 'failed', code: error.code, message: error.message, recoverable: false };
      throw error;
    }
  },
  'init.close': async ({ runtime, view, context, dir, ledger }) => {
    const read = await ledger.read();
    const chain = read.state === 'ok' ? read.entries.filter((entry) => view.chainIds.includes(String(entry['route'] ?? entry.id))) : [];
    const applied = chain.some((entry) => entry.kind === 'step' && ['apply', 'apply-adjusted'].includes(String(entry['step'])) && entry['status'] === 'completed');
    const consent = await context.consent(view, GATE);
    const doctor = await runtime.fs.readText(path.join(dir.steps, 'doctor.md')).catch(() => null);
    if (applied && consent.state === 'honoured' && (APPLY_OPTIONS as readonly string[]).includes(consent.source.answer) && doctor !== null) {
      return {
        state: 'ok',
        payload: [
          `Applied: ${CONFIG_FILE} is written. Doctor (${relative(dir, path.join(dir.steps, 'doctor.md'))}):`,
          doctor.trimEnd(),
          'Show the user this table as it is. A row that is not ok is theirs to fix: edit the command in the config, or run /ambicode:init again.',
        ].join('\n\n'),
      };
    }
    const proposal = await readProposal(runtime, dir);
    const declared = ['Apply as proposed', 'Apply as adjusted', 'Adjust', 'Cancel'];
    const { pairs } = valuesInForce(chain, declared, proposal?.projects.map((project) => project.id) ?? null);
    const taskDir = `${TASKS_DIR}/${view.task}`;
    const raw = proposal?.configState !== 'unparsable-backed-up' ? null : (await configFileState(runtime.fs, dir.repositoryRoot)).raw;
    const backup = raw === null ? null : await backupOf(runtime.fs, dir.repositoryRoot, raw);
    return {
      state: 'ok',
      payload: [
        'Nothing was written: no config, no ignore line, no index.',
        ...(backup === null ? [] : [`The backup you approved stays: ${backup}; ${CONFIG_FILE} is unchanged.`]),
        `The proposal: ${relative(dir, path.join(dir.steps, PROPOSAL_FILE))}`,
        `To apply it later, answer the init question in /ambicode:init; the line it runs: ${applyLineFor(runtime, view.task, pairs)}`,
        `${taskDir}/ is untracked until an applied config ignores it. To remove it: rm -r ${taskDir}`,
      ].join('\n'),
    };
  },
};
