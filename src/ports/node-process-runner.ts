import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { execa, type Options, type ResultPromise } from 'execa';
import { resolveEnvironment, type ProcessOutcome, type ProcessRequest, type ProcessRunner } from './process.ts';

/**
 * Executes an argument vector through Execa (doc 11). There is no shell: a
 * configured command is an executable plus arguments, so command substitution
 * and redirection in a configuration value cannot be interpreted (doc 05).
 */
export class NodeProcessRunner implements ProcessRunner {
  private readonly baseEnv: Record<string, string | undefined>;

  /** The composition root reads the host environment once and supplies it here. */
  constructor(baseEnv: Record<string, string | undefined> = process.env) {
    this.baseEnv = baseEnv;
  }

  async run(request: ProcessRequest): Promise<ProcessOutcome> {
    const [executable, ...args] = request.argv;
    if (executable === undefined) {
      return outcome('spawn-failed', { failure: 'empty argument vector' });
    }

    // The request's declared policy applied to the injected base, never a
    // cloned process.env: a replacement policy means the host's other
    // variables are absent from the child, not merely unused (doc 02).
    const environment = resolveEnvironment(request.env, this.baseEnv);

    // Windows only, and before anything is spawned: see `windowsCommandExists`
    // for why the outcome below cannot tell a missing command from one that
    // ran and failed on this platform. The message deliberately mirrors the
    // `spawn <command> ENOENT` that Unix produces, so a caller — and D06's
    // notice-and-skip path — reads one shape everywhere.
    if (process.platform === 'win32' && !windowsCommandExists(executable, environment, request.cwd)) {
      return outcome('spawn-failed', { failure: `spawn ${executable} ENOENT` });
    }

    const capture = new CombinedCapture(request.maxOutputBytes);
    const started = performance.now();

    // Windows manages its own deadline below, because Execa's kills only reach
    // the process it spawned. See `killProcessTree`.
    const ownDeadline = process.platform === 'win32';

    const options: Options = {
      cwd: request.cwd,
      env: environment,
      extendEnv: false,
      shell: false,
      timeout: ownDeadline ? undefined : request.timeoutMs,
      // Kills the whole group where the platform supports it, so a timeout does
      // not leave a known descendant running (doc 02).
      forceKillAfterDelay: 2_000,
      killSignal: 'SIGKILL',
      cleanup: true,
      encoding: 'buffer',
      buffer: false,
      stdin: request.stdin === undefined ? 'ignore' : 'pipe',
      reject: false,
    };

    let child: ResultPromise<Options>;
    try {
      child = execa(executable, args, options);
    } catch (error) {
      return outcome('spawn-failed', { failure: messageOf(error) });
    }

    child.stdout?.on('data', (chunk: Buffer) => capture.push('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => capture.push('stderr', chunk));
    if (request.stdin !== undefined) child.stdin?.end(request.stdin);

    // Fired while the tree is still intact, which is why it replaces Execa's
    // timeout rather than running beside it: `taskkill /T` walks living
    // children, and by the time Execa's kill has taken the shim down there is
    // no tree left to walk.
    let killedByDeadline = false;
    const deadline =
      ownDeadline && request.timeoutMs > 0
        ? setTimeout(() => {
            killedByDeadline = true;
            killProcessTree(child.pid);
          }, request.timeoutMs)
        : undefined;

    let result: Awaited<ResultPromise<Options>>;
    try {
      result = await child;
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
    }
    const durationMs = Math.round(performance.now() - started);
    const decoded = capture.decode();

    const base = { ...decoded, durationMs };
    if (result.timedOut === true || killedByDeadline) return outcome('timed-out', base);
    // Whatever Execa did reach the operating system with, it failed to start:
    // a permission error, or a `cwd` that does not exist. Both arrive as a
    // `code` with no exit code and no signal, on all three platforms — the
    // missing-command case is the one that does not, and is already handled
    // above. A process that ran and failed has an exit code instead.
    if (result.failed === true && result.exitCode === undefined && result.signal === undefined) {
      return outcome('spawn-failed', { ...base, failure: result.shortMessage ?? messageOf(result) });
    }
    return outcome('exited', { ...base, exitCode: result.exitCode ?? null });
  }
}

/**
 * Kills a process and everything it started, on Windows only.
 *
 * Execa's `timeout`, `killSignal` and `forceKillAfterDelay` all act on the
 * process it spawned. Windows has no process group for a signal to propagate
 * through, so a command that starts its own child — every `.cmd` shim does,
 * since it is `cmd.exe` running the real program — leaves that child alive. It
 * keeps the inherited stdout and stderr pipes open, and `await child` never
 * settles. Measured: a `vitest.cmd` whose node child held a timer ran 30,076ms
 * against a 5s ceiling, and with an unbounded timer `ambicode bundle` was still
 * waiting 18 minutes later, so nothing timed out and nothing was reported.
 *
 * `taskkill /T` is the OS's own tree walk, which is why this is a spawn rather
 * than a hand-rolled traversal of `wmic` output. Failures are ignored: the
 * process may have exited between the deadline and this call, and an error here
 * must not replace whatever the command itself was going to report.
 */
function killProcessTree(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    const killer = spawn('taskkill', ['/T', '/F', '/PID', String(pid)], {
      stdio: 'ignore',
      windowsHide: true,
      detached: false,
    });
    killer.on('error', () => {});
    killer.unref();
  } catch {
    // Nothing to add: the deadline has already decided the outcome.
  }
}

/** `PATHEXT`'s documented default, used when the environment does not set one. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC';

/**
 * Windows only: could this command resolve to a file the OS can start?
 *
 * Observed empirically on Windows 11 with Execa 10.0.1 and Node 24.18: when
 * Execa cannot resolve a command to a `.exe`/`.com` it does not fail — it
 * hands the command line to `cmd.exe /d /s /c` instead
 * (`execa/lib/arguments/command-file.js`). A command that is not installed
 * therefore never reaches Node's spawn at all. `cmd.exe` itself starts
 * perfectly well, writes its localized "is not recognized as an internal or
 * external command" to stderr, and exits **1** (measured; not the 9009 an
 * interactive shell reports). The result object carries
 * `{ failed: true, exitCode: 1, code: undefined, signal: undefined }`, which
 * is exactly what a linter that ran and found problems returns. The previous
 * `exitCode === undefined` test could not separate them, so on Windows an
 * uninstalled linter was reported as a *failed lint check* rather than the
 * notice-and-skip D06 requires.
 *
 * Resolution therefore has to happen before the spawn. This mirrors Execa's
 * own search — `PATHEXT`, the current directory ahead of `PATH`, quoted
 * `PATH` entries, an explicit path resolved rather than searched — but at
 * every choice it is deliberately *more* permissive: it also tries the bare
 * name with no extension, always searches the current directory, and counts
 * an `EACCES` from `stat` as present. A command this reports missing is one
 * Execa could not have resolved either; anything uncertain is spawned and
 * classified exactly as it was before.
 *
 * Unix is untouched. There the OS resolves the command and Execa surfaces the
 * real `ENOENT`/`EACCES` through `code`, which `run` already classified
 * correctly, so this function is never called.
 *
 * `statSync` is deliberate: the check must observe the same real filesystem
 * `CreateProcess` is about to, so it cannot go through an injectable port
 * whose fake could disagree with the host. This is the Node adapter layer,
 * where doc 11 permits `node:fs`.
 */
export function windowsCommandExists(
  command: string,
  environment: Readonly<Record<string, string>>,
  cwd: string,
): boolean {
  for (const candidate of windowsCandidates(command, environment, cwd)) {
    if (isExistingFile(candidate)) return true;
  }
  return false;
}

function* windowsCandidates(
  command: string,
  environment: Readonly<Record<string, string>>,
  cwd: string,
): Generator<string> {
  // Windows environment names are case-insensitive, and a child can be handed
  // `Path` rather than `PATH`.
  const lookup = (name: string): string | undefined => {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(environment)) {
      if (key.toLowerCase() === wanted) return value;
    }
    return undefined;
  };

  // Windows separates both lists with `;` whatever `path.delimiter` says on
  // the host running this code, so the function behaves identically wherever
  // it is unit-tested. `||` not `??`: an empty `PATHEXT` falls back to the
  // default instead of disabling every extension.
  // The leading '' tries the name verbatim — wider than Execa, on purpose.
  const extensions = ['', ...(lookup('PATHEXT') || DEFAULT_PATHEXT).split(';').filter(Boolean)];

  // A command carrying a separator or a drive letter is a path: it is resolved
  // against `cwd`, never searched for along `PATH`.
  const directories = /[\\/:]/.test(command)
    ? [cwd]
    : [cwd, ...(lookup('PATH') ?? '').split(';')];

  for (const directory of directories) {
    const unquoted =
      directory.length > 1 && directory.startsWith('"') && directory.endsWith('"')
        ? directory.slice(1, -1)
        : directory;
    // An empty `PATH` entry is skipped rather than read as the current
    // directory: implicitly searching it is the classic planting attack.
    if (unquoted === '') continue;
    let base: string;
    try {
      base = path.resolve(unquoted, command);
    } catch {
      continue;
    }
    for (const extension of extensions) yield base + extension;
  }
}

function isExistingFile(candidate: string): boolean {
  try {
    // A directory is not a command, even though it stats cleanly.
    return statSync(candidate).isFile();
  } catch (error) {
    // A Windows App Execution Alias (under `WindowsApps`) is launchable but
    // throws `EACCES` on `stat`; calling it missing would break a real tool.
    return (error as NodeJS.ErrnoException).code === 'EACCES';
  }
}

/**
 * One retained-byte ceiling across both streams (doc 02, v1). Chunks are kept
 * in arrival order per stream and cut on a byte boundary; decoding happens once
 * at the end so a multibyte character split across two chunks survives, and a
 * character split by the ceiling is dropped rather than turned into U+FFFD.
 */
export class CombinedCapture {
  private readonly limit: number;
  private readonly chunks: { stream: 'stdout' | 'stderr'; bytes: Buffer }[] = [];
  private retained = 0;
  private truncated = false;

  constructor(limit: number) {
    this.limit = Math.max(0, limit);
  }

  push(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    const room = this.limit - this.retained;
    if (chunk.length === 0) return;
    if (room <= 0) {
      this.truncated = true;
      return;
    }
    if (chunk.length > room) {
      this.chunks.push({ stream, bytes: chunk.subarray(0, room) });
      this.retained += room;
      this.truncated = true;
      return;
    }
    this.chunks.push({ stream, bytes: chunk });
    this.retained += chunk.length;
  }

  decode(): { stdout: string; stderr: string; truncated: boolean } {
    const join = (stream: 'stdout' | 'stderr'): string => {
      const bytes = Buffer.concat(
        this.chunks.filter((entry) => entry.stream === stream).map((entry) => entry.bytes),
      );
      return decodeCompleteUtf8(bytes);
    };
    return { stdout: join('stdout'), stderr: join('stderr'), truncated: this.truncated };
  }
}

/**
 * Decodes only whole UTF-8 sequences. A trailing partial sequence — the one
 * truncation can produce — is discarded, so the retained prefix is always valid
 * text and never reports a replacement character the program did not emit.
 */
export function decodeCompleteUtf8(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, completeLength(bytes)));
}

function completeLength(bytes: Buffer): number {
  // At most three bytes of a four-byte sequence can be pending.
  for (let back = 1; back <= 3 && back <= bytes.length; back += 1) {
    const byte = bytes[bytes.length - back] as number;
    if ((byte & 0b1100_0000) === 0b1000_0000) continue; // continuation byte
    const width = byte >= 0b1111_0000 ? 4 : byte >= 0b1110_0000 ? 3 : byte >= 0b1100_0000 ? 2 : 1;
    return width > back ? bytes.length - back : bytes.length;
  }
  return bytes.length;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function outcome(kind: ProcessOutcome['kind'], partial: Partial<ProcessOutcome>): ProcessOutcome {
  return {
    kind,
    exitCode: partial.exitCode ?? null,
    stdout: partial.stdout ?? '',
    stderr: partial.stderr ?? '',
    truncated: partial.truncated ?? false,
    durationMs: partial.durationMs ?? 0,
    failure: partial.failure ?? null,
  };
}
