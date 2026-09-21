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
node install-local.mjs install dist/ambicode-<version> /tmp/ambicode-isolated-claude-config
```

**This installation is durable** (doc 04 P2.2 correction A): Claude Code
loads a local-directory marketplace's `source` path *in place*, not by
copying it into its own cache at install time, so a throwaway `/tmp`
marketplace would silently stop working the moment that directory was
cleaned up. `install-local.mjs` instead copies the candidate into one
directory it owns beneath the `CLAUDE_CONFIG_DIR` you passed —
`<config-dir>/ambicode-install/marketplace/` — and points the marketplace at
*that* copy. Once `install` finishes, the original `dist/ambicode-<version>`
directory can be deleted, the terminal can be closed, and `/tmp` can be
swept: none of that affects the installation, because none of it is what the
marketplace actually points at any more. Concretely, `install` runs, with
`CLAUDE_CONFIG_DIR` set to the directory you passed:

```sh
claude plugin marketplace add <config-dir>/ambicode-install/marketplace
claude plugin install ambicode@ambicode-team -s user -y
```

(falling back to `plugin marketplace update` / `plugin update` on a repeat
install against the same `CLAUDE_CONFIG_DIR`, so installing twice — an
upgrade included — is idempotent rather than an error).

`claude --plugin-dir .` is not a substitute for testing the candidate: it
loads the live source tree directly and never exercises the packaged
artifact, the allowlist, or this install path at all.

Reverse it with:

```sh
node install-local.mjs uninstall /tmp/ambicode-isolated-claude-config
```

Uninstall does **not** take a candidate directory — it reads the installed
plugin's name and version back out of the durable marketplace manifest under
`CLAUDE_CONFIG_DIR`, so it works even if `dist/ambicode-<version>` (or the
whole source checkout it lived in) is long gone. It runs `claude plugin
uninstall ambicode@ambicode-team -s user -y` then `claude plugin marketplace
remove ambicode-team`, then removes the `<config-dir>/ambicode-install/`
directory it owns. It never touches a product repository's `.ambicode/`.
Pass `--scope project` or `--scope local` to install or uninstall at another
of Claude Code's own scopes; both require an explicit `--project-dir <dir>`
(the scope writes into that project's own `.claude/settings.json`, and
`install-local.mjs` refuses to guess an incidental current working
directory for that).

Use `node install-local.mjs inspect <config-dir>` at any point to see the
durable marketplace's recorded plugin identity and to run `claude plugin
list` against that `CLAUDE_CONFIG_DIR` in a fresh `claude` process.

Using a fresh `CLAUDE_CONFIG_DIR` (confirmed in this session to fully
isolate settings, session history and plugin state from the real
`~/.claude`) is what makes this a genuine install test rather than a change
to whoever runs it.

**Isolated durability smoke test** (`npm run smoke:install-local`,
`install-local.smoke.mjs`): packages the candidate, copies it to a private
temporary directory standing in for a source checkout's `dist/`, installs
into a fresh isolated `CLAUDE_CONFIG_DIR`, inspects it, **deletes that
candidate copy entirely**, then — in brand new `claude` processes, none of
them the one that ran the install — confirms `claude plugin list` and
`claude plugin details ambicode@ambicode-team` still report the plugin and
all four skills. It then uninstalls (without the deleted candidate directory
existing) and confirms both the plugin and the durable install directory are
gone. Run in this session against the 0.1.0 candidate; passed:

- `claude plugin marketplace add` and `claude plugin install ambicode@ambicode-team -s user -y` both succeed, against the durable `<config-dir>/ambicode-install/marketplace`, not a `/tmp` path.
- `claude plugin list` (a first fresh process) shows `ambicode@ambicode-team`, version matching the candidate, status enabled.
- The candidate directory used for the install is deleted.
- `claude plugin list` and `claude plugin details ambicode@ambicode-team` (further fresh processes, run *after* that deletion) still report the plugin, and `details` reports all four skills — `init`, `investigate`, `plan`, `review`.
- `grep -rl "$(pwd)"` (the source repo's own absolute path) and a search for the operator's `$HOME` across the installed cache tree both come back empty: no developer-specific path in the installed files.
- `claude plugin validate <candidate-dir> --strict` passes against the packaged directory itself, not only against the source repository (run separately as part of `npm run verify`).
- `claude plugin uninstall ambicode@ambicode-team -s user -y` followed by `claude plugin marketplace remove ambicode-team` both succeed without the deleted candidate directory, `claude plugin list` (a further fresh process) afterward shows no installed plugins, and `<config-dir>/ambicode-install/` no longer exists.

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

Package the new version and run `install` again against the same
`CLAUDE_CONFIG_DIR`:

```sh
npm run package:candidate
node install-local.mjs install dist/ambicode-<new-version> /tmp/ambicode-isolated-claude-config
```

This is idempotent, not merely repeatable: `install` replaces the durable
copy under `<config-dir>/ambicode-install/marketplace/` in place (removing
the previous version's copy so it does not accumulate), rewrites the
marketplace manifest, then falls back from `plugin marketplace add` /
`plugin install` to `plugin marketplace update` / `plugin update` when
Claude Code already knows this marketplace — the same native commands doc
08 ("Distribution") describes, now driven against a durable path instead of
one you would have to remember to update by hand.

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
node install-local.mjs uninstall /tmp/ambicode-isolated-claude-config
```

which runs `claude plugin uninstall ambicode@ambicode-team -s user -y`, then
`claude plugin marketplace remove ambicode-team`, then removes the
`<config-dir>/ambicode-install/` directory `install-local.mjs` itself owns —
the durable marketplace copy, not anything Claude Code's own cache manages.
It reads the plugin's name and version back out of that directory's
marketplace manifest, so it needs no candidate directory (doc 04 P2.2
correction A): a source checkout's `dist/ambicode-<version>` can be long
gone and uninstall still works, as confirmed by `npm run
smoke:install-local` above.

Verified in this session: `claude plugin list` afterward shows no
installed plugins, `<config-dir>/ambicode-install/` no longer exists, and a
product repository's `.ambicode/config.yaml` and `.ambicode/reviews/**`
created before the uninstall were byte-for-byte untouched (checked with
`find` before and after). AMBICODE's own uninstall path never runs against
project files, because it has none: all project-owned state lives under the
product repository's own `.ambicode/`, not under the plugin installation or
anywhere beneath `CLAUDE_CONFIG_DIR`.

If you instead run the raw native commands by hand (`claude plugin
uninstall ambicode@ambicode-team -s user`), Claude Code's own cached files
under `plugins/cache/<marketplace>/<plugin>/<version>/` are **not** removed
— that is Claude Code's own cache behavior, not something AMBICODE
controls, and `install-local.mjs uninstall` does not touch it either.
`claude plugin uninstall --keep-data` additionally preserves the plugin's
`CLAUDE_PLUGIN_DATA` directory if one exists; AMBICODE does not use
`CLAUDE_PLUGIN_DATA` today, so this flag has no additional effect for
AMBICODE specifically as of this version.

## Rollback

Native plugin management, not a rewritten branch, is the rollback path
(doc 08, "Rollback and cleanup"): disable or uninstall the candidate, then
install the previously built version. No real previously released version
of AMBICODE exists yet. A prior session (P1.7) demonstrated the *mechanism*
against the earlier throwaway-marketplace install path with two local,
clearly-labeled test candidates:

```sh
# marketplace.json's ambicode entry pointed at ./ambicode-0.0.1-rollback-demo,
# a second local candidate whose plugin.json version is literally
# "0.0.1-rollback-demo" so it can never be mistaken for a real release.
claude plugin marketplace update ambicode-team
claude plugin update ambicode@ambicode-team
# -> "Plugin ambicode updated from 0.1.0 to 0.0.1-rollback-demo for scope user."
```

The underlying native commands are unchanged by this release's durable
install directory (doc 04 P2.2 correction A) — only the concrete path
`install-local.mjs` points the marketplace at moved, from a throwaway
`/tmp` directory to `<config-dir>/ambicode-install/marketplace/`. The
straightforward equivalent with the current `install-local.mjs` is simply
`install`ing the older candidate again:

```sh
node install-local.mjs install dist/ambicode-<older-version> /tmp/ambicode-isolated-claude-config
```

using `install`'s own replace-in-place idempotency (see "Upgrade" above) to
go backwards exactly as it goes forwards. **Pending**: rerunning this
specific demonstration against the current `install-local.mjs`, and an
actual rollback between two genuinely different released versions, which
needs a first real release to exist.

## Storage ownership and optional cleanup

| Location | Owner | Removed by uninstall? |
| --- | --- | --- |
| `<product repo>/.ambicode/config.yaml`, policy packs, prompt files | The product repository, versioned | Never |
| `<product repo>/.ambicode/reviews/` (results, drafts, publication history) | The product repository, gitignored | Never |
| `<product repo>/.ambicode/notes/` (investigation/plan notes) | The product repository, gitignored | Never |
| Temporary sanitized code snapshots (`ambicode-snapshot-*`, `ambicode-page-*`, …) | The current run; owned by AMBICODE's own marker file | Swept automatically once expired, at the next `ambicode view` |
| `<config-dir>/ambicode-install/` (durable local marketplace + candidate copy) | `install-local.mjs`, under the `CLAUDE_CONFIG_DIR` you chose | Yes — `install-local.mjs uninstall` removes exactly this directory |
| `~/.claude/plugins/cache/<marketplace>/ambicode/<version>/` | Claude Code | Native behavior; observed **not** removed on uninstall in this session — remove it yourself if you want the disk space back |
| `~/.claude/plugins/data/ambicode/` (`CLAUDE_PLUGIN_DATA`), if it ever exists | Claude Code | Removed on uninstall from all scopes unless `--keep-data`; unused by AMBICODE today |

AMBICODE never deletes project-owned configuration, rules, prompts, notes,
drafts or review history automatically, on install, upgrade, disable,
uninstall or rollback. Only the plugin management commands above, run by a
human, change plugin registration state; nothing in AMBICODE's own code
runs any of them.
