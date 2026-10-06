// Check running: selection of lint/test files, authorization, baselines, `check --only`, `format` and the review gate.

// root: pure evaluation of the review gate.
/** evaluateReview(chain, …) — pure first-match decision (waiting keys, out-of-scope findings, in-scope findings, else proceed) for a route's review. */
export { evaluateReview } from './review-evaluation.ts';

// run/: executing checks, `check --only`, `format` and remote checks.
/** consentForKey(deps, …) — one consent check for a `propose` key: honoured runs, a decline declines, a typed `--approve` raises the gate again. */
export { consentForKey } from './run/check-command.ts';
/** routedOf(deps, task) — the open route a check-only call speaks for, or null when none (a session-less call on a slug with one refuses). */
export { routedOf } from './run/check-command.ts';
/** runCheckOnly(deps, input) — runs `check --only` for the named checks, with consent and ledger entries; returns the outcome. */
export { runCheckOnly } from './run/check-command.ts';
/** warmIndex(deps, workspace, project) — kicks off a code-index refresh for the project without waiting; call before checks that read the index. */
export { warmIndex } from './run/check-command.ts';
/** withLedger(deps, dir, body) — runs `body` with the task ledger locked; returns body's result. */
export { withLedger } from './run/check-command.ts';
/** baselineOf(deps, task, chainIds) — the task's baseline in the route's chain (or the latest standalone); null means diff against HEAD. */
export { baselineOf } from './run/format.ts';
/** runFormat(deps, {task, paths}) — runs `format` once per project in the touched set and returns one entry per project. */
export { runFormat } from './run/format.ts';
/** runRemoteChecks(options) — runs the remote (CI-side) checks and returns their outcome and notes. */
export { runRemoteChecks } from './run/remote.ts';
/** runChecks(options) — runs the selected checks of the policy and returns results plus pending approvals. */
export { runChecks } from './run/run.ts';

// selection/: which files a check runs on, adapters, command authorization and red/green proof.
/** adapterFor(id) — the check adapter (lint/test tool conventions) registered under `id`. */
export { adapterFor } from './selection/adapters.ts';
/** authorizeCommand(options) — decides whether a check command may run given policy and approvals. */
export { authorizeCommand } from './selection/authorize.ts';
/** checkApprovalKey(projectId, checkId) — the project-scoped key an `--approve` answer must carry for a check. */
export { checkApprovalKey } from './selection/authorize.ts';
/** classifyProof(…) — classifies a red/green test pair as proven or red-/green-unproven with its cause. */
export { classifyProof } from './selection/proof.ts';
/** selectLintFiles(options) — the lint file arguments for a change; a deleted file is dropped from argv but kept as evidence. */
export { selectLintFiles } from './selection/select.ts';
/** selectTestFiles(options) — async selection of the test files to run for a change. */
export { selectTestFiles } from './selection/select.ts';
/** selectionRunsCommand(check) — whether deciding this check's selection starts a process (false for lint and mapping selection). */
export { selectionRunsCommand } from './selection/select.ts';

// workspace/: the touched-files baseline.
/** captureBaseline(runtime) — records HEAD and the hashes of dirty files as a baseline entry. */
export { captureBaseline } from './workspace/baseline.ts';
/** touchedSet(…) — the files changed since a baseline (HEAD plus dirty paths with hashes). */
export { touchedSet } from './workspace/baseline.ts';
