import { systemClock } from '#platform/ports/clock';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { nodeHttpHost } from '#platform/ports/http-host';
import { systemIds } from '#platform/ports/ids';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { processStandardInput } from '#platform/ports/stdin';
import { resolvePluginRoot } from '#util/plugin-root';
import type { Runtime } from '#types/composition';
import type { Clock, FileSystem, HttpHost, IdSource, ProcessRunner, StandardInput } from '#types/platform/ports';

interface RuntimeOverrides {
  runner?: ProcessRunner;
  fs?: FileSystem;
  clock?: Clock;
  ids?: IdSource;
  http?: HttpHost;
  cwd?: string;
  pluginRoot?: string;
  stdin?: StandardInput;
  env?: Readonly<Record<string, string | undefined>>;
}

export async function createRuntime(overrides: RuntimeOverrides = {}): Promise<Runtime> {
  const fs = overrides.fs ?? nodeFileSystem;
  const env = overrides.env ?? process.env;
  const runner = overrides.runner ?? new NodeProcessRunner(env);
  const cwd = overrides.cwd ?? process.cwd();
  return {
    runner,
    fs,
    clock: overrides.clock ?? systemClock,
    ids: overrides.ids ?? systemIds,
    http: overrides.http ?? nodeHttpHost,
    cwd,
    pluginRoot: overrides.pluginRoot ?? (await resolvePluginRoot(fs, env)),
    stdin: overrides.stdin ?? processStandardInput,
    env,
    notices: [],
  };
}
