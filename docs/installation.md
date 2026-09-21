# Installation, upgrade, disable, uninstall, rollback

What was actually run to produce this page, and on what: Claude Code
2.1.272, Node.js 24.15.0, npm 11.12.1, git 2.55.0, macOS, `zip` (Info-ZIP)
from the base OS. Every command below was executed against the packaged
candidate described in the dated acceptance record under
`docs/acceptance/`, using an isolated `CLAUDE_CONFIG_DIR` so nothing here
touched a real user's `~/.claude`. Installation and use are local: there is
no separate "release owner" install path to run.

## Building the candidate

```sh
npm ci
npm run build
npm run package:candidate
```

`npm run package:candidate` (`package-candidate.mjs`) rebuilds the compiled
helper, assembles an explicit allowlist of runtime files under
`dist/ambicode-<version>/`, and writes `dist/ambicode-<version>.inventory.json`
(every shipped file's path, size and SHA-256) and a byte-reproducible
`dist/ambicode-<version>.zip` with its digest in
`dist/ambicode-<version>.zip.sha256`. The allowlist is: `.claude-plugin/plugin.json`,
`bin/ambicode`, `scripts/ambicode.mjs`, `skills/**/*.md`, `prompts/*.md`,
`policies/**/*.{yaml,md}`, `templates/*.{eta,css}`, and an explicit list of
shipped documents — `docs/installation.md`, `docs/compatibility.md`,
`docs/review.md`, `docs/rule-migration.md` — not a wildcard over `docs/`.
`docs/acceptance/**` (this repository's own dated acceptance records) and
`docs/release-checklist.md` (the release/pilot-owner checklist below) are
deliberately not shipped documents: they are build evidence and internal
process notes, not something the installed candidate needs (doc 03 P1.7
correction B — a recursive `docs/*.md` copy previously pulled in the
acceptance record itself, silently changing the candidate's own file count).
It contains no `node_modules`, no TypeScript source, no `package.json`/lockfile,
and no path specific to the machine that built it — `npm run package:candidate`
fails loudly if any of those checks does not hold.

```sh
npm run package:reproducible
```

Rebuilds the helper and re-assembles the candidate twice, into two
independent temporary directories, and fails if the two runs do not produce
byte-identical zip archives at identical paths with identical content, not
only the same file set (doc 03 P1.7 correction B).

## Local install (the only distribution this project has)

AMBICODE is installed and used locally. There is no hosted, public, or
private remote marketplace: `install-local.mjs` is the one concrete command
that takes a packaged candidate and installs it into a chosen
`CLAUDE_CONFIG_DIR`.

```sh
npm run package:candidate
node install-local.mjs dist/ambicode-<version> /tmp/ambicode-isolated-claude-config
```

This generates a throwaway local marketplace next to the candidate — a
directory containing a `.claude-plugin/marketplace.json` whose one entry's
`source` is a local path to a copy of the candidate — and runs, with
`CLAUDE_CONFIG_DIR` set to the directory you passed:

```sh
claude plugin marketplace add <generated-marketplace-dir>
claude plugin install ambicode@ambicode-team -s user -y
```

The generated marketplace directory is not committed, published, or reused
between runs; it exists only because a directory-backed marketplace is
Claude Code's own mechanism for installing a plugin from somewhere other
than `--plugin-dir`. `claude --plugin-dir .` is not a substitute for testing
the candidate: it loads the live source tree directly and never exercises
the packaged artifact, the allowlist, or this install path at all.

Reverse it with:

```sh
node install-local.mjs dist/ambicode-<version> /tmp/ambicode-isolated-claude-config --uninstall
```

which runs `claude plugin uninstall ambicode@ambicode-team -s user -y` then
`claude plugin marketplace remove ambicode-team` against the same
`CLAUDE_CONFIG_DIR`. Pass `--scope project` or `--scope local` to install or
uninstall at another of Claude Code's own scopes.

Using a fresh `CLAUDE_CONFIG_DIR` (confirmed in this session to fully
isolate settings, session history and plugin state from the real
`~/.claude`) is what makes this a genuine install test rather than a change
to whoever runs it.

Verified in this session, both against the 0.1.0 candidate through
`install-local.mjs` end to end (install, inspect, uninstall) into an
isolated `CLAUDE_CONFIG_DIR`:

- `claude plugin marketplace add` and `claude plugin install ambicode@ambicode-team -s user -y` both succeed.
- `claude plugin list` shows `ambicode@ambicode-team`, version matching the candidate, status enabled.
- `claude plugin details ambicode@ambicode-team` reports the three skills — `init`, `review`, `investigate` — the `ambicode:init` / `ambicode:review` / `ambicode:investigate` namespace doc 03 and `docs/compatibility.md` describe, confirmed without a model call.
- `grep -rl "$(pwd)"` (the source repo's own absolute path) and a search for the operator's `$HOME` across the installed cache tree both come back empty: no developer-specific path in the installed files.
- `claude plugin validate <candidate-dir> --strict` passes against the packaged directory itself, not only against the source repository.
- `claude plugin uninstall ambicode@ambicode-team -s user -y` followed by `claude plugin marketplace remove ambicode-team` both succeed, and `claude plugin list` afterward shows no installed plugins.

## Hosted or remote marketplace distribution: out of scope

Earlier drafts of this document described publishing `marketplace/ambicode-team/`
to a URL a team could run `/plugin marketplace add` against, with a
placeholder hosted `source.url`/`source.sha256` to fill in. That is out of
scope for this project (doc 08, "Distribution"): installation and use are
local, no organization is expected to host the artifact, and
`marketplace/ambicode-team/` has been removed rather than kept as a
permanently-placeholder file. If a hosted or team-shared marketplace is
ever genuinely needed, that is a new, explicitly scoped decision, not a
default extension of local installation.

## Upgrade

The straightforward path matches how the candidate was installed: package
the new version and run `install-local.mjs --uninstall` against the old one,
then a plain install of the new one (each generates its own temporary
marketplace, so there is nothing stale to update). If you kept a generated
marketplace directory and overwrite the candidate copy inside it in place,
Claude Code's native update mechanism also works unmodified:

```sh
claude plugin marketplace update ambicode-team
claude plugin update ambicode@ambicode-team
```

Reopen any review with `ambicode view --review <id>` after an upgrade rather
than assuming an in-flight review's pinned policy changed; it does not (doc
02, "Storage and ownership").

## Disable / re-enable

```sh
claude plugin disable ambicode@ambicode-team -s user
claude plugin enable ambicode@ambicode-team -s user
```

Verified in this session: after `disable`, `claude plugin list` reports
`Status: ✘ disabled`, and Claude Code's own loader excludes a disabled
plugin's skills from a new session's registration — this is the mechanism
"new AMBICODE work is unavailable" rests on. Confirming that a live,
authenticated Claude Code session actually offers no `/ambicode:*` skill
while disabled needs a real interactive session; the isolated sandbox used
for this candidate has no credentials in it deliberately, so that specific
observation is **pending** on a developer's own authenticated machine, not
faked here. `enable` reversed the state back to `✔ enabled` in the same
sandbox.

## Uninstall

```sh
claude plugin uninstall ambicode@ambicode-team -s user
```

Verified in this session: `claude plugin list` afterward shows no
installed plugins, and a product repository's `.ambicode/config.yaml` and
`.ambicode/reviews/**` created before the uninstall were byte-for-byte
untouched (checked with `find` before and after). AMBICODE's own
uninstall path never runs against project files, because it has none: all
project-owned state lives under the product repository's own
`.ambicode/`, not under the plugin installation.

The plugin's cached files under Claude Code's own
`plugins/cache/<marketplace>/<plugin>/<version>/` were **not** removed by
this uninstall in the observed run — that is Claude Code's own cache
behavior, not something AMBICODE controls. `claude plugin uninstall
--keep-data` additionally preserves the plugin's `CLAUDE_PLUGIN_DATA`
directory if one exists; AMBICODE does not use `CLAUDE_PLUGIN_DATA` today,
so this flag has no additional effect for AMBICODE specifically as of this
version.

## Rollback

Native plugin management, not a rewritten branch, is the rollback path
(doc 08, "Rollback and cleanup"): disable or uninstall the candidate, then
install the previously published immutable version. No real previously
published version of AMBICODE exists yet, so this session demonstrated the
*mechanism* with two local, clearly-labeled test candidates rather than
claiming a real rollback:

```sh
# marketplace.json's ambicode entry pointed at ./ambicode-0.0.1-rollback-demo,
# a second local candidate whose plugin.json version is literally
# "0.0.1-rollback-demo" so it can never be mistaken for a real release.
claude plugin marketplace update ambicode-team
claude plugin update ambicode@ambicode-team
# -> "Plugin ambicode updated from 0.1.0 to 0.0.1-rollback-demo for scope user."
```

That output is the actual mechanism a real rollback uses. **Pending**: an
actual rollback between two genuinely different released versions, which
needs a first real release to exist.

## Storage ownership and optional cleanup

| Location | Owner | Removed by uninstall? |
| --- | --- | --- |
| `<product repo>/.ambicode/config.yaml`, policy packs, prompt files | The product repository, versioned | Never |
| `<product repo>/.ambicode/reviews/` (results, drafts, publication history) | The product repository, gitignored | Never |
| Temporary sanitized code snapshots (`ambicode-snapshot-*`, `ambicode-page-*`, …) | The current run; owned by AMBICODE's own marker file | Swept automatically once expired, at the next `ambicode view` |
| `~/.claude/plugins/cache/<marketplace>/ambicode/<version>/` | Claude Code | Native behavior; observed **not** removed on uninstall in this session — remove it yourself if you want the disk space back |
| `~/.claude/plugins/data/ambicode/` (`CLAUDE_PLUGIN_DATA`), if it ever exists | Claude Code | Removed on uninstall from all scopes unless `--keep-data`; unused by AMBICODE today |

AMBICODE never deletes project-owned configuration, rules, prompts, notes,
drafts or review history automatically, on install, upgrade, disable,
uninstall or rollback. Only the plugin management commands above, run by a
human, change plugin registration state; nothing in AMBICODE's own code
runs any of them.
