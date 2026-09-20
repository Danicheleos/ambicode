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
`--permission-prompts none`, `--output-format json`, `--json-schema`, `--model`.

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
and those retries do not appear in the result envelope. Doc 02 forbids an
automatic model-repair loop, so AMBICODE sets the variable to `1` in the
reviewer's replacement environment: one attempt, after which a schema failure
comes back as `error_max_structured_output_retries` and becomes a review error.

How this was established: the field names, the error subtype, the variable name
and its default were read out of the shipped `claude` 2.1.272 binary's embedded
sources (`structured_output`, `error_max_structured_output_retries`,
`MAX_STRUCTURED_OUTPUT_RETRIES`, default `5`), and the envelope shapes were
exercised end to end through the built artifact against a stub `claude` on
`PATH`. **No authorized model call was made**, so the live behaviour of the
retry cap is unverified; it is covered by M11 when model access is available.

The argument vector, as observed being handed to the process:

```
--print --safe-mode --restricted --strict-mcp-config --mcp-config {"mcpServers":{}}
--tools Read,Grep,Glob
--disallowedTools Bash,Write,Edit,NotebookEdit,WebFetch,WebSearch,Task,Agent
--permission-prompts none --no-session-persistence --model <model>
--output-format json --json-schema <schema>
```

The prompt goes over stdin, not in the argument vector: it is large and holds
option-like text. The working directory is the sanitized snapshot; there is no
`--add-dir`, so the product checkout is unreachable, and no provider credential
is passed.

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

Measured on a one-line edit in a minimal TypeScript fixture with the built
artifact: 1,579 patch bytes, 1,129 mirrored bytes, **17,586 prompt bytes**,
18,715 model-input bytes. A limit that counted only patch plus mirror would have
under-measured that review by a factor of seven.

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
| A GitLab sandbox project | M06, M07, M08 and M09 are pending: fetching a real merge request, publishing selected comments, reconciling a retry, and the stale-head case. Prerequisite: a private test GitLab project with a merge request carrying added, renamed and deleted lines, and an account authorized to comment on it. |
| A running container runtime | M06's executable-check portion and M10's isolation portion are pending. The Docker CLI is installed (28.0.4) but its daemon was not running, and no digest-pinned image is configured. Prerequisite: a running daemon plus a user-configured image pinned by digest. |
| Jira / Confluence MCP | Live requirement retrieval (M05) cannot be verified here. The normalization, provenance, failure and contradiction behaviour is unit-tested against fake evidence (U16); that is not a live-MCP test and is not reported as one. |
| Authorized model access | The 12 native eval cases and the adjudication rubric exist under `evals/` and load: `claude plugin eval . --scaffold --allow-tools Bash --max-cost-usd 0` reports 2 arms × 12 cases (72 runs) on 2.1.272, and a deliberately malformed case is refused with its field errors. That is E01. No arm has been run, so E02 — one authorized smoke case with its trace inspected — is outstanding and no finding has been scored. |
| A live reviewer call | `ambicode review` was exercised end to end through the built artifact against a **stub** `claude` on `PATH` that answers with a fixed envelope and makes no model call. That proves the process wiring, the argument vector, the stdin prompt, the snapshot working directory, and the validation of a fabricated location. It is not evidence about model output quality. |

These are recorded as missing, not substituted with estimates.
