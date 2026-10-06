import { PLAN, TASK, planHandlers } from './plan-fixture.ts';
import { assembleEngine } from './route-fixture.ts';

// Usage: node route-child.ts '<json {root, session, adopt?, fresh?}>' — starts a plan route and prints the outcome.
const options = JSON.parse(process.argv[2]!) as { root: string; session: string; adopt?: boolean; fresh?: boolean };
const { build } = await assembleEngine({ root: options.root, routes: { plan: PLAN }, handlers: ['t.step', 't.check'] });
const engine = build(planHandlers({ checkOk: true, checks: 0, steps: 0 }));
try {
  const message = await engine.start({
    skill: 'plan', text: 'add a limit', requirements: [], task: TASK, cwd: options.root, session: options.session, channel: 'hook',
    ...(options.adopt === true ? { adopt: true } : {}), ...(options.fresh === true ? { fresh: true } : {}),
  });
  console.log(JSON.stringify({ ok: true, position: message.position }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, code: (error as { code?: string }).code ?? 'unknown' }));
}
