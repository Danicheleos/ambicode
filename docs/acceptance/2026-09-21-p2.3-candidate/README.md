# P2.2-corrected + P2.3 candidate acceptance record — 2026-09-21

> **Superseded.** A P2.4 audit (doc 04 P2.4, corrections A–K) in a later
> session this same day found and fixed real gaps this record did not know
> about — most materially: authoring skills invoked `ambicode prepare`
> without `--json` and could not actually read `sharedOperatingContract`,
> `contextBudget.measuredBytes` did not equal the real `--json` stdout byte
> count, load-time policy diagnostics from a genuinely inapplicable pack
> incorrectly blocked preparation, `install()` never checked for a scope
> conflict or re-verified a postcondition and could leave a dangling
> marketplace registration on a failed fresh install, and the reviewer
> prompt carried the diff and untrusted evidence inside the same text as the
> operating contract rather than the appended system prompt. This record's
> claims about P2.2/P2.3 correctness are superseded by
> `docs/acceptance/2026-09-21-p2.4-final-candidate/README.md`, which also
> covers P2.4 itself. Read that record first; this one is kept for its
> still-accurate installer/skill-count narrative and is not itself corrected
> line by line.

This is a locally prepared and locally verified candidate, not a released
version. Sections below use exactly `passed`, `failed`, `pending`, or `not
applicable`. "Unavailable" is never written as "passed." This record
supersedes `docs/acceptance/2026-09-21-p2.2-candidate/` for everything it
re-verified (P2.2 corrections A–E, the P2.3 additions below) without
restating rows that record already covers and this session did not touch
(M05–M11 GitLab/browser prerequisites, the value gate, I01–I08, PL01–PL10).

## What this session did

Corrections A–D below were completed first, with their focused tests
passing, before P2.3's task implementation began, per this session's task.

1. **P2.3 correction A (failure-safe local install/upgrade/uninstall).**
   `install-local.mjs` previously mutated or removed the current
   installation before the replacement or uninstall had been confirmed by
   Claude Code, and treated *any* failed `plugin install`/`marketplace add`
   as "already installed" before falling back to `update`. It is now
   rewritten around an injectable `NativeCommands` adapter (`marketplaceAdd`,
   `marketplaceUpdate`, `marketplaceRemove`, `pluginInstall`, `pluginUpdate`,
   `pluginUninstall`, `pluginList`), each returning a normalized,
   never-throwing outcome. `install` stages and validates the replacement
   candidate copy and marketplace manifest in a sibling directory first
   (parses the manifest, cross-checks the copied plugin's own `plugin.json`
   against the candidate identity), renames the previous installation aside
   — never deletes it up front — publishes the validated replacement by
   rename, then drives the native operations against it: `marketplace add`
   (empirically idempotent — Claude Code 2.1.272 returns success whether the
   marketplace is new or already registered at that path, so no fallback
   logic is needed there at all), `marketplace update` (forces a re-read of
   the just-published content), then `plugin list --json` read as
   **structured native state** to decide between a no-op (already installed
   at this exact version/scope), `plugin update --json` (a different version
   installed), or `plugin install --json` (nothing installed yet) — never
   guessed from a caught exception. Any native failure restores the
   renamed-aside previous installation (or removes the newly published one,
   if this was the very first install at this `CLAUDE_CONFIG_DIR`) and
   returns nonzero; "Installed"/"Uninstalled" print only after the complete
   operation succeeds. `uninstall` now persists and reads back its own
   `state.json` (name, version, scope, project directory) instead of
   trusting a caller-supplied scope, refuses an explicit `--scope`/
   `--project-dir` that conflicts with that record, and removes the durable
   directory only once both `plugin uninstall` and `marketplace remove` have
   actually succeeded or reported the specific already-gone outcome
   (`failureCode: "not_installed"`, or a "not found" marketplace-removal
   message) — any other failure leaves the durable directory in place as a
   recovery path. New `install-local.test.mjs` (10 cases, run via
   `node --test install-local.test.mjs`, folded into `npm run test:unit`)
   exercises all of this against a fake native adapter: first install,
   same-version idempotent install, successful version upgrade, a
   marketplace-update failure preserving the old installation, a
   plugin-update failure preserving the old installation, uninstall using
   the recorded scope, a wrong-scope refusal, a plugin-uninstall failure
   preserving the durable source, a marketplace-removal failure preserving a
   recoverable state, and uninstall without the original candidate
   directory. `install-local.smoke.mjs` (`npm run smoke:install-local`) is
   unchanged in what it proves — the real, isolated, full lifecycle against
   the actual `claude` binary — and still passes against the rewritten
   script; it was also extended this session to check for all five skills.
   This session additionally re-ran, by hand against a real isolated
   `CLAUDE_CONFIG_DIR`: `disable`/`enable` (unchanged native commands), an
   upgrade install against a second, differently-versioned candidate (took
   the `plugin update` path, not `install`, as designed), and the
   wrong-scope uninstall refusal (printed the expected refusal message and
   exited nonzero without touching the durable directory).
2. **P2.3 correction B (prepared policy complete and bounded).**
   `ambicode prepare` previously returned success-shaped output even when a
   pack/prompt-loading `error` diagnostic meant applicable content was
   silently omitted, and had no aggregate byte budget over what it delivers.
   `runPrepare` now throws `preparation-blocked` if any diagnostic in the
   resolved policy (config/pack/rule/prompt) has `severity: 'error'` — before
   measuring anything — and separately enforces one aggregate
   `preparation-too-large` byte budget, measured as the UTF-8 byte length of
   the actual serialized draft output (so "fixed output framing" is measured
   for real, not estimated) against the existing `review.maxContextBytes`
   configuration value; no second hardcoded limit was introduced. The
   successful path now returns `contextBudget: { measuredBytes, limitBytes }`
   for diagnostics. Provenance was also corrected: `policyProvenance` (used
   by `review`/`bundle`) is unchanged, but `ambicode prepare` now uses a new
   `packProvenance` for packs and derives prompt provenance only from the
   stage-filtered, content-resolved prompts it actually returns — it can no
   longer claim a filtered-out `before-review` prompt as provenance for
   `plan`/`investigate`/`task`. `task` was added to `PREPARE_PROMPT_STAGES`
   (`before-work`, `before-checks`, `before-report`; `before-review` remains
   exclusively the isolated reviewer's). New tests in
   `src/cli/prepare.test.ts`'s "P2.3 ambicode prepare — correction B" suite
   cover: the `task` stage set and its delivered content; blocking on an
   unreadable, oversized, and same-run-changed applicable prompt; blocking
   on a pack-level YAML error; a successful in-budget measurement; aggregate
   overflow from several individually-small prompts together; aggregate
   overflow from a requirement plus prompt content together; and that no
   filtered prompt's provenance is claimed for `plan`/`investigate`.
3. **P2.3 correction C (authority language).** `skills/plan/SKILL.md` and
   `skills/investigate/SKILL.md` previously grouped `team`/`observed` rules
   together as if both were already "actual expectations," contradicting
   doc 05's definition that `observed` is evidence of existing practice, not
   an approved requirement by itself. Both, plus the new `skills/task/SKILL.md`,
   `prompts/shared-operating-contract.md` (which previously did not mention
   `observed` at all), and `prompts/reviewer-role.md`, now state the
   three-way distinction explicitly — `team` approved requirement,
   `observed` evidence of existing practice (not itself a requirement),
   `inherited` baseline guidance — and that `observed`/`inherited` guidance
   is never itself a policy violation absent independent requirement or code
   evidence. A new `src/util/skill-content.test.ts` case asserts the
   distinction is stated correctly (and that `` `team`/`observed` `` is never
   conflated) in `plan`, `investigate`, and `task`.
4. **P2.3 correction D (plan argument interpretation).**
   `skills/plan/SKILL.md` previously hedged the primary-request definition
   as "the first token (or the whole line up to the first `--requirement`)"
   — describing the first token as an accepted reading at all. It now states
   unambiguously that the primary request is the complete argument span
   before the first recognized `--requirement` option, with its whitespace
   and multiword intent preserved, and that a single-URL span is itself a
   requirement source. `skills/task/SKILL.md` states the identical rule for
   its own `$ARGUMENTS`. A new `src/util/skill-content.test.ts` case (run
   against both `plan` and `task`) asserts the corrected wording and that
   the old first-token phrasing is gone.
5. **P2.3 (Tasks).** Added `/ambicode:task` (`skills/task/SKILL.md`,
   `argument-hint` frontmatter, `$ARGUMENTS` referenced explicitly): a thin
   skill that reuses `ambicode prepare --activity task` for policy/scope and
   `ambicode review` for affected-check selection, command
   run/propose/forbid decisions, mutation detection, and the independent
   reviewer — no new CLI command, selector, runner, or reviewer was added.
   It accepts a direct request, a Jira/Confluence URL, a pasted or saved
   accepted plan, or an existing task note; never forces a plan or requires
   an investigation/task identifier; treats a plan/ticket/comment/test
   output as evidence, never as authorization; reruns `ambicode prepare`
   when implementation reaches paths outside the initial guess; asks the
   user rather than silently implementing a scope-expanding reviewer
   finding; needs no task file for a small change and documents the optional
   `.ambicode/notes/tasks/<slug>.md` note and its historical-on-resume
   treatment; and reports exactly Done/Evidence/Not verified/Remaining,
   never letting "Done" imply successful verification it did not have.
   `skills/shared/requirements-mcp.md` was updated so its evidence file's
   lifecycle is per-workflow rather than always "delete right after
   `prepare`": `task` keeps the file alive across both its consumers
   (`ambicode prepare`, then the final `ambicode review`) and deletes it
   only after the last one. `package-candidate.mjs`'s
   `checkSharedResourceReferences` and its test-level equivalent in
   `src/util/skill-content.test.ts` were extended to expect `task` as a
   fourth referrer of the shared MCP procedure, and the skill-registration
   list now expects exactly five skills. No new dependency, CLI command,
   contract, or filesystem/process port was added; built-in policy packs
   already declared `task` in their `activities` list from earlier phases,
   so no pack changes were needed for `task`'s policy to apply.

## Candidate identity

- **Candidate version**: `0.1.0` (from `package.json` and `.claude-plugin/plugin.json`, which packaging verifies agree).
- **Source commit currently tested**: `aa9f965` ("P2.2"), **plus the uncommitted corrections and P2.3 work described above and in the accompanying final report**. Nothing from this session has been committed. The final report lists every staged/unstaged/untracked path.
- **Artifact filename**: `dist/ambicode-0.1.0.zip` (an optional, byte-reproducible convenience artifact — not required for local installation, which uses the candidate directory directly; see doc 03 P1.7 correction B/C).
- **Artifact digest (SHA-256)**: `62b5cb64112f5c3a70f5445b0ac5aeb6c18c373efbeec6a34b4d29415730e9d6` (also in `dist/ambicode-0.1.0.zip.sha256`).
- **Artifact inventory**: `dist/ambicode-0.1.0.inventory.json`, generated fresh for this record: **31 files** (30 in the prior P2.2 record, plus `skills/task/SKILL.md`; several other shipped documents' byte counts also changed where this session's corrections edited them — `docs/compatibility.md`, `docs/installation.md`, `docs/review.md`, `prompts/reviewer-role.md`, `prompts/shared-operating-contract.md`, `skills/investigate/SKILL.md`, `skills/plan/SKILL.md`, `skills/shared/requirements-mcp.md`).

| Path | Bytes | Mode |
| --- | --- | --- |
| `.claude-plugin/plugin.json` | 526 | 644 |
| `bin/ambicode` | 123 | **755** |
| `docs/compatibility.md` | 30611 | 644 |
| `docs/installation.md` | 20741 | 644 |
| `docs/review.md` | 20451 | 644 |
| `docs/rule-migration.md` | 6552 | 644 |
| `policies/*.yaml` (13 files) | 952–6774 each | 644 |
| `policies/prompts/review-smells.md` | 2589 | 644 |
| `prompts/reviewer-role.md` | 3326 | 644 |
| `prompts/shared-operating-contract.md` | 2275 | 644 |
| `scripts/ambicode.mjs` | 3260005 | 644 |
| `skills/init/SKILL.md` | 3360 | 644 |
| `skills/investigate/SKILL.md` | 7994 | 644 |
| `skills/plan/SKILL.md` | 10560 | 644 |
| `skills/review/SKILL.md` | 11307 | 644 |
| `skills/shared/requirements-mcp.md` | 6389 | 644 |
| `skills/task/SKILL.md` | 15116 | 644 |
| `templates/error.eta`, `templates/page.css`, `templates/review.eta` | 608 / 2861 / 10405 | 644 |

No `node_modules`, no TypeScript source, no `package.json`/lockfile, no
`docs/acceptance/**`, no `docs/release-checklist.md`, and no absolute path
from this workstation appear in the candidate; `npm run package:candidate`
fails the build if any of those checks does not hold (including
`checkSharedResourceReferences` now expecting `task` as a fourth referrer),
and it passed. `npm run package:reproducible` packaged the candidate twice
from a fresh `npm run build` each time and confirmed byte-identical paths,
sizes and SHA-256 digests **and identical zip SHA-256** across both runs
(`62b5cb64112f5c3a70f5445b0ac5aeb6c18c373efbeec6a34b4d29415730e9d6` both
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
| `zip` (Info-ZIP) | OS-shipped (3.0) | observed, used by `package-candidate.mjs` |
| Model identifier | not exposed / not used for a paid call | No authorized paid model call was made this session (E02, model/MCP-dependent PL01–PL10/I01–I08/T01–T11 pending) |

## Automated verification results

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | passed |
| Unit tests | `npm run test:unit` | passed — 411 tests, 44 suites, 0 failures (includes the new `install-local.test.mjs`, 10 cases, run as a plain Node test file alongside the TypeScript suites) |
| Build | `npm run build` | passed |
| Strict plugin validation (source) | `claude plugin validate . --strict` | passed |
| `npm run verify` (typecheck + test:unit + build + validate:plugin, in one run) | `npm run verify` | passed |
| Package candidate | `npm run package:candidate` | passed (31 files; launcher mode 755; no forbidden paths; no workstation paths; shared-resource references correct for all four referrers including `task`) |
| Reproducible package | `npm run package:reproducible` | passed (two independent builds; identical file set, digests, and zip SHA-256) |
| Strict plugin validation (packaged candidate) | `claude plugin validate dist/ambicode-0.1.0 --strict` | passed |
| Isolated durable local install/inspect/reload/uninstall smoke | `npm run smoke:install-local` | passed — see "Packaged installation evidence" below; now asserts all five skills |
| `git diff --check` | | passed, no whitespace errors |
| `git diff --cached --check` | | passed, no whitespace errors, against the complete batch staged at the end of this session |
| `npm audit` | | 0 vulnerabilities |
| E01 (eval load-only) | not re-run this session | Unchanged from the P2.2 record; no `task`/`investigate`/`plan` eval fixtures exist yet (T01–T11/PL01–PL10/I01–I08 in doc 07 are case *definitions*, not built as `claude plugin eval` fixtures) |

## Packaged installation evidence

All of the following ran with a fresh, isolated `CLAUDE_CONFIG_DIR`, never
pointed at the real `~/.claude`:

1. `npm run smoke:install-local` — installed into a fresh
   `CLAUDE_CONFIG_DIR`, copied the candidate into the durable
   `<config-dir>/ambicode-install/marketplace/`, ran `claude plugin
   marketplace add`/`claude plugin install ambicode@ambicode-team -s user -y`
   (succeeded), inspected it (a first fresh `claude` process), **deleted the
   candidate directory used for install entirely**, then confirmed from
   further fresh `claude` processes — none of them the one that performed
   the install — that `claude plugin list` and `claude plugin details
   ambicode@ambicode-team` still reported the plugin and **`Skills (5)
   init, investigate, plan, review, task`**; confirmed no workstation
   absolute path (`$(pwd)` or `$HOME`) appears anywhere under the installed
   `CLAUDE_CONFIG_DIR`; then uninstalled without the deleted candidate
   directory existing (`claude plugin uninstall`, then `claude plugin
   marketplace remove`, both succeeded) and confirmed both the plugin and
   the durable install directory were gone afterward.
2. Manually, against a separate isolated `CLAUDE_CONFIG_DIR` (not the smoke
   test's): `disable`/`enable` (unchanged native commands; `claude plugin
   list` showed `Status: ✘ disabled` then `✔ enabled`); installed a second,
   differently-versioned candidate over the first, which correctly took the
   `claude plugin update` path (not `install`) per the new structured-state
   check, and `claude plugin list --json` reported the new version
   afterward; and attempted `uninstall --scope project --project-dir <dir>`
   against an installation actually recorded as scope `user`, which printed
   `The recorded installation is scoped "user"; refusing to uninstall scope
   "project" instead.` and exited nonzero, then a correct
   `uninstall` (no `--scope`) against the same `CLAUDE_CONFIG_DIR` succeeded
   and removed the durable directory.

This demonstrates durable, failure-safe local installation from the
packaged candidate, outside the source checkout, surviving the deletion of
the directory used for install, exposing all five skills, correctly
distinguishing an upgrade from a fresh install via structured native state,
and refusing a scope-conflicting uninstall rather than guessing — the P2.3
correction A requirement.

## Manual/fixed-case status (doc 07)

Unit tests do not satisfy the M-table or the I-/PL-/T-tables (doc 07 is
explicit about this). Nothing below is claimed passed on the strength of a
unit test alone.

| ID | Status | Note |
| --- | --- | --- |
| M01–M04, M12 (packaged-install portion), M14 | **passed**, carried over unchanged from the prior P2.2 record | This session's changes to those code paths (M12's packaged-install portion) are superseded by this record's fuller evidence above rather than re-asserted separately; the rest are untouched by this session. |
| M05–M11, M13 | **pending**, unchanged | Same external prerequisites as before: GitLab sandbox, browser, Docker daemon, Jira/Confluence MCP. See `docs/release-checklist.md`. |
| I01–I08 (P2.1 fixed investigation cases) | **pending**, unchanged | Same prerequisites as the prior record. None executed with real access this session. |
| PL01–PL10 (P2.2 fixed plan cases) | **pending**, unchanged | Same prerequisites as the prior record. None executed with real access this session. |
| T01–T11 (P2.3 fixed task cases, doc 07) | **pending** | T01, T02, T04, T07, T08, T10, T11 need only authorized model access with a fixture project whose configured checks actually run; T03 additionally needs a previously accepted plan; T05 needs a fixture with no configured reproduction mechanism; T06 needs a configured `propose` command or an over-limit selection; T09 needs a deliberately planted scope-expanding finding. None were executed with real access in this environment; none is reported as passed. |
| E02 | **pending**, unchanged | Needs authorized, budgeted model access. |

## Dependency and license inventory

No new runtime dependency was added this session. `package.json`'s
`dependencies` list is unchanged from the prior record; `npm audit` reports
0 vulnerabilities as of this record. `package.json`'s `scripts.test:unit`
was widened to also match `*.test.mjs` at the repository root so
`install-local.test.mjs` runs as part of `npm run test:unit`/`npm run
verify`; this is a test-glob change, not a new dependency. No new
TypeScript module needed its own document-11 entry: `src/policy/provenance.ts`
gained one new exported function (`packProvenance`) rather than a new file,
and `src/contracts/prepare.ts` gained one new schema field
(`contextBudget`) on the existing `PrepareOutput` contract.

## Remaining limitations and prerequisites

Everything in `docs/compatibility.md`'s "Not available in this environment"
table still applies: no `glab`, no GitLab sandbox, no running container
runtime, no Jira/Confluence MCP, no authorized model access used this
session, no real browser exercise. Additionally:

- T01–T11 (P2.3's own fixed task cases), PL01–PL10 (P2.2's), and I01–I08
  (P2.1's) have not been executed with real access; see the tables above
  for exactly which ones need what.
- No second developer has installed this candidate; see
  `docs/release-checklist.md`.
- The value gate remains pending, unchanged from the prior record — it needs
  a pilot owner and two real repositories, neither of which this environment
  has. This does not block P2.3's implementation, which document 04 and
  this session's task explicitly authorized to start regardless.
- A real rollback between two independently *released* versions is still
  pending; this session re-demonstrated the underlying mechanism (install
  over an existing different-version install) against the rewritten
  `install-local.mjs`, not a rollback between two tagged releases, because
  none exists yet.

## Phase decision

**Phase 1 is still not complete** (unchanged conclusion from the prior
record: M05–M11, M13 pending, value gate pending). **P2.2's corrections and
P2.3 are implemented** per document 04's explicit authorization to start
Phase 2 work despite the Phase 1 value gate being pending; their
manual/model-dependent cases (I01–I08, PL01–PL10, T01–T11) remain pending in
the same honest sense as Phase 1's own pending rows — implemented and unit
tested, not yet evaluated against real external services or authorized
model access.
