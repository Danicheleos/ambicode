// Test helpers: fakes and fixtures. Never imported by production code.
// route-child.ts is a script that runs on import and is not re-exported.

// ./: repository paths.
export { REPO_ROOT, SRC_ROOT } from './paths.ts';

// fixtures/ids.ts: the session ids fixtures and tests share.
export { SESSION_A, SESSION_B } from './fixtures/ids.ts';

// fakes/: in-memory stand-ins for ports.
export type { StubbedCall } from './fakes/fake-process-runner.ts';
export { FakeProcessRunner } from './fakes/fake-process-runner.ts';

// fixtures/: repositories, routes, pages and results that tests build on.
export { CHECK_CONFIG, COMMAND_PACK, DEMO, SplitRunner, CHECK_TASK } from './fixtures/check-fixture.ts';
/** checkFixture(options?) — a routeFixture with the check config and command pack, over real git and a scripted runner. */
export { checkFixture } from './fixtures/check-fixture.ts';
/** initConfig(runtime, overrides?) — writes a config into the runtime's repository as a user would have. */
export { initConfig } from './fixtures/init-config.ts';
export type { Hooked } from './fixtures/owner-fixture.ts';
/** hookRunner(fx, runtime, deps) — sends hook events as a named Claude session through the fixture's engine. */
export { hookRunner } from './fixtures/owner-fixture.ts';
/** investigation() — the shipped investigate route over a small repository with a hook runner in front of the same engine. */
export { investigation } from './fixtures/owner-fixture.ts';
export { PLAN, PLAN_TASK } from './fixtures/plan-fixture.ts';
export type { PlanFixture, PlanState } from './fixtures/plan-fixture.ts';
/** planHandlers(state) — scripted handlers for the plan-shaped route, counting checks and steps in `state`. */
export { planHandlers } from './fixtures/plan-fixture.ts';
/** planFixture(options?) — a routeFixture running a plan-shaped (or shipped) route with scripted handlers. */
export { planFixture } from './fixtures/plan-fixture.ts';
export { FIXTURE_ROUTE, jira, mcp, search } from './fixtures/requirements-session.ts';
export type { SessionOptions } from './fixtures/requirements-session.ts';
/** session(options?) — a started route over a temporary repository with capture and normalize driven as hook and ground do. */
export { session } from './fixtures/requirements-session.ts';
export { HOSTILE, REVIEW_ID } from './fixtures/review-fixture.ts';
export type { FixtureOptions } from './fixtures/review-fixture.ts';
/** finding(overrides) — a Finding; id is required. */
export { finding } from './fixtures/review-fixture.ts';
/** reviewResult(options?) — a ReviewResult with hostile text in every untrusted field. */
export { reviewResult } from './fixtures/review-fixture.ts';
export { PROPOSED } from './fixtures/review-route-fixture.ts';
/** reviewRouteFixture(options?) — the shipped review route with real handlers on an uncommitted change to `src/orders.ts`. */
export { reviewRouteFixture } from './fixtures/review-route-fixture.ts';
export { CONFIG } from './fixtures/route-fixture.ts';
export type { Assembled, RouteFixture } from './fixtures/route-fixture.ts';
/** assembleEngine(options) — an engine over an existing repository, as a second process on the same task directory builds it. */
export { assembleEngine } from './fixtures/route-fixture.ts';
/** routeFixture(options) — a temporary repository with the given routes, config and handlers, and an engine over them. */
export { routeFixture } from './fixtures/route-fixture.ts';
export { ORDERS } from './fixtures/task-fixture.ts';
/** taskFixture(options?) — the shipped task route with real handlers on checkFixture's repository. */
export { taskFixture } from './fixtures/task-fixture.ts';
export { TempRepo } from './fixtures/temp-repo.ts';
