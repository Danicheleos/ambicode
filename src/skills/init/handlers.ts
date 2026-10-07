import path from 'node:path';
import { onGatePrint } from '#harness/gates/gates';
import { localTimestamp } from '#util/files';
import { isAmbicodeError } from '#util/errors';
import { PREVIOUS_DRAFT, backupOf } from '#modules/config/init/apply';
import { CONFIG_FILE, TASKS_DIR } from '#types/defaults';
import { INIT_ANSWERS, choiceGroups, choicesInForce, lineDiff } from '#modules/config/init/init-choices';
import { setStrings } from '#modules/config/init/init-sets';
import { DRAFT_FILE, applyLineFor, buildProposal, configFileState, saveDraft } from '#modules/config/init/proposal';
import type { Runtime } from '#types/composition';
import { APPLY_OPTIONS, type SetPair, type InitProposal } from '#types/modules/config';
import type { LedgerEntry, TaskDir } from '#types/modules/evidence';
import type { Handler } from '#types/harness';

const GATE = 'init-apply';
const BACK_UP = 'back up and regenerate';
const PROPOSAL_FILE = 'proposal.json';

/** The overrides every earlier choice answer of the gate put in force, and the answers that were no printed choice. */
function choicesOf(chain: readonly LedgerEntry[], projects: readonly string[] | null): { pairs: SetPair[]; latest: string | null; notUnderstood: string[] } {
  const answers = chain.filter((entry) => entry.kind === 'acceptance' && entry['gate'] === GATE && !INIT_ANSWERS.includes(String(entry['answer']))).map((entry) => String(entry['answer']));
  const latest = answers.at(-1) ?? null;
  return { pairs: choicesInForce(answers, projects).pairs, latest, notUnderstood: latest === null ? [] : choicesInForce([latest], projects).notUnderstood };
}

async function readProposal(runtime: Runtime, dir: TaskDir): Promise<InitProposal | null> {
  const text = await runtime.fs.readText(path.join(dir.steps, PROPOSAL_FILE)).catch(() => null);
  return text === null ? null : (JSON.parse(text) as InitProposal);
}

const relative = (dir: TaskDir, file: string): string => path.relative(dir.repositoryRoot, file);

onGatePrint(GATE, async ({ runtime, dir, task, chain }) => {
  const stored = await readProposal(runtime, dir);
  const { pairs, latest, notUnderstood } = choicesOf(chain, stored?.projects.map((project) => project.id) ?? null);
  const root = dir.repositoryRoot;
  const file = await configFileState(runtime.fs, root);
  const proposal = await buildProposal(runtime, root, pairs, { task, regenerate: !file.parses });
  const { yaml, hash } = await saveDraft(runtime.fs, root, proposal, pairs);
  const previous = await runtime.fs.readText(path.join(dir.steps, PREVIOUS_DRAFT)).catch(() => null);
  if (previous !== null) await runtime.fs.remove(path.join(dir.steps, PREVIOUS_DRAFT));
  const adjusted = pairs.length > 0;
  const lines = [
    `Draft: ${DRAFT_FILE} ${hash} (what Apply writes, exactly; read it before asking).`,
    ...(previous === null ? [] : ['Detection changed since you were asked; the draft now differs:', ...lineDiff(previous, yaml).slice(0, 40)]),
    ...(adjusted ? [`Chosen so far: ${setStrings(pairs).join(' ')}`] : []),
    ...(latest === null || notUnderstood.length === 0 ? [] : [`not understood: ${notUnderstood.join(' ')}`]),
    `Proposal: ${relative(dir, path.join(dir.steps, PROPOSAL_FILE))} (summarise it for the user before asking).`,
    'Separate choices; each is an answer to this question and the question is asked again with the draft updated:',
    ...choiceGroups(proposal, pairs).flatMap((group) => [`  ${group.title}:`, ...group.choices.map((choice) => `    ${choice}`)]),
    `${adjusted ? 'Apply as adjusted' : 'Apply as proposed'} runs: ${applyLineFor(runtime, task)}`,
  ];
  return { line: lines.join('\n'), offered: [adjusted ? 'Apply as adjusted' : 'Apply as proposed', 'Adjust', 'Cancel'], values: { set: setStrings(pairs), draft: hash } };
});

/** Code steps of `routes/init/init.yaml` (09-R1). */
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
      await saveDraft(runtime.fs, root, proposal, []);
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
    const taskDir = `${TASKS_DIR}/${view.task}`;
    const raw = proposal?.configState !== 'unparsable-backed-up' ? null : (await configFileState(runtime.fs, dir.repositoryRoot)).raw;
    const backup = raw === null ? null : await backupOf(runtime.fs, dir.repositoryRoot, raw);
    return {
      state: 'ok',
      payload: [
        'Nothing was written: no config, no ignore line, no index.',
        ...(backup === null ? [] : [`The backup you approved stays: ${backup}; ${CONFIG_FILE} is unchanged.`]),
        `The proposal: ${relative(dir, path.join(dir.steps, PROPOSAL_FILE))}`,
        `The draft stays for a later apply: ${DRAFT_FILE}. To remove it: rm ${DRAFT_FILE}`,
        `To apply it later, answer the init question in /ambicode:init; the line it runs: ${applyLineFor(runtime, view.task)}`,
        `${taskDir}/ is untracked until an applied config ignores it. To remove it: rm -r ${taskDir}`,
      ].join('\n'),
    };
  },
};
