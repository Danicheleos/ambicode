import path from 'node:path';
import { CONFIG_FILE } from '#types/defaults';
import { parseConfig } from '#modules/config/load';
import { isAmbicodeError } from '#util/errors';
import { openRepository } from '#platform/git/open';
import type { CliCommand } from '../../types/cli.ts';

/** The zod schema is the one source of truth; this lists every issue at once so one corrective Write can fix them all. */
export const configValidateCommand: CliCommand = {
  name: 'config validate',
  summary: `Check ${CONFIG_FILE} against the schema: prints ok or the list of problems.`,
  options: { flags: ['json'] },
  run: async (runtime) => {
    const { repositoryRoot } = await openRepository(runtime);
    let issues: string[] = [];
    try {
      parseConfig(await runtime.fs.readText(path.join(repositoryRoot, CONFIG_FILE)));
    } catch (error) {
      if (!isAmbicodeError(error) && !(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      issues = isAmbicodeError(error) ? (error.details.length > 0 ? error.details : [error.message]) : [`${CONFIG_FILE}: missing`];
    }
    return { text: issues.length === 0 ? 'ok' : issues.join('\n'), data: { ok: issues.length === 0, issues }, exitCode: issues.length === 0 ? 0 : 1 };
  },
};
