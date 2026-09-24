# P1.7 candidate acceptance record — 2026-09-21

**Superseded by `docs/acceptance/2026-09-21-p2.1-candidate/`**, which corrects
this record's lease-reclaim, packaging-allowlist, and hosted-marketplace
findings (doc 03 P1.7 corrections A–C) and adds the P2.1 result. This record
is kept for its still-accurate M01–M04/M12/M14 evidence and is otherwise
historical; do not read its packaging/distribution sections as current.

This is a locally prepared and locally verified candidate, not a released
version. Sections below use exactly `passed`, `failed`, `pending`, or `not
applicable`. "Unavailable" is never written as "passed."

## Candidate identity

- **Candidate version**: `0.3.0` (from `package.json` and `.claude-plugin/plugin.json`, which packaging verifies agree).
- **Source commit currently tested**: `7255b9c555bac1877ab6669cb67a82b6a56d4608` ("P1.6"), **plus staged, uncommitted P1.7 work on top** (the P1.6 corrections A–E and all P1.7 packaging/docs described below). Nothing has been committed. `git status --porcelain` at the time this record was written lists every changed/new path; the final report accompanying this record repeats the exact list.
- **Artifact filename**: `dist/ambicode-0.3.0.zip`
- **Artifact digest (SHA-256)**: `fa82837f42cb6ebdc3da4a50f5d2d3ac621f8836662da77929c65e2fbcaaf569` (also in `dist/ambicode-0.3.0.zip.sha256`, produced by `npm run package:candidate`)
- **Artifact inventory**: `dist/ambicode-0.3.0.inventory.json`, 28 files, reproduced below.

| Path | Bytes | Mode |
| --- | --- | --- |
| `.claude-plugin/plugin.json` | 526 | 644 |
| `bin/ambicode` | 123 | **755** |
| `docs/compatibility.md` | 30206 | 644 |
| `docs/installation.md` | 10234 | 644 |
| `docs/release-checklist.md` | 6599 | 644 |
| `docs/review.md` | 19547 | 644 |
| `docs/rule-migration.md` | 6552 | 644 |
| `policies/*.yaml` (13 files) | 1489–6774 each | 644 |
| `policies/prompts/review-smells.md` | 2589 | 644 |
| `prompts/reviewer-role.md` | 2902 | 644 |
| `prompts/shared-operating-contract.md` | 1826 | 644 |
| `scripts/ambicode.mjs` | 3241856 | 644 |
| `skills/init/SKILL.md` | 3360 | 644 |
| `skills/review/SKILL.md` | 12902 | 644 |
| `templates/error.eta`, `templates/page.css`, `templates/review.eta` | 608 / 2861 / 10405 | 644 |

No `node_modules`, no TypeScript source, no `package.json`/lockfile, and no
absolute path from this workstation appear in the candidate; `npm run
package:candidate` fails the build if any of those checks does not hold,
and it passed. `npm run package:reproducible` packaged the candidate twice
from a fresh `npm run build` each time and confirmed byte-identical paths,
sizes and SHA-256 digests across both runs.

## Environment

| Component | Version | How established |
| --- | --- | --- |
| OS / architecture | Darwin 27.0.0, arm64 (macOS) | `uname -a`, observed |
| Claude Code | 2.1.272 | `claude --version`, observed |
| Node.js | 24.15.0 | `node --version`, observed |
| npm | 11.12.1 | `npm --version`, observed |
| Git | 2.55.0 | `git --version`, observed |
| `glab` | not installed | observed; GitLab adapter covered by fake-`ProcessRunner` unit tests only |
| Docker CLI / daemon | CLI 28.0.4 observed; daemon **not running** | `docker --version` / `docker info` |
| `zip` (Info-ZIP) | OS-shipped `/usr/bin/zip` | observed, used by `package-candidate.mjs` |
| Model identifier | not exposed / not used | No authorized paid model call was made this session (E02 pending, value gate pending) |

**Supported environment claim**: Node ≥24, the pinned dependency majors in
`package-lock.json`, and Claude Code 2.1.272 as tested. **Unverified**: any
other Claude Code version, any OS other than macOS/Darwin arm64 observed
here (the code has no platform-specific branches beyond what
`docs/compatibility.md` already lists as unverified for `glab`/Docker),
Windows path handling for the plugin loader's own conventions.

## Automated verification results

| Check | Command | Result |
| --- | --- | --- |
| Clean install | `npm ci` | passed |
| Typecheck | `npm run typecheck` | passed |
| Unit tests | `npm run test:unit` | passed — 333 tests, 37 suites, 0 failures |
| Build | `npm run build` | passed |
| Strict plugin validation (source) | `claude plugin validate . --strict` | passed |
| Package candidate | `npm run package:candidate` | passed (28 files; launcher mode 755; no forbidden paths; no workstation paths) |
| Reproducible package | `npm run package:reproducible` | passed (two independent builds, identical file set and digests) |
| Strict plugin validation (**packaged** candidate) | `claude plugin validate dist/ambicode-0.3.0 --strict` | passed |
| Packaged-helper smoke, outside this checkout | `node smoke-candidate.mjs dist/ambicode-0.3.0` (from `/tmp`) | passed — `version` outside any repo, `init`+`policy` resolve built-in policies, `view` serves its own templates |
| Local marketplace install (isolated `CLAUDE_CONFIG_DIR`) | see "Packaged installation evidence" below | passed |
| `git diff --cached --check` | run after staging | passed — see final report |
| `npm audit --omit=dev` | | 0 vulnerabilities (113 resolved packages total across the tree at last full audit in `docs/compatibility.md`; supporting evidence, not a standing guarantee — every dependency introducing a new attack surface is reachable only from `src/page/server.ts`/`templates/*.eta`, per that doc) |

## Packaged installation evidence

All of the following ran with `CLAUDE_CONFIG_DIR=/tmp/ambicode-isolated-claude-config`,
a directory created fresh for this record and never pointed at the real
`~/.claude`. Confirmed empirically before use: that directory alone
received Claude Code's own `.claude.json` and an initially empty
marketplace list, independent of the real user configuration.

1. `claude plugin marketplace add /tmp/ambicode-local-marketplace` (a local
   test marketplace whose one plugin entry's `source` is
   `./ambicode-0.3.0`, a copy of the packaged candidate directory — **not**
   `--plugin-dir .` and **not** the source repository) → succeeded.
2. `claude plugin install ambicode@ambicode-team -s user -y` → succeeded,
   `claude plugin list` showed version `0.3.0`, status enabled.
3. `claude plugin details ambicode@ambicode-team` → `Skills (2)  init,
   review`, confirming the `/ambicode:init` and `/ambicode:review`
   namespace without a model call.
4. `grep -rl` for this repository's own absolute path, and for the
   operator's home directory, across the entire installed cache tree →
   no matches.
5. `claude plugin validate dist/ambicode-0.3.0 --strict` (the same
   directory the marketplace entry pointed at) → passed.

## Disable / uninstall / rollback evidence

1. `claude plugin disable ambicode@ambicode-team -s user` → `claude plugin
   list` reported `Status: ✘ disabled`.
2. `claude plugin enable ambicode@ambicode-team -s user` → reported
   `Status: ✔ enabled` again.
3. Created `.ambicode/config.yaml` and `.ambicode/reviews/r-demo/result.json`
   under a disposable product-repo directory *before* uninstalling.
   `claude plugin uninstall ambicode@ambicode-team -s user` → `claude
   plugin list` reported no installed plugins; the two product-owned files
   were confirmed present and unchanged afterward.
4. The plugin's own cache under
   `plugins/cache/ambicode-team/ambicode/0.3.0/` in the isolated config
   directory was **not** removed by the uninstall in this observed run —
   recorded as Claude Code's native behavior, not asserted as a design
   requirement of AMBICODE's.
5. **Rollback mechanism**, demonstrated with two local, clearly-labeled
   test candidates because no real previous published version exists yet:
   pointed the local marketplace's `ambicode` entry at a second candidate
   directory whose `plugin.json` version is literally
   `"0.0.1-rollback-demo"`, ran `claude plugin marketplace update
   ambicode-team` then `claude plugin update ambicode@ambicode-team`, and
   observed `Plugin "ambicode" updated from 0.3.0 to 0.0.1-rollback-demo`.
   **Pending**: an actual rollback between two genuinely different
   released versions, which needs a first real release.

## E01 / E02

- **E01**: `claude plugin eval . --scaffold --allow-tools Bash
  --max-cost-usd 0 --trust-plugin` reported `Ablation: 2 arms × 12 cases (72
  runs)` before the `$0` cost ceiling stopped it — every expected case and
  both comparison arms resolved. Separately, a deliberately malformed case
  (`schema_version: "not-a-real-version"`) placed in a throwaway
  `--eval-dir` was refused with `schema_version "not-a-real-version" is not
  a valid version string` and loaded zero cases. **Result: passed.**
- **E02**: not run. **Pending.** Exact prerequisite: authorized, budgeted
  model access for `claude plugin eval`. Exact command:
  `claude plugin eval . --scaffold --allow-tools Bash --runs 1
  --max-cost-usd <budget> --trust-plugin`, run against one representative
  case. Expected trace evidence: the plugin arm invokes the `ambicode:review`
  skill, the skill runs `ambicode bundle`/`ambicode review` from the
  materialized fixture repository (not the eval harness directory), the
  result is read back, and the reviewer subprocess still receives only
  `Read`, `Grep`, `Glob`.

## Manual scenario matrix (doc 07)

Unit tests do not satisfy M01–M12 (doc 07/08 are explicit about this), so
every row below is either a command actually typed and observed this
session against the **packaged candidate binary** (`dist/ambicode-0.3.0/bin/ambicode`)
and a real materialized fixture repository, or is marked pending with its
exact prerequisite. None of the "passed" rows below rest on a unit test
alone.

| ID | Status | Evidence / prerequisite |
| --- | --- | --- |
| M01 | **passed** (this session) | `smoke-candidate.mjs` ran `ambicode init` from the packaged candidate, outside this repo, in a disposable git/TS repository, then `ambicode policy`, confirming detected commands and a matched built-in pack. Separately, `ambicode init` was also run in the `ts-staged-unstaged` and `ts-source-regression`/`ts-rename-delete` fixtures (below), each auto-detecting eslint/jest once installed. Repeating init twice and editing one command between runs (the "user edit preserved" half of M01) is exercised by U01 but was not separately repeated by hand this session; that half rests on U01, not on this row. |
| M02 | **passed** (this session) | `ts-staged-unstaged` fixture (staged edit, unstaged edit, staged-then-reverted edit, untracked file) → `ambicode bundle --json` from the packaged binary. Result: `changedFiles` correctly listed `src/staged.ts` (modified), `src/unstaged.ts` (modified) and `src/untracked.ts` (added as an addition), and correctly **omitted** `src/reverted.ts` (staged then reverted in the working file). `git status --porcelain` and `git ls-files -s | shasum` were identical before and after. This used `bundle`, not `review` — no model call — so it covers the target/diff/index-preservation assertion of M02 but not a live reviewer's findings on this input. |
| M03 | **passed** (this session) | `ts-branch-divergence` fixture (main advanced with unrelated work after `feature` branched; `feature` left dirty) → `ambicode bundle --json --branch --base main`. Result: `baseSha` was the merge-base commit, not main's tip; `changedFiles` held only `src/feature.ts` (the branch's committed addition); the result's own `target.notes` said "Uncommitted working-tree changes exist and were excluded from this review." `git rev-parse HEAD` and `git status --porcelain` were identical before and after. |
| M04 | **partial pass** (this session) | `ts-source-regression` fixture, with jest actually installed (`npm install --no-save jest@30`) so the check really executes: `ambicode init` auto-detected jest; `ambicode bundle --json` selected the **unchanged** `tests/math.test.js` via jest's related-test mapping and it **failed** (`exitCode: 1`) because the source-only edit to `src/math.js` broke it — the core M04 assertion, observed directly. Separately, the `ts-rename-delete` fixture showed the honest-uncertainty path: with a renamed and a deleted source file, the `unit` check came back `skipped`/`selectionComplete: false` with an explicit limitation ("This is a gap in verification, not a passing check"), never a false "zero impact." **Not exercised**: a scenario that actually surfaces `pendingApprovals` for a broad/uncertain selector and requires `--approve`; the fixtures used did not produce one. That specific sub-case remains pending a fixture/config that does. |
| M05 | **pending** | Needs a connected Jira/Confluence MCP server the tester can access |
| M06 | **pending** (live-GitLab and browser portions); Fastify-injection + real loopback-HTTP portions already recorded in `docs/compatibility.md` | Needs a private GitLab sandbox project and a browser |
| M07 | **pending** | Needs the same GitLab sandbox project, plus publishing credentials |
| M08 | **pending** | ditto |
| M09 | **pending** | ditto |
| M10 | partial: reviewer-isolation and HTML-escaping portions passed (unit + prior loopback-HTTP run); the "real browser" portion is **pending** | Needs a browser |
| M11 | partial: capability/env-allowlist unit evidence passed; live process-boundary observation is **pending** | Needs a live authorized reviewer invocation |
| M12 | **passed (this session)**, packaged-install portion; browser-idle/reopen portion pending | This record's "Disable / uninstall / rollback evidence" section below is the packaged-install version of M12. Local-page idle timeout, reopening a saved result, and disabling/reinstalling through a real browser session are still pending (needs a browser) |
| M13 | not applicable | Phase 2 is on hold; do not start (see below) |
| M14 | **passed (this session)** | Edited `dist/ambicode-0.3.0/policies/common-quality.yaml` directly (adding one rule, no TypeScript touched, no rebuild), reran `ambicode policy --json` from the packaged binary in the `ts-staged-unstaged` fixture, and the new rule's qualified id appeared in the resolved rule list immediately. Reverted the file and reran: the rule disappeared. As a byproduct, a first malformed attempt at the same edit was rejected with four precise field-level diagnostics (`pack-invalid`), which is exactly U03's contract observed live rather than only in a unit fixture. |

## Dependency and license inventory

Reconciled against `package-lock.json` and the bundled artifact in
`docs/compatibility.md`'s "Runtime dependencies" section (both direct
runtime dependencies — `execa`, `isbinaryfile` — and the seven `view`-page
packages — `fastify` and the `@fastify/*` family plus `eta`). All MIT
licensed. `npm audit --omit=dev` reports 0 vulnerabilities as of this
record; re-run it before any real release, since this is a snapshot.

## Remaining limitations and prerequisites

Everything in the "Not available in this environment" table of
`docs/compatibility.md` still applies unchanged: no `glab`, no GitLab
sandbox, no running container runtime, no Jira/Confluence MCP, no
authorized model access used this session, no real browser exercise. This
record adds one more: no second developer has installed this candidate
yet, and no real marketplace hosting exists — both are release-owner
inputs, tracked in `docs/release-checklist.md`.

## Owners still required

See `docs/release-checklist.md` in full. In short: a named release owner
(to host the artifact and fill in the real marketplace source), a named
pilot owner for each of two pilot repositories, a second developer for the
packaged-install acceptance doc 08 requires, and authorized/budgeted model
access for E02 and the value-gate pilot.

## Phase decision

**Phase 1 is not complete.** The functional release gate in doc 08 requires
M01–M12 and M14 on supported environments with TS and Python coverage, and
several of those remain pending exactly as listed above. The value gate is
**pending**, not negative and not inconclusive — it has not been attempted,
because it needs two real pilot repositories and a pilot owner. **Phase 2
remains on hold** pending both gates, per doc 08; nothing in this session's
work started any Phase 2 item.
