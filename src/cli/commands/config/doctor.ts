import { openRepository } from '#platform/git/open';
import { runDoctor } from '#modules/config/init/doctor';
import { loadConfigWithNotices } from '#modules/config/load';
import type { Runtime } from '#types/composition';
import type { DoctorTable } from '#types/modules/config';
import type { ParsedArgs, CliCommand } from '../../types/cli.ts';

export const DOCTOR_OPTIONS = { values: ['project'], flags: ['json'] } as const;

interface DoctorOutput extends DoctorTable { command: 'doctor' }

/** Prints the table; writes nothing (09-D5). */
export async function runDoctorCommand(runtime: Runtime, args: ParsedArgs): Promise<DoctorOutput> {
  const { repositoryRoot } = await openRepository(runtime);
  const loaded = await loadConfigWithNotices(runtime.fs, repositoryRoot);
  const project = args.value('project');
  return { command: 'doctor', ...(await runDoctor(runtime, repositoryRoot, loaded.config, project === null ? {} : { project })) };
}

export const renderDoctor = (output: DoctorOutput): string => output.text.trimEnd();

export const doctorCommand: CliCommand = {
  name: 'doctor',
  options: DOCTOR_OPTIONS,
  run: async (runtime, args) => {
    const output = await runDoctorCommand(runtime, args);
    return { text: renderDoctor(output), data: output };
  },
};
