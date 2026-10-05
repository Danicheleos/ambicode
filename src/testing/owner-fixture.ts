import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Runtime } from '../composition/root.ts';
import { runHook, type HookDeps } from '../hook/events/run-hook.ts';
import type { StartInput } from '../route/engine.ts';
import { defaultHandlers } from '../route/handlers.ts';
import { routeFixture, type RouteFixture } from './route-fixture.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const LEGACY_SESSION = 'aaaaaaaa-1111-4111-8111-111111111111';

export interface Hooked {
  /** One hook event as the named Claude session sends it; each session has its own scratchpad. */
  event(event: Record<string, unknown>, session: string): Promise<unknown>;
  scratchpad(session: string): string;
}

export function hookRunner(fx: RouteFixture, runtime: Runtime, deps: HookDeps): Hooked {
  const scratchpad = (session: string): string => path.join(fx.scratchpad, session);
  return {
    event: (event, session) => runHook(runtime, JSON.stringify({ session_id: session, cwd: fx.repo.root, scratchpad_dir: scratchpad(session), ...event }), deps),
    scratchpad,
  };
}

/** The shipped investigate route over a small repository, with the hook runner in front of the same engine. */
export async function investigation() {
  const step: Record<string, string> = {};
  for (const name of ['investigate-fetch', 'investigate-read', 'investigate-write']) step[`routes/steps/${name}.md`] = await readFile(path.join(ROOT, 'routes', 'steps', `${name}.md`), 'utf8');
  const fx = await routeFixture({ routes: { investigate: await readFile(path.join(ROOT, 'routes', 'investigate.yaml'), 'utf8') }, handlers: defaultHandlers(), step });
  await fx.repo.write('src/cart.ts', 'export function addToCart(items: string[], item: string): string[] {\n  return [...items, item];\n}\n');
  await fx.repo.write('src/checkout.ts', "import { addToCart } from './cart.ts';\n\nexport const checkout = (): string[] => addToCart([], 'book');\n");
  await fx.repo.commitAll('cart');
  const hooked = hookRunner(fx, fx.runtime, { pointer: fx.pointer, load: async () => ({ engine: fx.engine, routes: fx.routes, pointer: fx.pointer }) });
  return {
    fx,
    hooked,
    scratchpad: hooked.scratchpad,
    start: (input: Partial<StartInput> = {}) =>
      fx.engine.start({ skill: 'investigate', text: 'how does addToCart work', requirements: [], task: 'cart', cwd: fx.repo.root, session: LEGACY_SESSION, channel: 'hook', scratchpadDir: fx.scratchpad, ...input }),
    dispose: () => fx.dispose(),
  };
}
