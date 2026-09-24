# P2.4 final candidate acceptance record — 2026-09-21

> **Superseded for local installation, Windows portability, and code
> navigation.** A post-commit audit of `44cd94911af6e82e8e9b12822b20deb174005c29`
> reproduced defects that this record missed: the guide installed into an
> isolated config and then suggested checking the normal one; packaging and
> hooks depended on POSIX tools; rollback/postcondition paths were incomplete;
> and LSP guidance was neither structured nor evidenced. See the dated local
> install/navigation correction record. Historical observations below remain
> historical and do not prove that those corrected areas passed.

This is a locally prepared and locally verified candidate, not a released
artifact. AMBICODE is installed and used locally (doc 08, "Distribution");
there is no hosted, public, or private remote marketplace and nothing in
this record was published anywhere. This record **supersedes**
`docs/acceptance/2026-09-21-p2.3-candidate/README.md` (itself already
superseding the P2.2 record) for everything this session re-verified — the
P2.4 corrections A–K below — without restating rows that record already
covered and this session did not touch. Both superseded records remain on
disk with a pointer at their top rather than being deleted.

This session's task was a closure task: correct issues A–K found against
the codebase already implemented through P2.3, implement P2.4 (shared rule
delivery and calibration), run the complete local acceptance campaign, then
perform an adversarial self-audit and fix anything it found. Nothing was
committed, tagged, pushed, published, or deployed. The complete batch is
left staged at the end of this session (see "Staged/unstaged status"),
exactly as instructed.

## What this session did

1. **P2.4 correction A (shared preparation boundary actually used).**
   `investigate`/`plan`/`task`'s `SKILL.md` files told the model to run
   `ambicode prepare --activity <x>` without `--json`, so the model only
   ever saw the human-readable summary, never the structured
   `sharedOperatingContract` field the summary line pointed at. Fixed the
   three skill files to invoke `--json` and read the structured output.
   `ambicode prepare`'s output gained a top-level `sharedOperatingContract`
   field (`src/contracts/prepare.ts`, `src/policy/shared-contract.ts`): one
   canonical reader (`readSharedOperatingContract`) used by both `prepare`
   and the reviewer's prompt composition, so the team/observed/inherited
   authority distinction is defined in exactly one file
   (`prompts/shared-operating-contract.md`) and every consumer points at it
   rather than restating it. `src/util/skill-content.test.ts` gained tests
   asserting the canonical contract states the distinction and that the
   skills point at it instead of duplicating it, and that every authoring
   skill actually passes `--json`.
2. **P2.4 correction B (byte accounting and diagnostic scoping).**
   `contextBudget.measuredBytes` was computed from an intermediate object,
   not from the bytes the `--json` invocation would actually print, so a
   caller measuring "the reported size" and "the real stdout size" could
   see different numbers depending on how the number itself changed the
   serialized length. Replaced with a fixed-point loop
   (`finalizePrepareOutput` in `src/cli/commands/prepare.ts`): re-serialize
   with the candidate byte count until serializing again produces the same
   count, and only that stable value is returned — proven directly against
   real bundled-CLI stdout by `prepare-artifact.test.mjs`. Separately, a
   load-time `error` diagnostic from a pack that does not apply to the
   current activity or path was still blocking preparation for every other
   activity/path; `src/policy/resolve.ts` now tracks which files/packs were
   actually considered versus applicable and downgrades an inapplicable
   pack's blocking diagnostics to `notice` (`scopeDiagnostics`), while an
   applicable pack's diagnostic still blocks. A related gap found while
   fixing this: `ambicode review`/`bundle` silently dropped an applicable
   policy diagnostic instead of surfacing it; `policyDiagnosticOmissions` in
   `src/review/bundle.ts` now turns it into an explicit result omission and
   `review.ts`'s status reports the gap count. New tests in
   `src/policy/policy.test.ts` and `src/review/review.test.ts` cover both
   the scoping and the omission behavior.
3. **P2.4 correction C (requirement evidence lifetime for an arbitrary
   number of consumers).** `skills/task/SKILL.md` told the model to delete
   the requirement evidence file immediately after the first review call in
   step 5 — which breaks the documented finding-fix-rereview flow, where a
   second (or third) review of the same task needs the same evidence file
   to still exist. Removed that premature deletion; added an explicit
   "Final cleanup" step at the end of the skill that deletes it exactly
   once, after every consumer for that task run is done. Generalized the
   "two consumers" language in `skills/shared/requirements-mcp.md` and
   `docs/review.md` to "an arbitrary number of consumers." New/updated
   tests in `src/util/skill-content.test.ts`.
4. **P2.4 correction D (failure-safe local installation).** `install()` had
   no scope-conflict check of its own (only `uninstall()` did), so a second
   `install` at a different scope against the same `CLAUDE_CONFIG_DIR`
   could leave a dangling native registration for the original scope; a
   native command reporting success was trusted without re-reading actual
   state; and a mid-sequence process kill left no record of what to do
   next. `install-local.mjs` now: acquires an exclusive ownership lock
   (`lock.json`, holding the PID, reclaimed if stale) before reading or
   mutating anything; refuses an `install` whose scope/project directory
   disagrees with existing recorded state, before staging or publishing
   anything; verifies the postcondition by re-reading `claude plugin list
   --json` and checking the installed entry's identity, not the native
   command's exit code alone; and writes a recovery journal
   (`recovery-journal.json`) with concrete by-hand recovery instructions if
   a compensating rollback step itself fails after a native mutation
   already succeeded. `install-local.test.mjs` grew from 10 to 18 cases (a
   new "failure-safe installation" describe block covering the lock, the
   scope-conflict refusal, the postcondition check, and the journal); its
   `fakeNative()` helper was made stateful (reads the real staged
   `marketplace.json` to determine current plugin identity, mirroring real
   Claude Code's own live-directory-read behavior) rather than a set of
   static stubs, which is what surfaced two pre-existing tests with
   stale/incompatible overrides — fixed by relying on the new stateful
   default. `install-local.smoke.mjs` gained four new real end-to-end steps
   (same-version reinstall, version-upgrade-in-place, scope-change refusal,
   corrupt-state refusal) between the existing inspect and delete steps.
5. **P2.4 correction E (reviewer system/user prompt separation).** The
   reviewer's prompt was one concatenated string containing the shared
   operating contract and reviewer role alongside the diff, requirements,
   and prior discussion — so a hostile string planted in reviewed code or a
   fetched requirement shared the same trust level as the operating
   instructions around it. `ComposedPrompt` (`src/review/prompt.ts`) is now
   `{system, user, provenance}`: `system` holds only the shared operating
   contract and reviewer role; `user` holds everything with change data,
   requirement, discussion, or check-evidence content. `ReviewerRequest`
   gained a `systemPrompt` field; `claude-reviewer.ts` passes it through the
   real `--append-system-prompt` flag (confirmed present in `claude --help`
   on 2.1.272; added to `REQUIRED_FLAGS` so `assertIsolationAvailable`
   refuses to run if a future Claude Code version removes it) immediately
   after `--model`. Bundle artifacts are now `reviewer-system-prompt.md` and
   `reviewer-user-prompt.md` (previously one `reviewer-prompt.md`);
   `docs/review.md` updated to match. New tests in `src/review/review.test.ts`
   assert that neither reviewed code nor requirement text can reach the
   appended system prompt no matter how it is phrased.
6. **P2.4 corrections F/G/H (rule schema, config switch, plugin hook,
   dedup).** Added `remindOnEdit: boolean` (default `false`) to the rule
   schema (`src/contracts/policy.ts`), rejected on a rule whose pack applies
   broadly (`appliesTo` includes `**/*`) in `src/policy/load.ts` — a
   reminder on every file edited anywhere is noise, not calibration,
   consistent with doc 06's new "Edit reminders" section. Added
   `authoring.editReminders` (default `true`) to `AmbicodeConfig`
   (`src/contracts/config.ts`, `src/config/defaults.ts`); `init` writes it
   on a fresh config and adds it (with its documented default) to an
   existing config that predates it, without overwriting an explicit
   `false` (`src/config/init.ts`). The plugin now ships `hooks/hooks.json`
   registering `PostToolUse` (matcher `Edit|Write`), `SessionStart`
   (matcher `startup|resume|clear|fork`), `PostCompact`, and `SessionEnd`,
   all routed through the one bundled entry point
   (`${CLAUDE_PLUGIN_ROOT}/bin/ambicode hook`) rather than a script per
   event; `package-candidate.mjs` ships it through the same explicit
   allowlist as every other shipped file and gained
   `checkHooksManifest` to fail the build if a future edit adds an event
   that does not route through that one entry point. `src/hook/run-hook.ts`
   dispatches on `hook_event_name`: a `PostToolUse` Edit/Write inside a
   configured repository with an applicable, not-yet-delivered
   `remindOnEdit` rule replies with
   `hookSpecificOutput.additionalContext`; every other path, and any
   parse/resolve failure, is a silent no-op — a hook is advisory and must
   never block or comment on a tool call that already happened.
   `src/hook/markers.ts` implements delivery-once tracking keyed by
   `(session epoch, agent id or "main", normalized path, qualified rule id,
   rule content hash)`: `SessionStart`/`PostCompact` mint a fresh epoch
   (making every earlier marker irrelevant and clearing the marker
   directory so a long session's state stays bounded); `SessionEnd` removes
   all of this hook's own state; a changed rule body is a different marker
   and is redelivered without waiting for a new session. State lives under
   the host-provided per-session scratchpad when available, or a
   session-id-hash-named directory under the runtime's own temporary root
   otherwise — never inside the product repository. Covered by
   `src/hook/run-hook.test.ts` (12 unit-level cases against fake ports) and
   `hook-artifact.test.mjs` (the real bundled `scripts/ambicode.mjs hook`,
   invoked with piped stdin, no `claude` process involved, proving
   deliver-once/suppress-repeat/redeliver-on-hash-change/redeliver-on-reset
   against the actual shipped artifact). A real symlink-path bug was found
   and fixed while building this: the hook's own path-relativization
   originally used a direct `path.relative` call, which produced nonsense
   `../../../../var/folders/...` paths on macOS because `/tmp`/`/var` are
   themselves symlinks to `/private/tmp`/`/private/var` and git's
   `rev-parse --show-toplevel` realpath's its answer while a raw
   `mkdtemp(tmpdir())` path does not — this would have silently no-op'd the
   hook on every macOS install. Fixed by reusing the existing
   `toRepositoryRelative` helper from `composition/root.ts`, which already
   carries this exact fix for the identical reason elsewhere in the
   codebase.
7. **P2.4 correction I (Phase 2 eval assets).** Added six new
   `claude plugin eval` cases under `evals/`: `p2-task-trivial`,
   `p2-task-regression-fix`, `p2-plan-accepted-iteration`,
   `p2-task-finding-fix-rereview`, `p2-investigate-frozen-requirement`, and
   `p2-plan-path-scoped-policy`, each with `case.yaml`, `prompt.md`,
   `ground-truth.md`, `graders/*.md`, and (where the case needs prepared
   repository state) `scaffold.sh`, reusing the existing fixture
   definitions in `fixtures/materialize.mjs`/`fixtures/definitions.mjs`. One
   real schema error was found while building these: `focus: transcript` is
   not a valid `llm`-grader field on 2.1.272 (only `focus: last_message` is
   confirmed valid, matching the 12 existing Phase-1 cases) — fixed in
   `evals/p2-investigate-frozen-requirement/graders/no-source-edit.md`.
8. **P2.4 correction J (plan/doc consistency).** Updated doc 07 (test guide,
   local-only), doc 08 (acceptance/rollout, local-only, obsolete
   throwaway-marketplace paragraph corrected), doc 10 (contractor checklist,
   local-only: P2.4 traceability rows, rollback checkbox corrected to
   partial, "Final handover" rewritten to point at this record), doc 11
   (dependency decisions, local-only: hook needed no new dependency),
   `docs/installation.md` (ownership lock/scope-conflict/postcondition/
   journal sections), `docs/compatibility.md` (confirmed
   `--append-system-prompt` flag, real `claude plugin details` "Hooks (4)"
   output, real `claude plugin validate --json` shape, re-measured prompt
   byte accounting reflecting the system/user split), `docs/review.md`
   (evidence-file lifecycle wording, renamed prompt artifacts), doc 06
   (user guide: edit reminders, calibration procedure), and
   `docs/release-checklist.md` (hook inventory, new pending rows). Added a
   "Superseded" pointer to the top of the P2.3 acceptance record.
9. **P2.4 correction K (final verification and self-audit).** See
   "Automated verification results" below for the exact commands and
   results, and "Self-audit findings" for what the adversarial pass over
   the complete diff found and fixed.

## Self-audit findings

Performed after K's automated verification passed, over the complete
unstaged diff, before staging anything:

- **Stale doc reference.** `docs/review.md` still named the single
  `reviewer-prompt.md` artifact that correction E replaced with
  `reviewer-system-prompt.md`/`reviewer-user-prompt.md`. Fixed.
- **Stale measured byte counts.** `docs/compatibility.md`'s "Review input
  limits" section quoted a specific prompt-byte measurement taken before
  correction E's system/user split changed how the prompt is composed.
  Re-measured live against a fresh minimal TypeScript git fixture with the
  built artifact (`ambicode bundle --json`) rather than left stale or
  guessed: 266 patch bytes, 104 mirrored bytes, 16,969 prompt bytes, 17,073
  model-input bytes. Updated the doc with the new numbers and reworded the
  "factor of seven" claim, since the actual ratio (~46× on this fixture) is
  illustrative and depends on the fixture, not a constant.
- **Everything else checked and found clean:** no direct `node:fs`/
  `child_process` calls in the new hook/shared-contract/json-output modules
  (all route through the existing `FileSystem`/`IdSource` ports); no second
  ad hoc `JSON.stringify(x, null, 2)` reimplementing `formatJsonOutput`; no
  `console.log`/`debugger` left in changed source; no stale references to
  the old single-string `ComposedPrompt.text` field; `hooks/hooks.json` is
  the only file under `hooks/`, shipped through the same explicit allowlist
  as every other file (no wildcard); the new eval directories' regenerated
  macOS `.DS_Store` files are excluded by the repository-wide `.DS_Store`
  `.gitignore` entry, confirmed with `git status --porcelain --ignored` and
  `git check-ignore -v`, so `git add` on those directories does not pick
  them up; `dist/` (this session's rebuilt packaging output) is excluded by
  `.gitignore`'s `/dist/` entry and never appeared in `git status`; no
  `--plugin-dir`/marketplace/hosted-distribution code path was added or
  changed; `hook_event_name`'s `PostToolUse` branch is the hook's only
  branch that can produce visible output, and it never blocks, alters, or
  comments on the tool call that already happened.

## Candidate identity

- **Candidate version**: `0.3.0` (from `package.json` and
  `.claude-plugin/plugin.json`, which packaging verifies agree).
- **Source commit currently tested**: `daf919e` ("P2.3"), **plus the
  uncommitted P2.4 corrections and additions described above**. Nothing
  from this session has been committed. See "Staged/unstaged status" below
  for exactly what is staged.
- **Artifact filename**: `dist/ambicode-0.3.0.zip` (an optional,
  byte-reproducible convenience artifact — not required for local
  installation, which uses the candidate directory directly).
- **Artifact digest (SHA-256)**: `201231c4bd64a7421352c71e484fdfcdc49f33c51d2890b8e5c2db6afce6f441`
  (also in `dist/ambicode-0.3.0.zip.sha256`; regenerate before relying on
  this file, since `dist/` is gitignored build output, not a committed
  artifact).
- **Artifact inventory**: `dist/ambicode-0.3.0.inventory.json`, generated
  fresh for this record: **32 files** (31 in the P2.3 record, plus
  `hooks/hooks.json`; several shipped documents' byte counts also changed
  where this session's corrections edited them).

| Path | Bytes | Mode |
| --- | --- | --- |
| `.claude-plugin/plugin.json` | 526 | 644 |
| `bin/ambicode` | 123 | **755** |
| `docs/compatibility.md` | 34227 | 644 |
| `docs/installation.md` | 23731 | 644 |
| `docs/review.md` | 20707 | 644 |
| `docs/rule-migration.md` | 6552 | 644 |
| `hooks/hooks.json` | 657 | 644 |
| `policies/*.yaml` (12 files) | 952–6774 each | 644 |
| `policies/prompts/review-smells.md` | 2589 | 644 |
| `prompts/reviewer-role.md` | 3326 | 644 |
| `prompts/shared-operating-contract.md` | 2275 | 644 |
| `scripts/ambicode.mjs` | 3339918 | 644 |
| `skills/init/SKILL.md` | 3360 | 644 |
| `skills/investigate/SKILL.md` | 7990 | 644 |
| `skills/plan/SKILL.md` | 10612 | 644 |
| `skills/review/SKILL.md` | 11307 | 644 |
| `skills/shared/requirements-mcp.md` | 6866 | 644 |
| `skills/task/SKILL.md` | 16172 | 644 |
| `templates/error.eta`, `templates/page.css`, `templates/review.eta` | 608 / 2861 / 10405 | 644 |

No `node_modules`, no TypeScript source, no `package.json`/lockfile, no
`docs/acceptance/**`, no `docs/release-checklist.md`, and no absolute path
from this workstation appear in the candidate; `npm run package:candidate`
fails the build if any of those checks does not hold (including the new
`checkHooksManifest`), and it passed. `npm run package:reproducible`
packaged the candidate twice from a fresh `npm run build` each time and
confirmed byte-identical paths, sizes and SHA-256 digests **and identical
zip SHA-256** across both runs
(`201231c4bd64a7421352c71e484fdfcdc49f33c51d2890b8e5c2db6afce6f441` both
times).

## Environment

| Component | Version | How established |
| --- | --- | --- |
| OS / architecture | Darwin 27.0.0, arm64 (macOS) | `uname -a`, observed |
| Claude Code | 2.1.272 | `claude --version`, observed |
| Node.js | 24.15.0 | `node --version`, observed |
| npm | 11.12.1 | `npm --version`, observed |
| Git | 2.55.0 | `git --version`, observed |
| `glab` | not installed | observed; GitLab adapter covered by fake-`ProcessRunner` unit tests only |
| Docker CLI / daemon | not exercised this session | remote executable checks remain fake-covered only |
| `zip` (Info-ZIP) | OS-shipped | observed, used by `package-candidate.mjs` |
| Model identifier | not exposed / not used for a paid call | No authorized paid model call was made this session (E02, and model/MCP-dependent PL01–PL10/I01–I08/T01–T11, remain pending) |

## Automated verification results

| Check | Command | Result |
| --- | --- | --- |
| Build, typecheck, unit tests, strict plugin validation (source), in doc 07's documented order | `npm run verify` | passed — **454 tests, 50 suites, 0 failures** |
| Package candidate | `npm run package:candidate` | passed (32 files; launcher mode 755; no forbidden paths; no workstation paths; shared-resource references correct for all four referrers; hooks manifest routes through the one bundled entry point) |
| Reproducible package | `npm run package:reproducible` | passed (two independent builds; identical file set, digests, and zip SHA-256) |
| Strict plugin validation (packaged candidate) | `claude plugin validate dist/ambicode-0.3.0 --strict` | passed |
| Isolated durable local install/inspect/reload/uninstall smoke | `npm run smoke:install-local` | passed — see "Packaged installation evidence" below |
| `npm audit` | | 0 vulnerabilities |
| `git diff --check` (unstaged, before staging) | | passed, no whitespace errors |
| `git diff --cached --check` (staged, against the complete batch staged at the end of this session) | | passed, no whitespace errors |
| Eval suite load (E01-equivalent, zero cost) | `claude plugin eval . --scaffold --allow-tools Bash --max-cost-usd 0 --trust-plugin` | passed — reports **2 arms × 18 cases (108 runs)**; cost ceiling stopped execution before any case ran, and no case reported a field/schema error |

## Packaged installation evidence

All of the following ran with a fresh, isolated `CLAUDE_CONFIG_DIR`, never
pointed at the real `~/.claude`:

1. `npm run smoke:install-local` — installed into a fresh
   `CLAUDE_CONFIG_DIR`, copied the candidate into the durable
   `<config-dir>/ambicode-install/marketplace/`, ran the native
   marketplace-add/install sequence (succeeded), inspected it, **deleted
   the candidate directory used for install entirely**, then confirmed from
   further fresh `claude` processes — none of them the one that performed
   the install — that `claude plugin list`/`claude plugin details
   ambicode@ambicode-team` still reported the plugin, all five skills, and
   the four hooks; confirmed no workstation absolute path appears anywhere
   under the installed `CLAUDE_CONFIG_DIR`; exercised a same-version
   reinstall, a version-upgrade-in-place against a synthetic
   `0.3.0-smoke` candidate, a scope-change refusal, and a corrupt-state
   refusal (all four added this session); then uninstalled without the
   deleted candidate directory existing and confirmed both the plugin and
   the durable install directory were gone afterward.
2. Separately, this session, against another fresh isolated
   `CLAUDE_CONFIG_DIR`: installed the packaged candidate and ran
   `claude plugin details ambicode@ambicode-team`, which printed exactly:

   ```
   Component inventory
     Skills (5)  init, investigate, plan, review, task
     Agents (0)
     Hooks (4)  PostToolUse, SessionStart, PostCompact, SessionEnd  (harness-only — no model context cost)
     MCP servers (0)
     LSP servers (0)
   ```

   then ran `claude plugin validate dist/ambicode-0.3.0 --strict --json`
   against the same packaged directory, confirming the exact response shape
   documented in `docs/compatibility.md`, then uninstalled cleanly.

This demonstrates durable, failure-safe local installation from the
packaged candidate, outside the source checkout, surviving the deletion of
the directory used for install, exposing all five skills and the four
hooks, and correctly refusing a scope conflict rather than silently leaving
a dangling registration — the P2.4 correction D requirement.

## Manual/fixed-case status (doc 07)

Unit tests do not satisfy the M-table or the I-/PL-/T-tables (doc 07 is
explicit about this). Nothing below is claimed passed on the strength of a
unit test alone.

| ID | Status | Note |
| --- | --- | --- |
| M01–M04, M12 (packaged-install portion), M14 | **passed**, carried over unchanged from the P2.3 record | This session's changes to those code paths (M12's packaged-install portion) are superseded by this record's fuller evidence above rather than re-asserted separately; the rest are untouched by this session. |
| M05–M11, M13 | **pending**, unchanged | Same external prerequisites as before: GitLab sandbox, browser, Docker daemon, Jira/Confluence MCP. See `docs/release-checklist.md`. |
| I01–I08 (P2.1 fixed investigation cases) | **pending**, unchanged | Same prerequisites as the prior record. None executed with real access this session. |
| PL01–PL10 (P2.2 fixed plan cases) | **pending**, unchanged | Same prerequisites as the prior record. None executed with real access this session. |
| T01–T11 (P2.3 fixed task cases) | **pending**, unchanged | Same prerequisites as the prior record. None executed with real access this session. |
| E02 (one authorized eval smoke case) | **pending**, unchanged | Needs authorized, budgeted model access; the suite it would run against now has 18 cases, confirmed loadable at zero cost this session. |
| A second developer's own packaged install | **pending**, unchanged | Needs a second person; see `docs/release-checklist.md`. |
| A real cross-release rollback | **pending**, unchanged | Needs a second, later, independently built candidate; this session re-demonstrated the underlying mechanism (install over an existing different-version install, plus all four new D-correction failure-safety mechanics), not a rollback between two tagged releases, because none exists yet. |

## Dependency and license inventory

No new runtime dependency was added this session. `package.json`'s
`dependencies` list is unchanged from the P2.3 record; `npm audit` reports
0 vulnerabilities as of this record. `package.json`'s `verify` script was
reordered to `build && typecheck && test:unit && validate:plugin` (doc 07's
documented order) because the new built-artifact tests
(`prepare-artifact.test.mjs`, `hook-artifact.test.mjs`) need
`scripts/ambicode.mjs` to already exist; this is a script-ordering change,
not a new dependency. `src/hook/run-hook.ts` and `src/hook/markers.ts`
(new) needed no new dependency either — see doc 11's new note: they reuse
the existing `FileSystem`/`IdSource` ports and the existing policy
resolver, with no second CLI parser, YAML/JSON-Schema parser, or bundled
executable.

## Remaining limitations and prerequisites

Everything in `docs/compatibility.md`'s "Not available in this environment"
table still applies: no `glab`, no GitLab sandbox, no running container
runtime, no Jira/Confluence MCP, no authorized model access used this
session, no real browser exercise. Additionally, unchanged from the P2.3
record:

- T01–T11, PL01–PL10, and I01–I08 have not been executed with real access.
- No second developer has installed this candidate.
- The value gate remains pending — it needs a pilot owner and two real
  repositories, neither of which this environment has. This does not block
  P2.4's implementation, which document 04 and this session's task
  explicitly authorized to start regardless.
- A real rollback between two independently *released* versions is still
  pending, for the reason given in the table above.
- Confirming that a disabled plugin's skills are actually unavailable in a
  real, authenticated Claude Code session (as opposed to the isolated,
  credential-free sandbox used for every check in this record) is pending
  on a developer's own machine.

No external evidence (GitLab, browser, Docker, second-developer install, or
pilot data) is claimed anywhere in this record; every row above that needs
one of those says so explicitly rather than being silently omitted or
reported as passed.

## Phase decision

**Phase 1 is still not complete** (unchanged conclusion from the prior
record: M05–M11, M13 pending, value gate pending). **P2.4's corrections
A–K are implemented** per document 04's explicit authorization to start
Phase 2 work despite the Phase 1 value gate being pending; their
manual/model-dependent cases (I01–I08, PL01–PL10, T01–T11, E02) remain
pending in the same honest sense as Phase 1's own pending rows —
implemented and unit/built-artifact tested, not yet evaluated against real
external services or authorized model access.

## Staged/unstaged status

At the moment this record was written, the complete correction batch was
staged and nothing was left unstaged; `git diff --cached --check` above
ran against exactly that staged batch. Nothing was committed.
