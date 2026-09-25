# Local installation and testing

AMBICODE is installed from this checkout into Claude Code's local plugin
configuration. Nothing is published to a hosted marketplace. The installer
copies the packaged candidate into a durable local-directory marketplace under
the selected Claude configuration, then asks Claude Code to install it.

## Prerequisites

- Node.js 24 or later
- Git
- Claude Code 2.1.272 or a compatible later release
- `npm ci` completed in the AMBICODE checkout

The package builder uses the JavaScript `fflate` dependency. It does not need
the Unix `zip` program. Runtime hooks and skills execute the bundled JavaScript
with `node`; they do not require `/bin/sh` or a Bash-only launcher.

## Install into your normal Claude Code configuration

From the AMBICODE checkout:

```text
npm ci
npm run package:candidate
node install-local.mjs install dist/ambicode-0.3.1
```

The default configuration directory is the same one ordinary Claude Code
commands use:

- macOS/Linux: `$CLAUDE_CONFIG_DIR` when set, otherwise `~/.claude`
- Windows: `%CLAUDE_CONFIG_DIR%` when set, otherwise
  `%USERPROFILE%\.claude`

Verify with ordinary commands in the same terminal:

```text
claude plugin list
claude plugin details ambicode@ambicode-team
node install-local.mjs inspect
```

The plugin appears in Claude's plugin list. It does **not** appear as a plugin
directory inside every product repository. User-scoped plugins live in the
Claude configuration and apply when Claude starts in a target repository.

In the target repository, start or restart Claude Code and run:

```text
/reload-plugins
/ambicode:init
```

`/ambicode:init` creates the repository-owned `.ambicode/config.yaml`. That
configuration file is the expected repository-visible result of initialization;
the installed plugin itself remains in Claude's plugin storage.

## Windows PowerShell

Use the same commands from PowerShell. Do not use a POSIX `/tmp` path or depend
on the generated `bin/ambicode` shell script:

```powershell
npm ci
npm run package:candidate
node .\install-local.mjs install .\dist\ambicode-0.3.1
claude plugin list
claude plugin details ambicode@ambicode-team
node .\install-local.mjs inspect
```

Hooks use Claude's exec-form hook contract: `node` plus an argument array that
contains `${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs`. Python environment
detection recognizes both `.venv/bin/*` and Windows `.venv/Scripts/*.exe`.
The generated `bin/ambicode.cmd` is available as a convenience, while packaged
skills use the direct Node entry point.

## Project and local scopes

The default is `--scope user`. For a project-specific installation, identify
the target explicitly:

```text
node install-local.mjs install dist/ambicode-0.3.1 --scope project --project-dir /absolute/path/to/product
```

PowerShell example:

```powershell
node .\install-local.mjs install .\dist\ambicode-0.3.1 --scope project --project-dir C:\work\product
```

`local` scope uses the same explicit `--project-dir` requirement. Claude Code
records the canonical target path. The installer verifies that path, scope,
version and enabled state by reading `claude plugin list --json` after install.

## Isolated installation tests

Use `--config-dir` only when you deliberately want an isolated Claude
configuration for testing:

```text
node install-local.mjs install dist/ambicode-0.3.1 --config-dir /absolute/path/to/test-config
node install-local.mjs inspect --config-dir /absolute/path/to/test-config
```

An ordinary `claude plugin list` reads the normal Claude configuration and
therefore will not show this isolated install. Either use the installer-safe
`inspect` command above or run Claude with the same environment.

macOS/Linux:

```text
CLAUDE_CONFIG_DIR=/absolute/path/to/test-config claude plugin list
```

PowerShell:

```powershell
$env:CLAUDE_CONFIG_DIR = 'C:\temp\ambicode-test-config'
claude plugin list
Remove-Item Env:CLAUDE_CONFIG_DIR
```

The previous guide passed a `/tmp/...` directory as a mandatory positional
argument. That installed successfully into an isolated configuration and then
made the plugin invisible to ordinary commands. The config directory is now an
optional named argument, and normal installation defaults to the real Claude
configuration.

## Development without installing

Claude Code can load the source plugin directly for a development session:

```text
npm ci
npm run build
cd /absolute/path/to/target-repository
claude --plugin-dir /absolute/path/to/ambicode
```

Inside that session, inspect `/plugin`, run `/ambicode:init`, and exercise the
required skill. After changing a skill or hook, run `/reload-plugins`; restart
the session if the changed behavior is tied to startup.

This mode is useful for editing. The packaged-candidate tests remain required
because direct loading can hide missing allowlisted files or bundle failures.

## Code intelligence setup

AMBICODE reuses Claude Code's official code-intelligence plugins. It does not
implement another source index or language server.

For TypeScript/JavaScript:

```text
claude plugin install typescript-lsp@claude-plugins-official --scope user
npm install -g typescript-language-server typescript
```

For Python:

```text
claude plugin install pyright-lsp@claude-plugins-official --scope user
pipx install pyright
```

Restart or reload Claude after installing. `ambicode init` and `ambicode
config` show the recommendation for every project; `ambicode prepare --json`
deliberately leaves installation guidance out of its per-call payload and
carries only the search strategy, the evidence requirement, and the boundary
shortlist when the call asked for one. During `investigate`, `plan`, and
`task`, the skill must report the LSP operations it actually used or a
specific targeted-search fallback reason. Installed state alone is not
evidence that the current session used LSP.

Nothing here is required for the shortlist. `ambicode locate <term>...` needs
only git, and it is what narrows a repository to candidate files before LSP is
asked anything; LSP then explains a candidate rather than finding it. A
session with no LSP plugin installed still gets the shortlist.

## Repository verification

From the AMBICODE checkout:

```text
npm run verify
npm run package:reproducible
npm run smoke:candidate
npm run smoke:install-local
npm audit
```

What these prove:

- `verify`: unit tests, TypeScript, bundle build, and strict source-plugin
  validation;
- `package:reproducible`: two clean candidate builds have the same inventory
  and ZIP bytes;
- `smoke:candidate`: the packaged bundle can initialize and serve its own
  resources;
- `smoke:install-local`: a real Claude CLI install, inspect, upgrade, scope
  refusal and uninstall lifecycle in an isolated configuration;
- `npm audit`: the resolved dependency graph has no currently reported npm
  advisory.

Run the command set on both a supported Unix host and a Windows host before
claiming cross-platform acceptance. Tests written on one host prove the code
path and archive content, not the other operating system's Claude executable,
filesystem, or process behavior.

## Upgrade and uninstall

Build the new candidate and run the same install command. A same-version run is
idempotent only when its content is identical. Claude Code does not refresh its
cache when content changes under the same version, so the installer refuses
that case instead of claiming success with stale skills. Use `--plugin-dir`
plus `/reload-plugins` while calibrating, or bump the packaged version. A
version change uses Claude's update operation. The installer
stages and validates the replacement first, preserves the previous source until
native postconditions pass, and writes state atomically.

```text
node install-local.mjs install dist/ambicode-0.3.1
node install-local.mjs uninstall
```

For an isolated configuration, repeat the exact named option:

```text
node install-local.mjs uninstall --config-dir /absolute/path/to/test-config
```

Uninstall reads the recorded scope and project directory. Conflicting caller
options are refused before mutation. It removes only the installer-owned
`ambicode-install` directory and native plugin/marketplace registrations;
product repositories' `.ambicode/` directories remain.

## Troubleshooting

**Installed, but absent from `claude plugin list`.** Run
`node install-local.mjs inspect`. If you installed with `--config-dir`, use the
same `--config-dir` for inspect or set `CLAUDE_CONFIG_DIR` for every Claude
command. Otherwise confirm the install command did not inherit an unintended
`CLAUDE_CONFIG_DIR`.

**Skills are absent in the target repository.** Confirm plugin details report
the five skills, start Claude with the target repository as its working
directory, then run `/reload-plugins`. Project/local installs must use the same
canonical `--project-dir` recorded during installation.

**Windows reports that `zip`, `sh`, or `bin/ambicode` is missing.** Rebuild
from the corrected source. Candidate packaging uses `fflate`; hooks and skills
use `node .../scripts/ambicode.mjs`; no such program should be required.

**Install reports `same-version-content-changed`.** Claude's native update
reports the same version as already current and leaves its old cache in place.
Use the development `--plugin-dir` flow for live skill edits, or increment the
candidate version and reinstall.

**Inspect reports `plugin-list-failed` or `postcondition-failed`.** The
installer state and Claude's native state cannot be proven consistent. Do not
delete the durable source first. Read the reported recovery journal, inspect
`claude plugin list --json`, and resolve the named native registration.

**A mutation fails and a recovery journal is written.** Automatic compensation
also failed. The journal is under the chosen configuration's
`ambicode-install` directory and preserves the source needed for recovery.
Follow its steps before another install.
