import type { Runtime } from '../../composition/root.ts';
import { openRepository } from '../../composition/root.ts';
import { runDoctor, type DoctorTable } from '../../config/doctor.ts';
import { loadConfigWithNotices } from '../../config/load.ts';
import type { ParsedArgs } from '../args.ts';

export const DOCTOR_OPTIONS = { values: ['project'], flags: ['json'] } as const;

export interface DoctorOutput extends DoctorTable { command: 'doctor' }

/** Prints the table; writes nothing (09-D5). */
export async function runDoctorCommand(runtime: Runtime, args: ParsedArgs): Promise<DoctorOutput> {
  const { repositoryRoot } = await openRepository(runtime);
  const loaded = await loadConfigWithNotices(runtime.fs, repositoryRoot);
  const project = args.value('project');
  return { command: 'doctor', ...(await runDoctor(runtime, repositoryRoot, loaded.config, project === null ? {} : { project })) };
}

export const renderDoctor = (output: DoctorOutput): string => output.text.trimEnd();
