import path from 'node:path';
import { openRepository } from '#platform/git/open';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { redactCommand } from '#platform/ledger/redact';
import type { CommandRecord } from '#platform/ports/recording-process-runner';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import type { Runtime } from '#types/composition';

export const METRICS_FILE = path.join('.ambicode', 'metrics.jsonl');
const METRIC_COMMANDS = new Set(['init', 'rules discover', 'rules apply', 'rules revert']);

export interface Invocation { name: string; argv: readonly string[]; task: string | null; exit: number; ms: number; out: number }

/** The commands this invocation ran go to its task's ledger; without a task, to `.ambicode/metrics.jsonl`. Never throws. */
export async function logInvocation(runtime: Runtime, records: readonly CommandRecord[], invocation: Invocation): Promise<void> {
  // Values can be the user's prose (answers, notes): only the command and its flag names are kept.
  const flags = invocation.argv.filter((arg) => arg.startsWith('--')).map((arg) => arg.split('=')[0]!);
  const own: CommandRecord = { argv: [redactCommand(['ambicode', invocation.name, ...flags].join(' '))], type: 'ambicode', exit: invocation.exit, ms: invocation.ms, outBytes: invocation.out };
  const all = [...records, own];
  try {
    if (invocation.task !== null) {
      const dir = await resolveTaskDir(runtime, invocation.task);
      if (await runtime.fs.exists(dir.ledger)) {
        await withLedgerLock(runtime.fs, dir.root, () => runtime.clock.now(), runtime.ids.writerId(), async (ledger) => {
          for (const record of all) await ledger.append({ kind: 'command', ...record });
        });
        return;
      }
    }
    const { repositoryRoot } = await openRepository(runtime);
    const at = runtime.clock.now().toISOString();
    const rows = all.map((record) => ({ at, kind: 'command', ...record }));
    const command = invocation.name.split(' ')[0]!;
    if (METRIC_COMMANDS.has(invocation.name)) rows.push({ at, kind: command === 'init' ? 'init' : 'rules', command: invocation.name, exit: invocation.exit, ms: invocation.ms } as never);
    const file = path.join(repositoryRoot, METRICS_FILE);
    await runtime.fs.mkdirp(path.dirname(file));
    await runtime.fs.appendText(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  } catch {
    // Instrumentation never changes a command's outcome.
  }
}
