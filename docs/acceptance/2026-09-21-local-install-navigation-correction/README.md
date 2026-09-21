# Local installation, Windows, and navigation correction

This record corrects the defects found after auditing commit
`44cd94911af6e82e8e9b12822b20deb174005c29`. The defects came from the design
and plan, not from an implementer failing to follow them.

> **Correction, 2026-09-21 (R1).** The "Evidence observed on this host"
> section below overstated what had been verified, and this record named no
> commit that the evidence belonged to. Both are corrected in place: see
> [Correction: what this record actually evidenced](#correction-what-this-record-actually-evidenced)
> at the end. In short — `npm run verify` did **not** pass on the tree that
> was published as the 0.1.1 candidate, on any platform. The superseding
> record is
> [`2026-09-21-r1-release-integrity`](../2026-09-21-r1-release-integrity/README.md).

## Reproduced failures

- The documented positional config directory was an isolated
  `CLAUDE_CONFIG_DIR`. Installation succeeded there, while ordinary
  `claude plugin list` correctly read the normal configuration and showed
  nothing.
- Candidate packaging executed the host `zip` program, hooks executed a POSIX
  shell launcher, and Python detection only knew `.venv/bin`.
- A normalized `{ok:false}` result from a rollback action did not create a
  recovery journal; project/local postcondition verification accepted a
  missing `projectPath`; inspect could hide a native list failure.
- Plans and skills mentioned LSP as an optional preference. No machine output
  presented the recommended plugin/server and no result had to say whether LSP
  was actually used.
- `docs/installation.md` named `npm run smoke:candidate`, but that package
  script did not exist.

## Corrected behavior

- `install-local.mjs install <candidate>` defaults to inherited
  `CLAUDE_CONFIG_DIR` or the user's `.claude`; isolated installation is the
  explicit `--config-dir <dir>` form. Output explains which verification
  command sees each configuration.
- Real CLI calls use Execa's cross-platform executable resolution. Hooks and
  skills call the bundled JavaScript through `node` and argument arrays.
  Candidate ZIP generation uses build-only `fflate`; a `.cmd` convenience
  launcher ships; Python discovery accepts `.venv/Scripts/*.exe`.
- Installer state writes through a same-directory temporary file and rename.
  Rollback treats returned failures as failures, preserves dependent source,
  and journals incomplete recovery. Project/local postconditions require the
  exact canonical path. Inspect fails on unreadable or contradictory native
  state.
- One navigation registry maps the existing ecosystem enum to the official
  TypeScript or Pyright Claude plugin, server command, and setup commands.
  `init`, `config`, and `prepare` present it. Investigate, plan, and task report
  actual LSP operations or a targeted-search fallback reason.
- `smoke:candidate` is registered and invokes the bundle through Node, so the
  smoke itself does not depend on the POSIX launcher.

## Evidence observed on this host

> Read this section together with the correction at the end of the record: the
> first bullet describes an earlier working tree, not the commit this record
> was filed against.

- `npm run verify`: 462 tests in 51 suites, 0 failures; TypeScript, bundle and
  strict plugin validation passed. **(Superseded — see the correction. This
  was observed on an earlier working tree on macOS, and was not true of the
  committed tree.)**
- `npm run package:reproducible`: 33 files and byte-identical ZIP SHA-256
  `c642776b0c536ebf57e68ac332cfa426671d917e1fc70d8763be372998b8ea00` across
  two independent builds.
- `npm run smoke:candidate`: version, init/policy resource resolution, and
  loopback view all passed from the packaged candidate.
- `npm run smoke:install-local`: real Claude CLI install, inspect,
  same-version idempotence, version update, scope refusal, deleted-source
  durability and uninstall passed in an isolated configuration.
- `npm audit`: 0 vulnerabilities.
- A normal user-scope install into `/Users/KillBill/.claude` succeeded.
  `node install-local.mjs inspect`, `claude plugin details`, and `claude plugin
  list` from an unrelated temporary target directory all showed enabled
  `ambicode@ambicode-team` 0.1.1 with five skills and four hooks.

## Evidence still pending

- Native Windows execution is not available on this macOS host. The
  cross-platform paths and Windows-shaped virtual environment are automated,
  but a Windows `verify`, reproducible package, real install, hook and target
  session remain mandatory in `docs/release-checklist.md`.
- Neither official LSP plugin nor its server binary was active in this session.
  Real TypeScript and Python definition/reference operations remain required;
  the product now reports this gap instead of implying LSP use.

## Correction: what this record actually evidenced

Added 2026-09-21 as part of R1, after auditing this record against the tree it
was filed for.

**This record named no commit.** An acceptance record whose evidence cannot be
tied to an exact tree cannot be checked later, which is how the two claims
below survived. Every record from here on names the commit it describes; this
one is retroactively tied to `a4638779`, the commit that published the 0.1.1
candidate.

**Claim: "462 tests in 51 suites, 0 failures; ... strict plugin validation
passed."** Re-running `npm run verify` against the committed tree gives 462
tests and **7 failures**, on native Windows:

| Failing test | Cause |
| --- | --- |
| `U29 process runner > keeps exit, timeout and spawn failure distinct` | A missing executable is classified as `exited` on Windows, not `spawn-failed` |
| `U18 remote executable checks > ... never mounts the source` | Assertion assumes a `/` path separator |
| `U03 built-in packs parse, keep authority and provenance ...` | Assertion assumes a `/` path separator |
| 4 tests in `P2.2/P2.3 shipped skill content` and `P2.3 task skill` | Frontmatter read with an LF-only regex; a Windows checkout is CRLF |

The test count was right; "0 failures" was true only of an earlier tree, on
macOS. The record does say, correctly, under "Evidence still pending", that
native Windows execution was unavailable on that host — but it then reported a
green `verify` without scoping it to the platform it was run on. Those two
statements cannot both stand.

**Claim: "strict plugin validation passed."** Literally true, and misleading.
`claude plugin validate . --strict` did exit 0 on the committed tree — but two
of the five shipped skills had a `description:` that is not a legal YAML plain
scalar, so they loaded with no `name` and no `description` and could not be
triggered. Measured on Claude Code CLI 2.1.278, `plugin validate --strict`
does not report this, at the repository root (its JSON report lists
`"contents": []`, so no skill is inspected) or when pointed at `skills/`
directly. The command was treated as evidence that the skills were sound; it
is not evidence of that. R1 replaces the repository's own frontmatter check
with a real `YAML.parse`, which does catch it.

**What this record got right and should be kept for:** the installation,
rollback, packaging and navigation work it describes was real and is still in
place. Only the verification evidence was overstated.
