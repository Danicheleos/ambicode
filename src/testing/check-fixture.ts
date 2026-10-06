import type { Runtime } from '../composition/root.ts';
import type { StartChannel } from '../route/context.ts';
import { ledgerRouteContext } from '../route/context.ts';
import type { ProcessOutcome, ProcessRequest, ProcessRunner } from '../ports/process.ts';
import { runCheckOnly, type CheckDeps, type CheckOnlyInput } from '../checks/check-command.ts';
import { CONFIG, routeFixture } from './route-fixture.ts';

export const A = 'aaaaaaaa-1111-4111-8111-111111111111';
export const TASK = 'ord-7';
export const DEMO = `skill: demo
version: 3
budget: { modelSteps: 10 }
exits: [done, blocked, human, inconclusive, superseded, budget]
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
    checks: { unit: { command: unit, adapter: jest }, e2e: { command: e2e, adapter: playwright }, lint: { command: lint, adapter: eslint } }
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
    if (request.argv[0] === 'git') return this.real.run(request);
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
  const warmed: string[] = [];
  const deps = (session: string | null = A): CheckDeps => ({
    runtime, session, routes: fx.routes, context: ledgerRouteContext({ runtime, routes: fx.routes }),
    warm: async (_workspace, project) => { warmed.push(project.id); },
  });
  const start = (channel: StartChannel = 'hook', headless = false, extra: object = {}) =>
    fx.engine.start({ skill: 'demo', text: 'fix the total', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel, headless, scratchpadDir: fx.scratchpad, ...extra });
  const check = (input: Partial<CheckOnlyInput> = {}, session: string | null = A) =>
    runCheckOnly(deps(session), { task: TASK, key: 'app/unit', only: ['src/a.spec.ts'], phase: 'red', approve: [], decline: [], ...input });
  return { fx, runner, runtime, deps, start, check, warmed };
}

