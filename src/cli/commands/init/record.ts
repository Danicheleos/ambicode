import { AmbicodeError } from '#util/errors';
import { recordInit } from '#modules/evidence/init-entry';
import type { CliCommand } from '../../types/cli.ts';

/** The scaffold script runs outside the bundle; this is how its outcome reaches the init task's ledger. */
export const initRecordCommand: CliCommand = {
  name: 'init record',
  summary: 'Log an init step to tasks/init.',
  options: { values: ['task', 'what', 'outcome'], flags: ['json'] },
  run: async (runtime, args) => {
    const [task, what, outcome] = [args.value('task'), args.value('what'), args.value('outcome')];
    if (task === null || what === null || outcome === null) {
      throw new AmbicodeError('bad-argument', '"init record" needs --task, --what and --outcome.', { field: task === null ? 'task' : what === null ? 'what' : 'outcome' });
    }
    await recordInit(runtime, task, what, outcome);
    return { text: `recorded ${what} in task ${task}`, data: { task, what, outcome } };
  },
};
