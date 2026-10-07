// The route harness: route definitions, the engine that folds the ledger into steps, gates, and session ownership.
// Handlers live in #skills and are not re-exported here.

// definition/: route YAML loading and the CLI flag helpers that name routes' arguments.
/** parseAnswerFlag(value) — parses `--answer <gate>=<option>` into an Answer; throws bad-argument when malformed. */
export { parseAnswerFlag } from './definition/flags.ts';
/** loadRoute(file, text, context, registry?) — validates one route YAML document into a RouteDef. */
export { loadRoute } from './definition/routes.ts';
/** loadRouteRegistry(pluginRoot, fs) — reads and validates every shipped route file into a RouteRegistry. */
export { loadRouteRegistry } from './definition/routes.ts';
/** routeRegistry(files) — wraps already validated route files in the lookup (`route(skill)`, `skills()`). */
export { routeRegistry } from './definition/routes.ts';

// engine/: the engine (engine.ts: start/advance/deliver/stop; execute.ts: the advance loop; status.ts), the ledger fold, step delivery and the handler registry.
/** createEngine(deps) — builds the route Engine (start/advance/gates) over a runtime, routes, handlers and the active-route pointer. */
export { createEngine } from './engine/engine.ts';
/** runCommandTail(deps, input) — after a CLI command wrote its evidence, advances the route and returns the next step message or null. */
export { runCommandTail } from './engine/command-tail.ts';
/** commandContext({ runtime, routes }) — the CommandContext that reads a route's context from the task ledger. */
export { commandContext } from './engine/context.ts';
/** openRouteView(runtime, routes, task, session) — the session's unfinished route as a RouteView, or null when it has none. */
export { openRouteView } from './engine/context.ts';
/** readEntries(runtime, task) — reads the task ledger strictly; throws when it is unreadable. */
export { readEntries } from './engine/context.ts';
/** refOf(entry, kind, value) — an ArtifactRef of the given kind pointing at a ledger entry and its content hash. */
export { refOf } from '#modules/evidence/ledger-chain';
/** chainKey(ids) — the first route id of a chain; stays the same when a later route resumes it. */
export { chainKey } from './engine/delivery.ts';
/** loadPayload(fs, dir, chain, key) — reads a step's saved payload text, or null when none was saved. */
export { loadPayload } from './engine/delivery.ts';
/** savePayload(fs, dir, chain, key, text) — saves a step's payload text under the task's steps directory. */
export { savePayload } from './engine/delivery.ts';
/** buildChain(all, head) — the route chain (head plus every route it resumes) with its entries, from all ledger entries. */
export { buildChain } from './engine/fold.ts';
/** currentIn(def, chain) — a predicate that tells whether an entry belongs to the route's current (not revised-away) steps. */
export { currentIn } from './engine/fold.ts';
/** cycleEntries(entries) — the entries after the latest human revise: the current cycle. */
export { cycleEntries } from './engine/fold.ts';
/** exitOf(chain) — the chain's last `exit` entry, or null while the route is open. */
export { exitOf } from './engine/fold.ts';
/** foldRoute(def, chain) — folds a chain's entries into per-step state (the Fold) for a route definition. */
export { foldRoute } from './engine/fold.ts';
/** isBoundAnswer(entry) — true for an acceptance/decline/default entry that really answers a gate (not unbound or refused). */
export { isBoundAnswer } from './engine/fold.ts';
/** isGreen(entry) — true for a command entry that exited 0 with at least one run and no failures. */
export { isGreen } from './engine/fold.ts';
/** latestBound(window, gate) — the latest bound answer to a gate within an entry window, or null. */
export { latestBound } from './engine/fold.ts';
/** latestRouteOf(all, session) — the latest `route` entry written by a session, or null. */
export { latestRouteOf } from './engine/fold.ts';
/** liveHeads(entries) — heads of the route chains that no exit has closed and nothing resumes. */
export { liveHeads } from './engine/fold.ts';
/** windowOf(fold, step) — the chain entries from the start of a step's window onward. */
export { windowOf } from './engine/fold.ts';
/** handlerRegistry(handlers) — wraps a handler record in the lookup (`get(name)`, `names()`). */
export { handlerRegistry } from './engine/handlers.ts';

// gates/: the gate registry, raising gates and the hooks modules use to shape prints and handle answers.
/** onGatePrint(gate, shaper) — registers a module's shaper for the question and options a gate prints. */
export { onGatePrint } from './gates/gates.ts';
/** onNeedCommand(skill, need, command) — registers a route's own command text for a code step's unmet `needs` kind. */
export { onNeedCommand } from './gates/gates.ts';
/** onRaisedAnswer(gate, handler) — registers a handler that runs once when a raised gate gets a bound answer. */
export { onRaisedAnswer } from './gates/gates.ts';
/** parseRegistry(file, text, kinds) — parses a gate registry YAML file into GateDefs; throws on invalid content. */
export { parseRegistry } from './gates/gates.ts';
/** raiseGate(ledger, view, input) — the one writer of a raised gate's print, with instantiated options and `raisedBy` recorded. */
export { raiseGate } from './gates/gates.ts';

// session/: which Claude session owns which route, and the active-route pointer.
/** fsActiveRoutePointer(fs) — the file-backed ActiveRoutePointer, a cache of the active route in hook session state. */
export { fsActiveRoutePointer } from './session/active-route.ts';
/** resolveActiveRoute(fs, pointer, input) — finds the session's active route from the pointer, checking the ledger as authority. */
export { resolveActiveRoute } from './session/active-route.ts';
/** harnessOf(entry) — the Claude session a route entry was written for, or null. */
export { harnessOf } from './session/harness.ts';
/** ownerOfHarness(entries, harness) — the owner key a Claude session speaks for, if it is still the latest on that owner's routes. */
export { ownerOfHarness } from './session/harness.ts';
/** ownerOf(entries, slug) — the PlanOwnership (state, owner, reason) of a task read from its ledger entries. */
export { ownerOf } from '#modules/evidence/ownership';
export { cliHarnessPort } from './session/session.ts';
/** sessionUnbound(binding, task?) — the session-unbound AmbicodeError for a CLI call that cannot tell which route it speaks for. */
export { sessionUnbound } from './session/session.ts';
/** taskSessionSource(task) — a SessionSource whose owner is the session of the task's one live route chain. */
export { taskSessionSource } from './session/session.ts';
