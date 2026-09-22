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
| glab | — | **not installed here.** The GitLab adapter is covered by fake `ProcessRunner` responses only (U18); no live call has been made. |
| Docker CLI | 28.0.4 | observed (`docker --version`). The daemon was **not running**, so no container was created: remote executable checks are fake-covered only. |

Git is invoked with `LC_ALL=C` and `LANG=C`. Git is translated, and AMBICODE
matches its own diagnostics against English text; the pinned locale keeps that
true on a localised machine.

## Reviewer isolation

The reviewer runs as a separate `claude` process. These flags were confirmed
present in `claude --help` on 2.1.272:

`--print`, `--safe-mode`, `--restricted`, `--tools`, `--disallowedTools`,
`--mcp-config`, `--strict-mcp-config`, `--no-session-persistence`,
`--permission-prompts none`, `--output-format json`, `--json-schema`, `--model`,
`--append-system-prompt-file` (verified working on 2.1.278; `--help` prints
the inline `--append-system-prompt` but spells the file variant only inside
the `--bare` description, as `--append-system-prompt[-file]`, so
`assertIsolationAvailable` accepts either spelling).

The file variant is a requirement, not a preference. On Windows `claude`
resolves to `claude.cmd`, which cannot be spawned directly: it goes through
`cmd.exe`, and `cmd.exe` reads CR and LF as command separators with no escape
available. An argument holding the multi-line operating contract is therefore
refused outright — correctly, since allowing it would be a command-injection
vector and the contract is composed from project-controlled policy packs.
Passing it as a path keeps every newline out of the argument vector, so the
same code path runs on Linux, macOS and Windows. Before this, every review on
Windows failed at spawn with "the command and its arguments cannot contain a
line break on Windows without a shell".

`ClaudeReviewer.assertIsolationAvailable` re-checks that list against the
installed CLI before every review and refuses with
`reviewer-isolation-unavailable` when one is gone. AMBICODE does not run a
reviewer with less isolation than its result claims.

### The reviewer's environment

The reviewer process receives a **replacement** environment, not the
developer's. `ProcessRequest.env` is a required, explicit
`EnvironmentPolicy`: `inherited` (git, project checks, `glab`, the container
CLI) or `replacement` (the reviewer). There is no default, so a new call site
cannot acquire the operator's whole environment by saying nothing.

The reviewer's allowlist is in `REVIEWER_ENV_ALLOWLIST`: `PATH`, `HOME`,
`TMPDIR`, `LANG`, `LC_ALL`, `TERM`, the `XDG_*` locations, TLS trust
(`NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`), proxy settings, and
model authentication only (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
`ANTHROPIC_BASE_URL`, `CLAUDE_CODE_OAUTH_TOKEN`). `HOME` and the XDG locations
stay because subscription/keychain authentication — the supported
configuration here — reads them.

Everything else is absent from the child process rather than merely unused:
`GITLAB_TOKEN`, `GLAB_TOKEN`, GitHub, Jira, package-registry, database and
cloud-workload variables. A unit test puts sentinel values in all of those and
asserts that no sentinel string appears anywhere in the resolved environment,
while `PATH`, `HOME` and `ANTHROPIC_API_KEY` do.

**Known limitation.** Claude Code authenticated through Bedrock or Vertex needs
`AWS_*` / `ANTHROPIC_VERTEX_*` credentials, which are cloud workload secrets and
are deliberately not carried. That configuration is unsupported for the reviewer
in v1; the supported configuration is subscription/keychain or an
`ANTHROPIC_*` key.

### Structured output and its retries

`claude --print --output-format json --json-schema <schema>` returns the
schema-constrained answer in **`structured_output`**, not in `result`.
`result` holds the model's closing prose, which is not the answer when a schema
is in force. The success envelope is:

```json
{ "type": "result", "subtype": "success", "is_error": false,
  "result": "…prose…", "structured_output": { "findings": [], "coverageNotes": [] } }
```

`parseReviewerOutput` reads `structured_output` when it is present and does not
consult `result` at all in that case, so a chatty closing sentence cannot be
mistaken for a malformed answer and prose cannot rescue a schema failure. An
envelope with neither field is `no-structured-output`, which is distinct from a
present-but-invalid one (`schema`), from a truncated capture (`truncated`), and
from an error envelope. Fixtures for each shape are in
`fixtures/reviewer-envelopes/`.

Failure envelopes carry `is_error: true` with a subtype; the structured-output
one is `error_max_structured_output_retries`, with
`terminal_reason: "structured_output_retry_exhausted"`.

Claude Code retries a StructuredOutput call that fails schema validation, up to
the integer environment variable `MAX_STRUCTURED_OUTPUT_RETRIES`, **default 5**,
and those retries do not appear in the result envelope. AMBICODE sets the
variable to `3` in the reviewer's replacement environment rather than
inheriting the default, and an exhausted budget becomes a review error
(`structured-output-exhausted`), never a clean review with no findings.

It was `1` until a live run proved that wrong. Doc 02 forbids an automatic
model-repair loop, and `1` was read as the way to honour that — but a
StructuredOutput retry re-asks the model to serialize the answer it already
has; it does not revise a finding. The rule doc 02 states is enforced by the
Zod validation in `parseReviewerOutput`, independently of this variable. What
`1` did cause was a whole review discarded on a single mis-serialization.

How this was established: the field names, the error subtype, the variable name
and its default were read out of the shipped `claude` 2.1.272 binary's embedded
sources (`structured_output`, `error_max_structured_output_retries`,
`MAX_STRUCTURED_OUTPUT_RETRIES`, default `5`), and the envelope shapes were
exercised end to end through the built artifact against a stub `claude` on
`PATH`. That first pass made **no authorized model call**, so the live
behaviour of the retry cap went unverified — and that is precisely where it
was wrong. It has since been exercised against the real CLI on 2.1.278: a
schema-constrained run returning `structured_output` with the declared
`$defs`/`$ref` resolved, and a real merge-request review failing with
`structured_output_retry_exhausted` after eighteen turns under the cap of one.

The argument vector, as observed being handed to the process:

```
--print --safe-mode --restricted --strict-mcp-config --mcp-config {"mcpServers":{}}
--tools Read,Grep,Glob
--disallowedTools Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,Agent
--permission-prompts none --no-session-persistence --model <model>
--append-system-prompt-file <path to a file holding the system prompt>
--output-format json --json-schema <schema>
```

The user prompt (diff, requirements, discussion, check evidence) still goes
over stdin, not in the argument vector: it is large and holds option-like
text. The *system* prompt (only the shared operating contract and the
reviewer role, never product code, requirement text, or discussion) is passed
through `--append-system-prompt-file` instead (P2.4 correction E), so a hostile
string planted in reviewed code or a fetched requirement cannot land in the
model's system-level instructions no matter how it is phrased — it can only
ever reach the user turn, the same place the diff itself lives. The working
directory is the sanitized snapshot; there is no `--add-dir`, so the product
checkout is unreachable, and no provider credential is passed.

A plugin-shipped agent file cannot express this isolation: per the plugin
reference, plugin agents support neither `permissionMode` nor `mcpServers`.
The separate process is therefore the design, not a workaround.

The effective tool list and file boundary inside a live process are M10/M11,
which are manual and still outstanding. What is recorded here is the argument
vector and the capability probe, not a proof about a running reviewer. Managed
policy can still impose behaviour that neither shows.

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

`review.maxContextBytes` bounds **everything the model is handed**, measured in
encoded UTF-8 bytes before the reviewer process is started:

- the composed canonical prompt — the shared contract and reviewer role, the
  scoped policy rules and prompt files, the requirement content, prior merge
  request discussion, the check evidence and the patch;
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
  prompt overhead — canonical prompts, policy, requirements, discussion, patch,
  plus a fixed `PROMPT_EVIDENCE_RESERVE_BYTES` reserve for the check and
  omission sections written afterwards — so trimming is decided against what is
  actually left. The exact measurement of the finished prompt still decides.
- A requirement larger than the limit refuses the review before the snapshot is
  planned and before any process runs. Requirements are never trimmed.

`ambicode bundle` and `ambicode review` report the split (`N model-input
byte(s) (P prompt, of which … patch and … requirements, + M mirrored)`) so a
refusal can be acted on without guessing which part was large.

Unchanged lockfiles are skipped as sibling context. A lockfile the change
*touches* is still reviewed — that decision is recorded in
`src/snapshot/exclusions.ts` and stands — but an untouched one beside a changed
source file tells a reviewer nothing while being the largest file in the
directory. Measured on the `ts-source-regression` fixture with dependencies
installed: a two-line source edit carried 195,977 context bytes before this
rule and 581 after it.

## GitLab provider

All GitLab communication is `glab api` through the shared `ProcessRunner`. There
is no GitLab SDK, no HTTP client, no shell pipeline, and nothing that parses
`glab mr view` or any other human-formatted output.

| Behaviour | How it is established | Evidence |
|---|---|---|
| MR URL parsing: self-hosted host, explicit port, nested and percent-encoded namespaces, view suffixes; refusal of credentials, non-MR paths, bad iids, ambiguous trailing paths | pure function, no process | fake (U18) |
| `--hostname` on every request; project identity percent-encoded as one component | argument-vector assertion | fake (U18) |
| Pinning: provider, host, target and source project, iid, web URL, version id, base/start/head SHAs from the selected diff version | fake `glab` responses | fake (U18) |
| Fork merge requests: post-image blobs read from the source project at the pinned head | argument-vector assertion on `projects/<sourceId>/repository/files/…?ref=<headSha>` | fake (U18) |
| Pagination: several pages, short final page, empty final page, malformed page, later-page failure, capped listing | fake `glab` responses | fake (U18) |
| Truncated process output rejected before JSON parsing | fake outcome with `truncated: true` | fake (U18) |
| Diff positions: added → `new_line`, removed → `old_line`, context → both, always with the pinned base/start/head; unmappable locations refused | unit | fake (U18) |
| Omissions for `too_large`, `collapsed`, empty diff bodies, inaccessible fork content, capped discussions | fake `glab` responses | fake (U18) |
| No checkout, branch, index or fetch during a remote review | real temporary git repository with staged and unstaged edits, compared before and after | observed |
| No publication call during review or bundle | recording fake provider | fake |

**Unverified against a live GitLab.** `glab` is not installed here, so no
assumption about `glab api`'s own flags (`--hostname`, `--method`, `--input`)
or about GitLab's field names has been confirmed against a running server. That
is M06's job. The adapter fails loudly rather than guessing: a response that
does not validate against its schema is a diagnostic, never a partial result.

Authentication is glab's own, per host. AMBICODE stores no GitLab credential,
puts none in an argument vector, and passes none to the reviewer.

## GitHub

Registered under the same interface, returning a typed `unsupported` result for
all five operations. Verified by unit test to make zero process calls, to claim
`github.com` URLs so it answers rather than the GitLab adapter, and to leave
local working and branch review untouched. There is no Octokit dependency and no
import of the GitLab adapter from the GitHub module.

## Remote executable checks

Merge request code never executes in the developer checkout. Configuration is
`remoteChecks.image`, which must be pinned by digest (`name@sha256:<64 hex>`).

Sequence, all through the shared `ProcessRunner`, all argument vectors with no
shell: `docker image inspect` (availability; never `pull` or `build`) →
`docker create` → `docker cp <snapshot>/. <id>:/ambicode/work` → `docker start
--attach` → `docker diff` (mutations) → `docker rm --force --volumes`.

Isolation flags asserted by unit test on the `create` vector: `--network none`,
`--user 65534:65534`, `--cap-drop ALL`, `--security-opt no-new-privileges`,
`--pids-limit`, `--memory`, `--cpus`, a bounded run timeout, no `-v`/`--volume`/
`--mount` of any kind, no docker socket, no path under `$HOME`, no
`--privileged`. The snapshot is **copied** into container-local writable storage
rather than mounted, so there is no writable source mount at all. Mutations
inside that workspace are reported as limitations and destroyed with the
container.

Skip reasons, each producing skipped check results and no local execution:
`image: null`; an image not pinned by digest; the container runtime not
startable; `docker image inspect` timing out; the image absent locally.

Selection for a merge request uses only pure-glob selectors (lint `include`,
`mapping`). A `related` or `command` selector is skipped with that reason,
because deciding what to run would execute project code.

**Unverified against a live runtime.** The Docker CLI is present (28.0.4) but
its daemon was not running here, so no container has been created, copied into
or destroyed. Every row above is fake-`ProcessRunner` evidence. M06/M10 cover
the live behaviour.

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
failure-safe `install-local.mjs` of doc 04 P2.3 correction A):
`claude plugin details ambicode@ambicode-team`, against the plugin installed
from the durable local marketplace into an isolated `CLAUDE_CONFIG_DIR`,
reports `Skills (5)  init, investigate, plan, review, task`. The two-skill
observation above is from doc 03 P1.7's acceptance record under
`docs/acceptance/`, before `investigate` (P2.1), `plan` (P2.2) and `task`
(P2.3) existed; the P2.3 acceptance record under `docs/acceptance/` has the
current transcript.

## Hooks

The plugin ships one hook manifest, `hooks/hooks.json` (doc 04 P2.4
correction G), registering five events — `PostToolUse` (matcher
`Edit|Write`), `SessionStart` (matcher `startup|resume|clear|fork`),
`UserPromptSubmit`, `PostCompact`, and `SessionEnd` — each routed in exec form through command
`node` with arguments `${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs`, `hook`.
This avoids shell parsing and works when the plugin path contains spaces or
the host has no POSIX shell. Re-confirmed this session through the same
packaged-candidate/`npm run smoke:install-local` path as "Skills" above:
`claude plugin details ambicode@ambicode-team` reports `Hooks (5)
PostToolUse, SessionStart, UserPromptSubmit, PostCompact, SessionEnd
(harness-only — no model context cost)`.

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
`UserPromptSubmit` registration removes both, leaving `prepare --with-contract`
as the manual fallback. `ADDITIONAL_CONTEXT_EVENTS` in `src/contracts/hook.ts`
holds the accepted names so the type system refuses the mistake. `SessionEnd` removes the
hook's own dedup-marker directory. All of this is
covered by `src/hook/run-hook.test.ts` (unit level, fake ports) and
`hook-artifact.test.mjs` (built-artifact level: real bundled
`scripts/ambicode.mjs hook` invoked with piped stdin, no `claude` process
involved).

## Plugin validation

`claude plugin validate <path> --strict --json` on 2.1.272 returns (observed
this session against the packaged `dist/ambicode-0.1.1` candidate):

```json
{ "success": true, "strict": true,
  "target": "<absolute path>/.claude-plugin/plugin.json",
  "manifest": { "file": "<absolute path>/.claude-plugin/plugin.json",
                "type": "plugin", "errors": [], "warnings": [], "notes": [] },
  "contents": [] }
```

`npm run verify` runs this (non-`--json`, for a readable pass/fail) against
the source tree, and this session additionally ran it directly against the
**packaged** candidate directory (`dist/ambicode-0.1.1`), confirming the
zipped, allowlist-filtered artifact — not only the source checkout — passes
strict validation on its own. `claude plugin list --json` returns an array
of `{ id, version, scope, enabled, installPath, installedAt, lastUpdated,
projectPath?, mcpServers }`; `verifyPostcondition` in `install-local.mjs`
(doc 04 P2.4 correction D) reads exactly this shape rather than a native
command's exit code to decide whether an install actually took effect.

## Packaging and marketplace

Established this session, against Claude Code 2.1.272's own documented
schema (fetched fresh; not recalled from an earlier version):

| Component | Version | How established |
|---|---|---|
| `fflate` | 0.8.3 | pure-JavaScript deterministic ZIP generation in `package-candidate.mjs`; replaces the unavailable-on-Windows OS `zip` dependency |
| Marketplace source types | `local path`, `github`, `url`, `git-subdir`, `npm`, `archive` (sha256-pinned), `command` | current schema, fetched from `code.claude.com/docs/en/plugin-marketplaces` this session |
| `CLAUDE_CONFIG_DIR` | isolates settings, session history and plugin state | observed directly: a fresh directory received its own `.claude.json` and an empty marketplace list, independent of the real `~/.claude` |
| `claude plugin install/enable/disable/uninstall/update/list/details/validate` | all exercised | observed, against a local candidate marketplace, in an isolated config directory; see `docs/installation.md` |

`scripts/ambicode.mjs` is gitignored and therefore absent from an ordinary
git tag of this repository. `package-candidate.mjs` always rebuilds it and
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

## Code intelligence

AMBICODE reuses the official `typescript-lsp@claude-plugins-official` and
`pyright-lsp@claude-plugins-official` plugins. It does not bundle a language
server or build another index. One registry in
`src/code-intelligence/navigation.ts` maps the existing ecosystem enum to the
plugin, server command and setup commands. `init`, `config`, and `prepare`
surface that guidance. Authoring skills record actual LSP symbol operations or
a specific targeted-search fallback reason because the helper cannot inspect
the active conversation's tool inventory.

The step before LSP is `ambicode locate`: a ranked shortlist of candidate
files for a request, from path shape, `git grep` contents and co-change over a
bounded commit window. It runs no language server, starts no process other
than `git` through the existing adapter, and stores nothing between calls, so
it adds no compatibility surface of its own. LSP is still how a caller goes
from a candidate file to its definitions, references and callers.

Observed from the current official marketplace: TypeScript uses
`typescript-language-server --stdio`; Python uses `pyright-langserver --stdio`.
No LSP plugin was active in this acceptance session, so product-project symbol
navigation remains unobserved here.

## Reused platform capabilities

Recorded per plan/11. No new runtime dependency was added for these.

| Capability | Component | Evidence |
|---|---|---|
| CLI arguments | Node 24 `util.parseArgs` | Strict mode, positionals, `multiple` for repeatable `--approve` and `--requirement`, and `--` handled by the platform. Parsed once in `main` before `createRuntime`, so a rejected argument reaches no process or file (U27). Combination rules (`--branch` versus `--mr`, `--base` only with `--branch`) are applied in `main` immediately after parsing and still before `createRuntime`. Only `policy` declares `positionals`; every other command rejects an operand. |
| Temporary directories | `FileSystem.temporaryDirectory` | The adapter owns the host location; no domain module calls `tmpdir()`. |
| Process execution | `execa` behind `ProcessRunner` | See the dependency record below. |
| Binary content | `isbinaryfile` on bytes | See the dependency record below. |

## Runtime dependencies

Recorded per plan/11, "Dependency review evidence".

| Package | Pinned | License | Upstream | Used by | Why not Node alone |
|---|---|---|---|---|---|
| `execa` | ^10.0.1 (10.0.1) | MIT | sindresorhus/execa | `src/ports/node-process-runner.ts` | Timeout with forceful descendant cleanup, `extendEnv: false`, normalized failure reporting, and a stable distinction between a spawn failure and a nonzero exit. The handwritten `child_process` version conflated them and counted output in UTF-16 code units. |
| `isbinaryfile` | ^6.0.0 (6.0.0) | MIT | gjtorikian/isBinaryFile | `src/snapshot/exclusions.ts` | Content classification on bytes. The previous NUL-only check ran after decoding, which plan/11 rules out as the final decision. The extension list remains, as an early optimization only. |

Both are MIT, bundled into `scripts/ambicode.mjs` by esbuild, and exercised
through the built artifact (the smoke run below), not only through
`node --test`. `npm audit --omit=dev` reports 0 vulnerabilities; that is
supporting evidence, not a release decision on its own.

### Build-only dependency

| Package | Pinned | License | Upstream | Used by | Why not Node alone |
|---|---|---|---|---|---|
| `fflate` | ^0.8.3 (0.8.3) | MIT | 101arrowz/fflate | `package-candidate.mjs` | Node 24 has no ZIP writer. The previous `/usr/bin/zip` call made candidate construction fail on Windows. `zipSync` receives sorted paths, fixed timestamps and explicit modes, and `package:reproducible` compares two archive digests. It is not shipped in the plugin bundle. |

### The `view` page's server stack

| Package | Pinned | License | Upstream | Used by | Why not Node alone |
|---|---|---|---|---|---|
| `fastify` | ^5.12.5 | MIT | fastify/fastify | `src/page/server.ts` | Routing, request/reply lifecycle, `.inject()` for socket-free testing, and the plugin points every other row here hangs off. A handwritten `http.createServer` would need to reimplement all of that to get the same test surface. |
| `@fastify/formbody` | ^8.0.2 | MIT | fastify/fastify-formbody | `src/page/server.ts` | Parses `application/x-www-form-urlencoded`, including repeated field names as arrays — used to detect a duplicate submission of the same field as an attack rather than silently taking the last value. |
| `@fastify/cookie` | ^11.1.2 | MIT | fastify/fastify-cookie | `src/page/server.ts` | Signs and verifies the session cookie. AMBICODE never invents its own cookie signing. |
| `@fastify/csrf-protection` | ^7.1.0 | MIT | fastify/csrf-protection | `src/page/server.ts` | A per-render token plus a cookie-held secret, checked on every state-changing request. AMBICODE supplies no CSRF algorithm of its own. |
| `@fastify/helmet` | ^13.1.1 | MIT | fastify/fastify-helmet | `src/page/server.ts` | The full security-header set (CSP, `Referrer-Policy`, `X-Content-Type-Options`, frame protection) from one audited source rather than a hand-assembled header list that silently drifts from best practice. |
| `@fastify/view` | ^11.1.1 | MIT | fastify/point-of-view | `src/page/server.ts` | Wires a template engine to `reply.view()` so a route hands the engine data, never a hand-built HTML string. |
| `eta` | ^3.5.0 | MIT | eta-dev/eta | `templates/*.eta` | Escaped interpolation by default (`<%= %>`). AMBICODE writes no HTML-escaping function of its own; every hostile string in a review — a finding's text, a requirement title, an existing GitLab note — passes through Eta's escaping, not a bespoke one. |

None of the seven has a transitive dependency outside the Fastify/`@fastify/*`
family and `eta` itself; `npm audit` (below) covers the whole tree, not just
these packages directly. All are bundled into `scripts/ambicode.mjs` by esbuild
as ESM, and the bundle was run — not just unit-tested — end to end: see
"The `view` page, exercised through the built artifact" below. A major-version
bump to any of the seven is a deliberate upgrade, re-run through the same
built-artifact smoke test before it ships, not an automatic `^` float in
practice even though the ranges allow patch/minor movement.

`npm audit` on the full current lockfile reports **0 vulnerabilities** as of
this writing. That is a snapshot,
not a standing guarantee; a reachability assessment still matters more than the
count — every one of the seven packages above is reachable only from
`src/page/server.ts` and `templates/*.eta`, which run only when `ambicode view`
is invoked, never during `review` or `bundle`.

### The `view` page, exercised through the built artifact

Beyond `node --test` (which uses Fastify's `.inject()` and a fake GitLab
provider — U20 through U24), the built `scripts/ambicode.mjs` was run as a real
process, listening on a real loopback socket, against a real filesystem-based
review directory:

- `ambicode view --review <id> --no-open` printed a well-formed capability URL,
  correctly explained why the browser was not opened, and correctly enumerated
  and left alone several dozen pre-existing unmarked `ambicode-snapshot-*`
  temporary directories from earlier runs (no valid ownership marker, so none
  were removed) — the cleanup-safety behaviour observed live, not only against
  a synthetic fixture.
- A `curl` GET to the printed URL returned `303`, the full expected CSP and
  Helmet header set, a `Set-Cookie` with `HttpOnly; SameSite=Strict; Path=/`
  and a bounded `Max-Age` and correctly **no** `Secure` flag (loopback plain
  HTTP), and `no-store, no-cache, must-revalidate, private` caching headers.
- A second `curl` GET to the same capability-bearing URL returned `403`: the
  one-time capability cannot be replayed.
- An authenticated `curl` GET carrying the session cookie rendered the review
  page: the review id, three finding cards, a `select_<finding-id>` checkbox
  for each finding with a saved position, no checkbox for the one without a
  position, and hidden `_csrf`/`submissionId` fields.
- A `curl` POST to `/publish` with the extracted CSRF token, the session and
  CSRF cookies, a matching `Origin` header, one selected finding and an edited
  comment body returned `303` (POST/Redirect/GET). The redirected page showed
  that finding as `failed-before-send`, with the message "The account AMBICODE
  would publish as could not be established (glab could not be started:
  ... spawn glab ENOENT.)" — `glab` is not installed in this environment, and
  the bundled artifact handled that absence as a graceful, typed outcome, not a
  crash. The unselected findings correctly showed `not-selected`, and the
  submitted draft text was preserved on redisplay.

This is the "built-artifact server smoke test using loopback HTTP" and the
Fastify/Eta ESM bundling check plan/11 requires; it is evidence that the seven
packages above bundle and run correctly together, not evidence about a live
GitLab account (see "Not available in this environment" below for that gap).

`maxOutputBytes` is one combined retained-byte ceiling across stdout and stderr.
Chunks are retained in arrival order, cut on a byte boundary, and decoded once
at the end: a multibyte character split across two chunks survives, and one
split by the ceiling is dropped rather than turned into U+FFFD. U29 covers all
of that, plus exit, timeout, spawn failure and truncation staying distinct.

## Source files stay text

A literal control byte in a TypeScript source — a NUL above all — makes git
treat the file as binary, and `git diff` then stops showing it. `src/review/
validate.ts` had one (a NUL used as a hash-seed separator) and now uses the
escaped source literal `'\0'`.

Two unit tests keep it that way: one scans every `src/**/*.ts` for control bytes
other than tab, newline and carriage return, and one asserts that `git diff
--numstat` reports real line counts for `src/review/validate.ts` rather than the
`-\t-` it prints for a binary path. The tree-wide scan exists because the defect
is invisible in an editor and easy to reintroduce anywhere.

Measured on the fixed file and on its predecessor:

```
$ git diff --numstat --no-index -- /dev/null src/review/validate.ts
210     0       /dev/null => src/review/validate.ts      # text

$ git show <previous>:src/review/validate.ts > old.ts
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
| `glab` | The GitLab provider's live behaviour (M06) cannot be verified here. Its adapter is fully covered by fake `ProcessRunner` responses (U18), which is not the same claim. |
| A GitLab sandbox project | M05–M09 are pending: fetching a real merge request, publishing selected comments through a real browser session, reconciling a retry, and the stale-head case. Prerequisite: a private test GitLab project with a merge request carrying added, renamed and deleted lines, and an account authorized to comment on it. |
| A running container runtime | M06's executable-check portion and M10's isolation portion are pending. The Docker CLI is installed (28.0.4) but its daemon was not running, and no digest-pinned image is configured. Prerequisite: a running daemon plus a user-configured image pinned by digest. |
| Jira / Confluence MCP | Live requirement retrieval (M05) cannot be verified here. The normalization, provenance, failure and contradiction behaviour is unit-tested against fake evidence (U16); that is not a live-MCP test and is not reported as one. |
| Authorized model access | The 12 native eval cases and the adjudication rubric exist under `evals/` and load: `claude plugin eval . --scaffold --allow-tools Bash --max-cost-usd 0` reports 2 arms × 12 cases (72 runs) on 2.1.272, and a deliberately malformed case is refused with its field errors. That is E01. No arm has been run, so E02 — one authorized smoke case with its trace inspected — is outstanding and no finding has been scored. |
| A live reviewer call | `ambicode review` was exercised end to end through the built artifact against a **stub** `claude` on `PATH` that answers with a fixed envelope and makes no model call. That proves the process wiring, the argument vector, the stdin prompt, the snapshot working directory, and the validation of a fabricated location. It is not evidence about model output quality. |
| A real browser | M06 (reading the page's layout as rendered by a browser, not `curl`), M07 (editing two comments, selecting one, submitting), M08 (a repeated submission and an interrupted-then-reconciled one), M09 (submitting after the merge request's head has moved), M10 (hostile text and malformed local requests through a real browser) and M12 (idle expiry, reopening, and disabling/reinstalling the plugin) are pending. The page's behaviour for all of these is covered by Fastify-injection tests (U20–U24) against a fake GitLab provider, and the bootstrap/replay/authenticated-GET/publish-POST sequence was additionally run against the real built artifact over loopback HTTP (see "The `view` page, exercised through the built artifact" above) — neither substitutes for a person clicking through a real browser against a real merge request, which needs the GitLab sandbox row above plus a browser. |

These are recorded as missing, not substituted with estimates.
