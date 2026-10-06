// Test helpers: fakes and fixtures. Never imported by production code.
// route-child.ts is a script that runs on import and is not re-exported; plan-fixture's and requirements-session's `A`/`TASK` clash with check-fixture's and are left out.

// ./: repository paths.
export { REPO_ROOT, SRC_ROOT } from './paths.ts';

// fakes/: in-memory stand-ins for ports.
export type { FakeIndexOptions } from './fakes/fake-index.ts';
/** fakeIndex(options?) — an IndexAdapter answering from tables when fresh or stale and refusing otherwise; records `calls`. */
export { fakeIndex } from './fakes/fake-index.ts';
export type { StubbedCall } from './fakes/fake-process-runner.ts';
export { FakeProcessRunner } from './fakes/fake-process-runner.ts';
export { FAKE_TARGET, FakeProvider } from './fakes/fake-provider.ts';
/** currentRevision(overrides?) — a RemoteRevision at the fake target's current head. */
export { currentRevision } from './fakes/fake-provider.ts';
/** staleRevision() — a RemoteRevision that differs from the current one, to exercise staleness. */
export { staleRevision } from './fakes/fake-provider.ts';
/** note(overrides) — a RemoteNote; id and discussionId are required. */
export { note } from './fakes/fake-provider.ts';
/** thread(id, notes) — an unresolved RemoteDiscussion holding the notes. */
export { thread } from './fakes/fake-provider.ts';
export type { ReviewerIo } from './fakes/reviewer-io.ts';
/** reviewerIo() — an in-memory ReviewerIo file system that remembers what was written. */
export { reviewerIo } from './fakes/reviewer-io.ts';

// fixtures/: repositories, routes, pages and results that tests build on.
export { A, CHECK_CONFIG, COMMAND_PACK, DEMO, SplitRunner, TASK } from './fixtures/check-fixture.ts';
/** checkFixture(options?) — a routeFixture with the check config and command pack, over real git and a scripted runner. */
export { checkFixture } from './fixtures/check-fixture.ts';
/** initConfig(runtime, overrides?) — writes a config into the runtime's repository as a user would have. */
export { initConfig } from './fixtures/init-config.ts';
export type { Hooked } from './fixtures/owner-fixture.ts';
/** hookRunner(fx, runtime, deps) — sends hook events as a named Claude session through the fixture's engine. */
export { hookRunner } from './fixtures/owner-fixture.ts';
/** investigation() — the shipped investigate route over a small repository with a hook runner in front of the same engine. */
export { investigation } from './fixtures/owner-fixture.ts';
export { AUTHORITY, CountingIds, FakeClock, ORIGIN, SESSION_COOKIE, templatesDirectory } from './fixtures/page-harness.ts';
export type { Harness, HarnessOptions, OpenedPage } from './fixtures/page-harness.ts';
/** startHarness(options?) — starts a review page server over a temporary store and returns the Harness. */
export { startHarness } from './fixtures/page-harness.ts';
/** reopenHarness(harness) — a second Harness over the same store, reading whatever the first left on disk. */
export { reopenHarness } from './fixtures/page-harness.ts';
/** openPage(harness) — bootstraps a session on the page server and returns the rendered HTML with its cookies. */
export { openPage } from './fixtures/page-harness.ts';
/** hiddenField(html, name, fallback?) — the value of a hidden form field in rendered HTML. */
export { hiddenField } from './fixtures/page-harness.ts';
/** cookieJar(initial?) — a minimal cookie jar for page requests. */
export { cookieJar } from './fixtures/page-harness.ts';
/** form(fields) — url-encodes form fields into a request body. */
export { form } from './fixtures/page-harness.ts';
export { B, PLAN } from './fixtures/plan-fixture.ts';
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
/** publicationPositions(result, target?) — the positions the result's findings would be published at on the target. */
export { publicationPositions } from './fixtures/review-fixture.ts';
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
