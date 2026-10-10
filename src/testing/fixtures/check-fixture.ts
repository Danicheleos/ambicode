import { commandContext } from '#harness/engine/context';
import { runCheckOnly } from '#modules/checks/run/check-command';
import { CONFIG, routeFixture } from './route-fixture.ts';
import type { CheckDeps, CheckOnlyInput } from '#types/modules/checks';
import type { Runtime } from '#types/composition';
import type { StartChannel } from '#types/harness';
import type { ProcessOutcome, ProcessRequest, ProcessRunner } from '#types/platform/ports';
import { SESSION_A } from './ids.ts';
export const CHECK_TASK = 'ord-7';
export const DEMO = `skill: demo
version: 3
steps:
  - id: red
    actor: model
    instruction: "Write the failing test."
    produces: ["check{red}"]
  - id: green
    actor: model
    instruction: "Fix it."
    produces: ["check{green}"]
`;

export const CHECK_CONFIG = `${CONFIG.replace('  - { id: app, root: ".", ecosystem: typescript }', '')}  - id: app
    root: "."
    ecosystem: typescript
    policyFiles: [.ambicode/policies/cmds.yaml]
    commands: { unit: { argv: [jest, "{files}"] }, e2e: { argv: [pw, "{files}"] }, lint: { argv: [eslint, "{files}"] }, format: { argv: [fmt] } }
    checks: { unit: { command: unit }, e2e: { command: e2e }, lint: { command: lint } }
`;

export const COMMAND_PACK = `schemaVersion: 1
id: cmds
authority: team
appliesTo: ["**/*"]
activities: [review, task]
source: { location: "test" }
rules: []
prompts: []
commandPolicy:
  - { command: unit, action: run, reason: "unit" }
  - { command: e2e, action: propose, reason: "e2e" }
  - { command: lint, action: forbid, reason: "never here" }
  - { command: format, action: run, reason: "format" }
`;

/** Real git, scripted everything else: `out` decides what a check prints. */
export class SplitRunner implements ProcessRunner {
  readonly calls: string[][] = [];
  out: Partial<ProcessOutcome> = { exitCode: 1, stdout: 'Tests:       1 failed, 1 total\n' };
  effect: ((request: ProcessRequest) => Promise<void>) | null = null;
  private readonly real: ProcessRunner;
  constructor(real: ProcessRunner) {
    this.real = real;
  }
  async run(request: ProcessRequest): Promise<ProcessOutcome> {
    if (request.argv[0] === 'git' || request.argv[0] === process.execPath) return this.real.run(request);
    this.calls.push([...request.argv]);
    await this.effect?.(request);
    const kind = this.out.kind ?? 'exited';
    return { kind, exitCode: this.out.exitCode ?? (kind === 'exited' ? 0 : null), stdout: this.out.stdout ?? '', stderr: '', truncated: false, durationMs: 3, failure: this.out.failure ?? null };
  }
}

export async function checkFixture(options: { routes?: Record<string, string>; config?: string; pack?: string; handlers?: Parameters<typeof routeFixture>[0]['handlers']; step?: Record<string, string> } = {}) {
  const fx = await routeFixture({ routes: options.routes ?? { demo: DEMO }, config: options.config ?? CHECK_CONFIG, ...(options.handlers === undefined ? {} : { handlers: options.handlers }), ...(options.step === undefined ? {} : { step: options.step }) });
  await fx.repo.write('.ambicode/policies/cmds.yaml', options.pack ?? COMMAND_PACK);
  await fx.repo.write('src/a.spec.ts', 'test\n');
  await fx.repo.commitAll('pack');
  const runner = new SplitRunner(fx.runtime.runner);
  const runtime: Runtime = { ...fx.runtime, runner };
  const deps = (session: string | null = SESSION_A): CheckDeps => ({
    runtime, session, context: commandContext({ runtime, routes: fx.routes }),
  });
  const start = (channel: StartChannel = 'hook', headless = false, extra: object = {}) =>
    fx.engine.start({ skill: 'demo', text: 'fix the total', requirements: [], task: CHECK_TASK, cwd: fx.repo.root, session: SESSION_A, channel, headless, scratchpadDir: fx.scratchpad, ...extra });
  const check = (input: Partial<CheckOnlyInput> = {}, session: string | null = SESSION_A) =>
    runCheckOnly(deps(session), { task: CHECK_TASK, key: 'app/unit', only: ['src/a.spec.ts'], phase: 'red', approve: [], decline: [], ...input });
  return { fx, runner, runtime, deps, start, check };
}

