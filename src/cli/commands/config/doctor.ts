import { openRepository } from '#composition/root';
import { runDoctor } from '#modules/config/init/doctor';
import { loadConfigWithNotices } from '#modules/config/load';
import type { Runtime } from '#types/composition';
import type { DoctorTable } from '#types/modules/config';
import type { ParsedArgs } from '../../types/cli.ts';

interface DoctorOutput extends DoctorTable { command: 'doctor' }

/** Prints the table; writes nothing (09-D5). */
export async function runDoctorCommand(runtime: Runtime, args: ParsedArgs): Promise<DoctorOutput> {
  const { repositoryRoot } = await openRepository(runtime);
  const loaded = await loadConfigWithNotices(runtime.fs, repositoryRoot);
  const project = args.value('project');
  return { command: 'doctor', ...(await runDoctor(runtime, repositoryRoot, loaded.config, project === null ? {} : { project })) };
}

export const renderDoctor = (output: DoctorOutput): string => output.text.trimEnd();
