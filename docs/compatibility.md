# Version compatibility

What AMBICODE was built and observed against. Every capability claim in
`src/checks/adapters.ts` points here, and each row says how it was established:
**observed** means it was exercised in this environment, **unverified** means the
code is written against documented behaviour that nobody has run here yet.

An unverified row is not a defect, but it is also not evidence. Treat a failure
against one as a report worth filing rather than a surprise.

## Host

| Component | Version | How established |
|---|---|---|
| Claude Code | 2.1.272 | observed (`claude --version`) |
| Node.js | 24.15.0 | observed (`node --version`) — 24 is the minimum; the sources use native type stripping and `node:test`, so no transpiler runs |
| git | 2.55.0 | observed (`git --version`) |
| Python | 3.13.1 | observed (`python3 --version`) |

Git is invoked with `LC_ALL=C` and `LANG=C`. Git is translated, and AMBICODE
matches its own diagnostics against English text; the pinned locale keeps that
true on a localised machine.

## Reviewer isolation

The reviewer runs as a separate `claude` process. These flags were confirmed
present in `claude --help` on 2.1.272:

`--print`, `--safe-mode`, `--restricted`, `--tools`, `--strict-mcp-config`,
`--no-session-persistence`, `--permission-prompts none`, `--output-format json`,
`--json-schema`, `--model`.

A plugin-shipped agent file cannot express this isolation: per the plugin
reference, plugin agents support neither `permissionMode` nor `mcpServers`.
The separate process is therefore the design, not a workaround.

## Check runners

| Runner | Version | Affected-test enumeration | How established |
|---|---|---|---|
| jest | 30.5.2 | `--listTests --findRelatedTests <files>` | observed |
| vitest | 5.0.1 | `list --filesOnly --changed <revision>` only | observed |
| eslint | 9.39.5 | not applicable (lint is file-scoped) | observed |
| ruff | — | not applicable (lint is file-scoped) | unverified; not installed here |
| pytest | 9.0.1 | none; selection comes from a configured mapping | observed |
| playwright | — | none; selection comes from a configured mapping | unverified; not installed here |

### jest

Enumerating from an explicit file list works as documented. Two behaviours were
measured because they decide how deletions are reported:

- `--listTests --findRelatedTests <deleted path>` exits **0 and prints nothing**.
- The same command given the **destination of a rename** also exits 0 and prints
  nothing, so a test that imported the old name is invisible to it.

A vanished path is therefore indistinguishable from "nothing is affected".
`selectByRunner` marks any change carrying a vanished pre-image as an incomplete
selection rather than accepting that silence.

### vitest

On 5.0.1, `vitest list --related` is rejected and `vitest related` has no listing
mode, so the only enumeration available is revision-based. Two consequences are
recorded on every vitest result:

- it reads the repository **working tree**, not the pinned snapshot, so its
  answer can differ from what the review is about;
- a dynamic import with a computed specifier is not followed.

If either matters for a project, configure a `mapping` selector instead.

## Review input limits

`review.maxContextBytes` bounds **everything the reviewer is handed**: the patch
and the files mirrored into the snapshot, counted together. The patch alone is
not the review's context — the mirrored files are read by the reviewer too, and
a two-line edit to three large files carries far more content than its diff.

Two consequences follow, both deliberate:

- Changed files are mirrored regardless of the limit, because a review that
  quietly dropped part of a change would report on half of it. If the changed
  files alone exceed the limit, the review is refused and names the measurement.
- Unchanged sibling files are discretionary context, so they stop at the
  remaining budget instead of pushing the review over it. What was trimmed is
  counted in the result's omissions.

`ambicode bundle` reports the split (`N context byte(s) (P patch + M mirrored)`)
so a refusal can be acted on without guessing which part was large.

Unchanged lockfiles are skipped as sibling context. A lockfile the change
*touches* is still reviewed — that decision is recorded in
`src/snapshot/exclusions.ts` and stands — but an untouched one beside a changed
source file tells a reviewer nothing while being the largest file in the
directory. Measured on the `ts-source-regression` fixture with dependencies
installed: a two-line source edit carried 195,977 context bytes before this
rule and 581 after it.

## Skills

The plugin ships two skills, invoked as `/ambicode:init` and `/ambicode:review`.
Per the plugin reference, a skill's directory name is only a fallback — and an
unstable one for a cached plugin — so each `SKILL.md` sets `name` explicitly.
Claude Code namespaces them under the plugin name, which is why the directories
are `skills/init` and `skills/review` rather than repeating "ambicode" in both
halves of the invocation. Observed with
`claude --plugin-dir . -p "list ambicode skills"` on 2.1.272.

## Reused platform capabilities

Recorded per plan/11. No new runtime dependency was added for these.

| Capability | Component | Evidence |
|---|---|---|
| CLI arguments | Node 24 `util.parseArgs` | Strict mode, positionals, `multiple` for repeatable `--approve`, and `--` handled by the platform. Parsed once in `main` before `createRuntime`, so a rejected argument reaches no process or file (U27). |
| Temporary directories | `FileSystem.temporaryDirectory` | The adapter owns the host location; no domain module calls `tmpdir()`. |

`execa` and `isbinaryfile` are selected in plan/11 but not yet adopted; the
custom process runner's byte accounting is a known defect recorded below.

## Known defects

| Defect | Consequence |
|---|---|
| `NodeProcessRunner` counts UTF-16 code units, not bytes | `maxOutputBytes` under-counts multibyte output: a 10-byte ceiling retained 20 UTF-8 bytes, and a truncation point can split a surrogate pair. Scheduled with the `execa` adoption before the reviewer and `glab` carry output through this runner. |

## Not available in this environment

| Capability | Consequence |
|---|---|
| `glab` | The GitLab provider (P1.5) cannot be verified here. |
| Jira / Confluence MCP | Requirement retrieval (P1.4) cannot be verified here. |
| Authorized model access | The 12 native eval cases and the adjudication rubric exist under `evals/` and load: `claude plugin eval . --scaffold --allow-tools Bash --max-cost-usd 0` reports 2 arms × 12 cases (72 runs) on 2.1.272, which is E01. No arm has been run, so E02 — one authorized smoke case with its trace inspected — is outstanding and no finding has been scored. |

These are recorded as missing, not substituted with estimates.
