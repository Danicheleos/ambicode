# Local installation, Windows, and navigation correction

This record corrects the defects found after auditing commit
`44cd94911af6e82e8e9b12822b20deb174005c29`. The defects came from the design
and plan, not from an implementer failing to follow them.

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

- `npm run verify`: 462 tests in 51 suites, 0 failures; TypeScript, bundle and
  strict plugin validation passed.
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
