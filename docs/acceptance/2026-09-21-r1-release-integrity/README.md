# R1 — release integrity and the three-OS matrix

**Commit:** `a8798c48b33a9cc3935f784f87f4d766a76543c4` (`R1: release integrity
and the three-OS matrix`)
**Date:** 2026-09-21
**Version:** 0.1.2 (`package.json` and `.claude-plugin/plugin.json`)
**Supersedes:** [`2026-09-21-local-install-navigation-correction`](../2026-09-21-local-install-navigation-correction/README.md),
whose verification evidence is corrected in place.

Every measurement below was taken on this exact commit. Where a claim could
not be measured, it is listed under "Not verified" rather than softened.

## Host

| | |
| --- | --- |
| OS | Windows 11 Pro 10.0.26200, native (not WSL) |
| Node | 24.18.0 |
| Claude Code CLI | 2.1.278 |
| Shell | Git Bash and `cmd`, both exercised |

## Reproduced failures

Against the parent commit `a551a97`, `npm run verify` exited 1: **462 tests,
455 passing, 7 failing.**

| Failing test | Defect |
| --- | --- |
| `U29 process runner > keeps exit, timeout and spawn failure distinct` | A missing executable is `exited`, not `spawn-failed`, on Windows |
| `U18 remote executable checks > runs the command in a locked-down disposable container ...` | Assertion assumes `/` is the path separator |
| `U03 built-in packs parse, keep authority and provenance, and qualify rule ids` | Assertion assumes `/` is the path separator |
| `P2.2/P2.3 shipped skill content > registers exactly ambicode:init, ...` | Frontmatter read with an LF-only regex against a CRLF checkout |
| `P2.2/P2.3 shipped skill content > plan declares an argument hint ...` | as above |
| `P2.3 task skill > declares an argument hint ...` | as above |
| `P2.3 task skill > never commits, pushes, opens a merge request, ...` | as above |

Two further defects were confirmed that no test reported:

- `skills/investigate/SKILL.md:3` and `skills/plan/SKILL.md:3` carried a
  `description:` that is not a legal YAML plain scalar. Parsing either with
  the `yaml` package raises *"Nested mappings are not allowed in compact
  mappings at line 2, column 14"*, so both skills load with no `name` and no
  `description`. Confirmed present in `dist/ambicode-0.1.1/` and absent from
  `dist/ambicode-0.1.0/`.
- `git ls-files --eol` reported `i/lf w/crlf` for 318 of 321 tracked files:
  no `.gitattributes` existed, and `core.autocrlf=true` is the Windows
  default.

## Corrected behavior

- Both `description:` values are double-quoted. The description **text** is
  byte-identical to `a463877`, verified by comparing the parsed value against
  `git show HEAD:...`.
- `NodeProcessRunner` resolves the executable before spawning on Windows
  (`windowsCommandExists`), so a command that is not installed is
  `spawn-failed` with an `ENOENT` failure on all three platforms. Unix takes
  the same code path it did before.
- `.gitattributes` declares `* text=auto eol=lf`, with `*.cmd`/`*.bat` kept
  CRLF because cmd.exe is unreliable with LF-only batch files. The tree was
  renormalized in the same commit.
- `src/util/skill-content.test.ts` parses frontmatter with `YAML.parse` and
  asserts `name`, `description`, and `argument-hint` for `plan` and `task`.
- The two path assertions R1 named, plus a third found in
  `smoke-candidate.mjs`, normalize the observed value instead of the
  production value being reshaped. The reasoning is in the commit message.
- `.github/workflows/verify.yml` runs `npm run verify` on `ubuntu-latest`,
  `windows-latest` and `macos-latest`, Node 24, `fail-fast: false`, Windows in
  native `cmd`.

## Evidence observed on this host

Each line is a command that was run on this commit and its actual output.

- **`npm run verify`: exit 0 — 478 tests in 53 suites, 0 failures.** Build,
  `tsc --noEmit`, unit tests and `claude plugin validate . --strict` all
  passed. (462 → 478 tests: 16 added, none removed.)
- **Acceptance criterion 2.** Parsing all five `skills/*/SKILL.md`
  frontmatters with `YAML.parse` yields a `name` for each, and every `name`
  equals its directory name. `plan` and `task` additionally carry
  `argument-hint`.
- **Acceptance criterion 4.** `ProcessRunner` against a nonexistent
  executable returns `kind: 'spawn-failed'`, `exitCode: null`, and a non-null
  `failure` matching `/ENOENT/`. Also covered, and passing: a path that does
  not exist, a `cwd` that does not exist, and a path that exists but cannot be
  executed. The inverse is pinned too — a command that ran and exited 1 stays
  `exited`, which is the case Windows used to conflate with a missing command.
- **Acceptance criterion 5.** `node check-line-endings.mjs` reports
  *"line endings OK: 321 tracked text file(s), all stored as LF"*.
- **Acceptance criterion 7.** All five skills in `dist/ambicode-0.1.2/skills/`
  parse, and each `name` matches its directory. The broken
  `dist/ambicode-0.1.1*` artifacts were deleted.
- **`npm run package:reproducible`**: 33 files, byte-identical archives across
  two independent runs, zip SHA-256
  `876dd0d47856b9de4339fc1a35be40a86cc2f2b562ba8333004eb712b0cf21e2`.
- **`npm run smoke:candidate`**: all three checks pass — `version` outside any
  repository, `init` + `policy` resolving the candidate's own built-in
  policies, and `view` serving a page from the candidate's templates. This
  previously failed on Windows; see "Corrected behavior".
- **The regression test was proven to regress.** Re-introducing the unquoted
  scalar into `skills/plan/SKILL.md` and re-running the suite fails three
  tests with *"plan/SKILL.md: frontmatter is not valid YAML"*. The fix was
  then restored and the suite re-run green.

## Not verified

- **Linux and macOS.** Only Windows was available. Acceptance criteria 3 and 6
  — `npm run verify` green on all three, and CI green on all three — are
  therefore **not** evidenced by this record. The workflow's YAML was parsed
  and its matrix and step list inspected, but no CI run has executed: the
  workflow is new in this commit and runs on first push. **This record must be
  amended with the first green matrix run before 0.1.2 is released.**
- **Acceptance criterion 1 passes but proves nothing.**
  `claude plugin validate . --strict` exits 0 — and it also exits 0 on the
  *broken* tree. Measured on CLI 2.1.278: at the repository root its `--json`
  report lists `"contents": []`, so no skill is inspected, and pointing it at
  `skills/` directly also passes with the unparseable frontmatter in place.
  R1's defect report states this command currently fails with
  `frontmatter: YAML frontmatter failed to parse`; that did not reproduce
  here. It may be version-dependent. Either way, `validate --strict` should
  not be relied on as the gate for skill frontmatter — criterion 2 is the one
  that discriminates.
- **The skills were not observed failing to trigger.** That two of five
  deliverables were inert is a sound inference from the frontmatter being
  invalid YAML, and it is consistent with everything measured, but it was not
  reproduced directly in a live session.
- **A permission-denied *file* on Windows.** Executability there is decided by
  extension, not a mode bit, so the "exists but cannot be executed" case is
  covered by a directory, which behaves the same way on every platform. A
  POSIX `chmod -x` file is covered by the same test on Linux and macOS, which
  did not run here.
- `npm run smoke:install-local` and `npm audit` were not re-run.

## Still open from the superseded record

- Neither official LSP plugin nor its server binary was active. Real
  TypeScript and Python definition/reference operations remain required.
- `docs/release-checklist.md` still mandates a Windows real install, hook and
  target session. The Windows `verify` and reproducible package it lists are
  now satisfied by this record.
