import path from 'node:path';
import { onGatePrint } from '#harness/gates/gates';
import { chainKey, savePayload } from '#harness/engine/execute';
import { isAmbicodeError } from '#util/errors';
import { contentHash } from '#util/hash';
import { CONFIG_FILE, TASKS_DIR } from '#types/defaults';
import { DRAFT_FILE, PROPOSAL_FILE, parseDraft, saveDraft } from '#modules/config/init/proposal';
import { APPLY_OPTIONS } from '#types/modules/config';
import type { Handler } from '#types/harness';

const GATE = 'init-apply';

onGatePrint(GATE, async ({ runtime, dir, task }) => {
  const draft = await runtime.fs.readText(path.join(dir.repositoryRoot, DRAFT_FILE)).catch(() => null);
  if (draft === null) return { line: 'No valid proposal was recorded: the detect step is out of repeats. Cancel ends the route; run /ambicode:init again.', offered: ['Cancel'], values: { draft: '' } };
  const replaces = (await runtime.fs.exists(path.join(dir.repositoryRoot, CONFIG_FILE))) ? `replaces ${CONFIG_FILE} (a .bak copy is kept)` : `creates ${CONFIG_FILE}`;
  const line = [
    `Draft: ${DRAFT_FILE} ${contentHash(draft)} (what Apply writes, exactly; ${replaces}; read it before asking).`,
    'Adjust: the user says what to change, as free text; the proposal is rewritten and this question is asked again.',
    `Apply runs: node "${runtime.pluginRoot}/scripts/ambicode.mjs" init --apply --task ${task}`,
  ].join('\n');
  return { line, offered: ['Apply', 'Adjust', 'Cancel'], values: { draft: contentHash(draft) } };
});

/** Code steps of `routes/init/init.yaml`; the scan is `skills/init/scripts/scan.mjs`. */
export const INIT_HANDLERS: Readonly<Record<string, Handler>> = {
  'init.propose': async ({ runtime, view, dir }) => {
    try {
      const text = await runtime.fs.readText(path.join(dir.steps, PROPOSAL_FILE)).catch(() => null);
      await runtime.fs.remove(path.join(dir.repositoryRoot, DRAFT_FILE)).catch(() => undefined);
      if (text === null) return { state: 'failed', code: 'init-proposal-invalid', message: 'No proposal was received. Run `init propose` with the YAML on standard input.', recoverable: true };
      await saveDraft(runtime.fs, dir.repositoryRoot, parseDraft(text));
      return { state: 'ok', payload: `Proposal accepted: ${DRAFT_FILE}.` };
    } catch (error) {
      if (!isAmbicodeError(error)) throw error;
      await savePayload(runtime.fs, dir, chainKey(view.chainIds), 'init.propose', `Proposal refused. ${error.message}`);
      return { state: 'failed', code: error.code, message: error.message, recoverable: true };
    }
  },
  'init.close': async ({ runtime, view, context, dir }) => {
    const consent = await context.consent(view, GATE);
    const doctor = await runtime.fs.readText(path.join(dir.steps, 'doctor.md')).catch(() => null);
    if (consent.state === 'honoured' && (APPLY_OPTIONS as readonly string[]).includes(consent.source.answer) && doctor !== null) {
      return { state: 'ok', payload: [`Applied: ${CONFIG_FILE} is written. Doctor:`, doctor.trimEnd(), 'Show the user this table as it is. A row that is not ok is theirs to fix: edit the command in the config, or run /ambicode:init again.'].join('\n\n') };
    }
    const taskDir = `${TASKS_DIR}/${view.task}`;
    return {
      state: 'ok',
      payload: [
        'Nothing was written: no config, no ignore line.',
        `The draft stays for a later apply: ${DRAFT_FILE}. To remove it: rm ${DRAFT_FILE}`,
        `${taskDir}/ is untracked until an applied config ignores it. To remove it: rm -r ${taskDir}`,
      ].join('\n'),
    };
  },
};
