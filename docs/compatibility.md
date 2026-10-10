# Version compatibility

What AMBICODE was built and observed against. Every capability claim in
`src/modules/checks/selection/adapters.ts` points here, and each row says how it was established:
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

The reviewer is a plugin subagent, `agents/reviewer.md`, with the tool list
`Read, Grep, Glob`. It has no command-running tool, no MCP tool and no way to
post. AMBICODE spawns no `claude` process, passes no flags and builds no
environment for it.

The subagent runs inside the user's own session, so the boundary is the
tool allowlist in the agent file and nothing stronger: the session's hooks,
settings and managed policy still apply to it. The snapshot it is told to read
is a sanitized copy of the reviewed revision, and the product checkout is not
named in its prompt. What was not established: that a running subagent cannot
read outside the snapshot with `Read`. That is a property of Claude Code's
tool permissions, not something AMBICODE enforces.

The answer is not trusted. Claude pastes the subagent's JSON block into
`review record --task <slug>`, which validates every finding against the pinned
change (path, line, excerpt, cited rules) and records a failed review when the
block is missing or invalid. Fixtures for answer shapes are in
`fixtures/reviewer-envelopes/`.

## Check runners

Affected tests come from a configured `mapping` selector; no runner is asked to list them. Lint is file-scoped.

## Review input limits

`review.maxContextBytes` bounds **everything the model is handed**, measured in
encoded UTF-8 bytes before the reviewer is invoked:

- the composed canonical prompt — the shared contract and reviewer role, the
  scoped policy rules and prompt files, the requirement content, the check evidence and the patch;
- the files mirrored into the snapshot, which the reviewer reads.

The patch alone is not the review's context, and neither is the patch plus the
mirror: a requirement document and the scoped policy are bytes the model sees.
The bundle composes the prompt and applies the limit to `promptBytes +
snapshotBytes` before returning, so the refusal happens before any caller can
reach a reviewer. `ReviewInputs` records `patchBytes`, `requirementBytes`,
`promptBytes`, `snapshotBytes` and `contextBytes`, and a refusal prints each.

Re-measured this session (doc 04 P2.4 correction E, since the prompt is now
composed as separate system/user parts rather than one concatenated string)
on a one-line edit in a fresh minimal TypeScript fixture with the built
artifact: 266 patch bytes, 104 mirrored bytes, **16,969 prompt bytes**
(`system` + `user` combined), 17,073 model-input bytes. A limit that counted
only patch plus mirror (370 bytes) would have under-measured that review by
roughly a factor of 46 — the exact ratio depends on the fixture's canonical
prompt/policy overhead relative to its patch size, so the ratio itself is
illustrative, not a constant; what is invariant is that patch-plus-mirror is
never the actual context size.

Two further consequences follow, both deliberate:

- Changed files are mirrored regardless of the limit, because a review that
  quietly dropped part of a change would report on half of it. If the changed
  files alone exceed the limit, the review is refused and names the measurement.
- Unchanged sibling files are discretionary context, so they stop at the
  remaining budget instead of pushing the review over it. What was trimmed is
  counted in the result's omissions. The budget subtracts an estimate of the
  prompt overhead — canonical prompts, policy, requirements, patch,
  plus a fixed `PROMPT_EVIDENCE_RESERVE_BYTES` reserve for the check and
  omission sections written afterwards — so trimming is decided against what is
  actually left. The exact measurement of the finished prompt still decides.
- A requirement larger than the limit refuses the review before the snapshot is
  planned and before any process runs. Requirements are never trimmed.

`ambicode review` reports the split (`N model-input
byte(s) (P prompt, of which … patch and … requirements, + M mirrored)`) so a
refusal can be acted on without guessing which part was large.

Unchanged lockfiles are skipped as sibling context. A lockfile the change
*touches* is still reviewed — that decision is recorded in
`src/util/path-classes.ts` and stands — but an untouched one beside a changed
source file tells a reviewer nothing while being the largest file in the
directory. Measured on the `ts-source-regression` fixture with dependencies
installed: a two-line source edit carried 195,977 context bytes before this
rule and 581 after it.

## GitLab merge requests

AMBICODE has no GitLab client, and no `glab` or GitHub code. A merge request
reaches a review through the GitLab MCP server connected to the Claude
session: the route asks Claude to call the server's merge-request and diff
tools, and the `PostToolUse` hook on `mcp__.*` records the diff response as
`reviews/mr-diff.patch` and `mr-diff.json` in the task directory
(`src/modules/review/snapshot/mr-capture.ts`). `review --mr` reads that capture
and refuses with `mr-diff-missing` when there is none. Publication is the
`publish` gate followed by a model step that posts through the same MCP
server.

Not verified here: the response shapes of any particular GitLab MCP server
beyond the unit fixtures in `mr-capture.test.ts`, and a live merge request
end to end. The capture accepts a `changes[]` list or a unified-diff string,
and refuses a response it cannot section.

## Skills

The plugin ships six skills, invoked as `/ambicode:init`, `/ambicode:rules`,
`/ambicode:review`, `/ambicode:investigate`, `/ambicode:plan` and
`/ambicode:task`. Per the plugin reference, a skill's directory name is only a
fallback — and an unstable one for a cached plugin — so each `SKILL.md` sets
`name` explicitly. Claude Code namespaces them under the plugin name, which is
why the directories are `skills/init`, `skills/rules`, `skills/review`,
`skills/investigate`, `skills/plan` and `skills/task` rather than repeating
"ambicode" in each half of the invocation.

`/ambicode:rules` (R3) is a setup-time skill: it is invoked when AMBICODE is
adopted and when the team's rules change, never on a task, plan, investigation
or review path.

Re-confirmed on 2.1.272 through the **packaged** candidate rather than
`--plugin-dir`, with no model call, via `npm run smoke:install-local` (doc 04
P2.2 correction A, re-verified this session against the rewritten,
failure-safe `tools/install-local.mjs` of doc 04 P2.3 correction A):
`claude plugin details ambicode@ambicode-team`, against the plugin installed
from the durable local marketplace into an isolated `CLAUDE_CONFIG_DIR`,
reports `Skills (5)  init, investigate, plan, review, task`. The two-skill
observation above is from doc 03 P1.7's acceptance record under
`docs/acceptance/`, before `investigate` (P2.1), `plan` (P2.2) and `task`
(P2.3) existed; the P2.3 acceptance record under `docs/acceptance/` has the
current transcript.

## Hooks

The plugin ships one hook manifest, `hooks/hooks.json`, registering seven
events with fourteen handler entries: `PostToolUse` (matchers `mcp__.*`, `WebFetch`
and `AskUserQuestion`), `PreToolUse` (all routed to
`${CLAUDE_PLUGIN_ROOT}/scripts/guard.mjs`: `Bash` with the `if` rows `git *`,
`glab mr*`, `*.ambicode/task*`, `*ambicode.mjs*` and `rm *`, then `Write|Edit|MultiEdit|NotebookEdit`),
`SessionStart` (matcher `startup|resume|clear|fork`), `UserPromptSubmit`,
`Stop`, `PostCompact` and `SessionEnd`. Every entry except `PreToolUse` runs in
exec form through command `node` with arguments
`${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs`, `hook`. This avoids shell parsing
and works when the plugin path contains spaces or the host has no POSIX shell.
The `Skill` and `Edit|Write` `PostToolUse` entries are no longer registered; the
edit-reminder code stays in the source, unregistered. The count that
`claude plugin details ambicode@ambicode-team` reports for these events was
measured as `Hooks (5)` before `PreToolUse` and `Stop` were registered and has
not been re-measured against this manifest.

`ambicode hook` reads a hook invocation's JSON payload from stdin (fields
confirmed against 2.1.272: `session_id`, `agent_id` (present only for a
subagent invocation, absent for the main agent), `cwd`, `scratchpad_dir`,
`hook_event_name`, `tool_name`, `tool_input.file_path`) and, for a
`PostToolUse` Edit/Write inside a configured repository with an applicable
`remindOnEdit` rule not yet delivered this session epoch, replies with
`{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext":
"…"}}` — the documented contract for surfacing text back into the
conversation from a hook, never a permission decision or a blocking exit
code. `SessionStart` and `PostCompact` reset the per-session delivery epoch so a
reminder can fire again after a context compaction or a fresh session.

A probe on 2026-10-05 (Claude Code 2.1.289, interactive dialog,
`plan/migration-v6-reports/step-03/probe-p2-p48.md`) observed that a
single-select `AskUserQuestion` answer reaches `PostToolUse` as
`tool_response.answers[<question text>]` (also `tool_input.answers`), and that
`additionalContext` returned for it reaches the model in the same turn;
`ambicode hook` relies on both. Not shown: free-text and "Chat about this"
answers, multi-question or multi-select calls, resume between ask and answer,
subagent askers, and any other Claude Code version.

A probe on 2026-10-06 (Claude Code 2.1.289, one `claude -p`, P17) blocked `Stop` once with both
`reason` and `hookSpecificOutput.additionalContext`: the output validated, the reason reached the
model as a "Stop hook feedback" user message, and `additionalContext` as a system reminder. `Stop`
keeps its bounded reason plus `stop-check.md`; the list does not also go to `additionalContext`,
which would only repeat it. Record: `plan/migration-v6-reports/step-07/probe-p17.md`.

One hook contract is relied on without being observed (probe postponed on 2026-10-07; the guard no longer rewrites input with `updatedInput`):

- **The shape of a dismissed AskUserQuestion** (`isRejection` in `src/platform/claude/transcript.ts`). This
  assumes an `is_error` tool_result whose text starts with "The user doesn't want to proceed with this tool
  use." If the shape differs, a dismissed gate is never detected, and the route keeps waiting instead of
  pausing with `exit{human, dismissed}`. Probe: `.tmp/probes/dismissal.mjs`.

Which of them may *carry* the contract is not a free choice. Claude Code's
hook-output schema has a `hookSpecificOutput` variant for only some events,
and `PostCompact` is not among them (verified against 2.1.278: the accepted
names are `PreToolUse`, `UserPromptSubmit`, `UserPromptExpansion`,
`SessionStart`, `Setup`, `PreModelSwitch`, `PostModelSwitch`,
`SubagentStart`, `PostToolUse`, `PostToolBatch`, `PostToolUseFailure`,
`Stop`, `SubagentStop`, `PermissionDenied`, `Notification`,
`PermissionRequest`, `CwdChanged`, `FileChanged`, `MessageDisplay`,
`Elicitation`, `ElicitationResult`, `WorktreeCreate`). Returning one from
`PostCompact` is a hard validation failure the user sees on every compaction,
not a silent no-op. So `PostCompact` resets and returns `{}`, `SessionStart`
resets and delivers, and `UserPromptSubmit` delivers when the current epoch
has not had it yet — which is what puts the contract back after a compaction.
The marker dedup means it is sent once per epoch, not once per prompt, but the
hook process itself does start on every user message (~190ms on the reference
machine). That cost buys the post-compaction redelivery; dropping the
`UserPromptSubmit` registration removes both, leaving only the contract the skills print
as the manual fallback. `ADDITIONAL_CONTEXT_EVENTS` in `src/types/hook.ts`
holds the accepted names so the type system refuses the mistake. `SessionEnd` cleans the session state on the
session's route in the ledger and removes the hook's own dedup-marker directory. All of this is
covered by `src/hook/events/run-hook.test.ts` (unit level, fake ports) and
`tools/hook-artifact.test.mjs` (built-artifact level: real bundled
`scripts/ambicode.mjs hook` invoked with piped stdin, no `claude` process
involved).

## Plugin validation

`claude plugin validate <path> --strict --json` on 2.1.272 returns (observed
this session against the packaged `dist/ambicode-0.3.1` candidate):

```json
{ "success": true, "strict": true,
  "target": "<absolute path>/.claude-plugin/plugin.json",
  "manifest": { "file": "<absolute path>/.claude-plugin/plugin.json",
                "type": "plugin", "errors": [], "warnings": [], "notes": [] },
  "contents": [] }
```

`npm run verify` runs this (non-`--json`, for a readable pass/fail) against
the source tree, and this session additionally ran it directly against the
**packaged** candidate directory (`dist/ambicode-0.3.1`), confirming the
zipped, allowlist-filtered artifact — not only the source checkout — passes
strict validation on its own. `claude plugin list --json` returns an array
of `{ id, version, scope, enabled, installPath, installedAt, lastUpdated,
projectPath?, mcpServers }`; `verifyPostcondition` in `tools/install-local.mjs`
(doc 04 P2.4 correction D) reads exactly this shape rather than a native
command's exit code to decide whether an install actually took effect.

## Packaging and marketplace

Established this session, against Claude Code 2.1.272's own documented
schema (fetched fresh; not recalled from an earlier version):

| Component | Version | How established |
|---|---|---|
| `fflate` | 0.8.3 | pure-JavaScript deterministic ZIP generation in `tools/package-candidate.mjs`; replaces the unavailable-on-Windows OS `zip` dependency |
| Marketplace source types | `local path`, `github`, `url`, `git-subdir`, `npm`, `archive` (sha256-pinned), `command` | current schema, fetched from `code.claude.com/docs/en/plugin-marketplaces` this session |
| `CLAUDE_CONFIG_DIR` | isolates settings, session history and plugin state | observed directly: a fresh directory received its own `.claude.json` and an empty marketplace list, independent of the real `~/.claude` |
| `claude plugin install/enable/disable/uninstall/update/list/details/validate` | all exercised | observed, against a local candidate marketplace, in an isolated config directory; see `docs/installation.md` |

`scripts/ambicode.mjs` is gitignored and therefore absent from an ordinary
git tag of this repository. `tools/package-candidate.mjs` always rebuilds it and
ships it in the local candidate. The ZIP is a reproducibility artifact; local
installation uses the candidate directory. See `docs/installation.md`.

The installer defaults to `$CLAUDE_CONFIG_DIR` when set, otherwise the
platform home's `.claude` directory. A custom `--config-dir` is explicit and
isolated; ordinary `claude plugin list` cannot see it unless invoked with the
same `CLAUDE_CONFIG_DIR`. CLI execution uses Execa's cross-platform binary
resolution, state replacement is atomic, and normalized native failures count
as rollback failures. These paths are unit- and macOS-smoke-tested; a real
Windows-host lifecycle remains a release acceptance item.

One qualification on "Execa's cross-platform binary resolution", established
by measurement in R1: on Windows, when Execa cannot resolve a command to a
`.exe`/`.com` it does not report a failure — it hands the command line to
`cmd.exe /d /s /c`, which starts successfully, writes "is not recognized as an
internal or external command" to stderr and exits **1**. A command that is not
installed is therefore indistinguishable, from Execa's result alone, from a
linter that ran and found problems. Because `ProcessOutcome.kind` is what D06
uses to turn a missing command into a notice and a skipped result rather than
a reported failure, `NodeProcessRunner` resolves the executable itself before
spawning on Windows (`windowsCommandExists`). Unix is unaffected: there the OS
resolves the command and Execa surfaces the real `ENOENT`/`EACCES`.

## Code search

`ambicode map` ranks candidate files for a request from path shape and
`git grep` contents, and lists exported names declared in the top files.
`ambicode refs` lists the lines using each whole word, and with
`--declarations` where each is declared. Both start no process other than `git`
through the existing adapter and store nothing between calls, so they add no
compatibility surface of their own. AMBICODE bundles no language server and
builds no index.

None of this reads a language. Files come from `git ls-files`, contents from
`git grep -i -F`, and paths from globs, so a repository in any language is
ranked by the same rules under whatever directory layout it uses.

## Reused platform capabilities

Recorded per plan/11. No new runtime dependency was added for these.

| Capability | Component | Evidence |
|---|---|---|
| CLI arguments | Node 24 `util.parseArgs` | Strict mode, positionals, `multiple` for repeatable `--approve`, `--decline` and `--requirement`, and `--` handled by the platform. Parsed once in `main` before `createRuntime`, so a rejected argument reaches no process or file (U27). Combination rules (`--branch` versus `--mr`, `--base` only with `--branch`) are applied in `main` immediately after parsing and still before `createRuntime`. Only commands that declare `positionals` (`route`, `check`, `format`, `policy check`) accept an operand; every other command rejects one. |
| Temporary directories | `FileSystem.temporaryDirectory` | The adapter owns the host location; no domain module calls `tmpdir()`. |
| Process execution | `execa` behind `ProcessRunner` | See the dependency record below. |
| Binary content | `isbinaryfile` on bytes | See the dependency record below. |

## Runtime dependencies

The plugin has no runtime `dependencies` in `package.json`. `yaml` and `zod`
are dev dependencies that esbuild bundles into `scripts/ambicode.mjs` and
`scripts/guard.mjs`. Processes are spawned with `node:child_process` behind
`ProcessRunner`; binary content is classified in `src/platform/ports/binary.ts`
without a package.

### Build-only dependency

| Package | Pinned | License | Upstream | Used by | Why not Node alone |
|---|---|---|---|---|---|
| `fflate` | ^0.8.3 (0.8.3) | MIT | 101arrowz/fflate | `tools/package-candidate.mjs` | Node 24 has no ZIP writer. The previous `/usr/bin/zip` call made candidate construction fail on Windows. `zipSync` receives sorted paths, fixed timestamps and explicit modes, and `package:reproducible` compares two archive digests. It is not shipped in the plugin bundle. |

`maxOutputBytes` is one combined retained-byte ceiling across stdout and stderr.
Chunks are retained in arrival order, cut on a byte boundary, and decoded once
at the end: a multibyte character split across two chunks survives, and one
split by the ceiling is dropped rather than turned into U+FFFD.

## Source files stay text

A literal control byte in a TypeScript source — a NUL above all — makes git
treat the file as binary, and `git diff` then stops showing it. `src/modules/review/findings/validate.ts` had one (a NUL used as a hash-seed separator) and now uses the
escaped source literal `'\0'`.

Two unit tests keep it that way: one scans every `src/**/*.ts` for control bytes
other than tab, newline and carriage return, and one asserts that `git diff
--numstat` reports real line counts for `src/modules/review/findings/validate.ts` rather than the
`-\t-` it prints for a binary path. The tree-wide scan exists because the defect
is invisible in an editor and easy to reintroduce anywhere.

Measured on the fixed file and on its predecessor:

```
$ git diff --numstat --no-index -- /dev/null src/modules/review/findings/validate.ts
210     0       /dev/null => src/modules/review/findings/validate.ts      # text

$ git show <previous>:src/modules/review/findings/validate.ts > old.ts
$ git diff --numstat --no-index -- /dev/null old.ts
-       -       /dev/null => old.ts                      # binary
```

**One transitional caveat.** Git calls a *pair* binary when either side is, so
while the previous revision is still the other side, `git diff` on this change
prints `Binary files … differ` for that path. Read it with `git diff --text`
once; every diff after this revision is ordinary text.

## Known defects

None recorded.

## Not available in this environment

| Capability | Consequence |
|---|---|
| A GitLab MCP server and a sandbox project | Merge-request capture and posting are covered by unit fixtures only. Prerequisite: a private test GitLab project with a merge request carrying added, renamed and deleted lines, and an authorized MCP server. |
| Jira / Confluence MCP | Live requirement retrieval cannot be verified here. The normalization, provenance, failure and contradiction behaviour is unit-tested against fake evidence; that is not a live-MCP test and is not reported as one. |
| Authorized model access | The native eval cases and the adjudication rubric exist under `evals/` and load. No arm has been run in this environment, so no finding has been scored. |
| A live reviewer subagent | `review record` is exercised against pasted answers (unit tests, fixtures), which proves validation, not model output quality. |

These are recorded as missing, not substituted with estimates.
