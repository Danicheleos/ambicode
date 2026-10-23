import { realpathSync } from 'node:fs';
import { createRuntime } from '#composition/root';
import { AmbicodeError, isAmbicodeError } from '#util/errors';
import { formatJsonOutput } from '#util/json-output';
import { parseArgs } from '#util/args';
import { taskWorkingDirectory } from '#modules/evidence/task/task-dir';
import { MAX_HOOK_INPUT_BYTES } from '#types/hook';
import { COMMANDS, USAGE } from './commands/registry.ts';
import type { CliCommand, ParsedArgs, Rendered } from './types/cli.ts';

export async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }

  // The hook entry point has its own I/O contract (stdin JSON in, hook JSON out,
  // always exit 0), so it bypasses option parsing and `dispatch`.
  if (command === 'hook') {
    const { runHook } = await import('#hook/events/run-hook');
    const runtime = await createRuntime();
    const stdin = (await runtime.stdin.read(MAX_HOOK_INPUT_BYTES)) ?? '';
    const output = await runHook(runtime, stdin);
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return 0;
  }

  const name = COMMANDS.has(`${command} ${rest[0]}`) ? `${command} ${rest[0]}` : command;
  const commandArgv = name === command ? rest : rest.slice(1);

  const entry = COMMANDS.get(name);
  if (entry === undefined) {
    process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
    return 2;
  }

  try {
    // Parsed and validated before any runtime exists: a bad argument must not
    // reach a process, the filesystem or a provider.
    const args = parseArgs(name, commandArgv, entry.options);
    entry.validate?.(args);
    const rendered = await dispatch(entry, args);
    for (const warning of rendered.warnings ?? []) process.stderr.write(`${warning}\n`);
    process.stdout.write(
      args.flag('json') ? formatJsonOutput(rendered.data, rendered.json ?? 'pretty') : `${rendered.text}\n`,
    );
    return rendered.exitCode ?? 0;
  } catch (error) {
    return reportFailure(error);
  }
}


async function dispatch(command: CliCommand, args: ParsedArgs): Promise<Rendered> {
  const shell = await createRuntime();
  const task = args.value('task');
  const cwd = task === null ? shell.cwd : await taskWorkingDirectory(shell, task);
  const runtime = cwd === shell.cwd ? shell : { ...(await createRuntime({ cwd })), invokedFrom: shell.cwd };
  const rendered = await command.run(runtime, args);
  const notices = runtime.notices ?? [];
  return notices.length === 0 ? rendered : { ...rendered, warnings: [...notices, ...(rendered.warnings ?? [])] };
}

/**
 * An operator-facing failure prints its code, field and remedy, never a stack;
 * anything unrecognized is a defect and keeps its stack.
 */
function reportFailure(error: unknown): number {
  if (isAmbicodeError(error)) {
    const typed: AmbicodeError = error;
    const lines = [`error [${typed.code}]: ${typed.message}`];
    if (typed.field !== undefined) lines.push(`  at: ${typed.field}`);
    for (const detail of typed.details) lines.push(`  - ${detail}`);
    process.stderr.write(`${lines.join('\n')}\n`);
    return 2;
  }
  process.stderr.write(
    `unexpected failure: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  return 70;
}

// Only when this module *is* the program: importing it must not run a command.
if (process.argv[1] !== undefined && import.meta.filename === realEntryPoint()) {
  process.exitCode = await main(process.argv.slice(2));
}

function realEntryPoint(): string | null {
  const entry = process.argv[1];
  if (entry === undefined) return null;
  try {
    return realpathSync(entry);
  } catch {
    return entry;
  }
}
