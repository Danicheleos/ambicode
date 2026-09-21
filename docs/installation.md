# Installation, upgrade, disable, uninstall, rollback

What was actually run to produce this page, and on what: Claude Code
2.1.272, Node.js 24.15.0, npm 11.12.1, git 2.55.0, macOS, `zip` (Info-ZIP)
from the base OS. Every command below was executed against the packaged
candidate described in the dated acceptance record under
`docs/acceptance/`, using an isolated `CLAUDE_CONFIG_DIR` so nothing here
touched a real user's `~/.claude`. Commands the release owner still has to
run for a real (non-local) install are marked **release owner**.

## Building the candidate

```sh
npm ci
npm run build
npm run package:candidate
```

`npm run package:candidate` (`package-candidate.mjs`) rebuilds the compiled
helper, assembles an explicit allowlist of runtime files under
`dist/ambicode-<version>/`, and writes `dist/ambicode-<version>.inventory.json`
(every shipped file's path, size and SHA-256) and
`dist/ambicode-<version>.zip` with its digest in
`dist/ambicode-<version>.zip.sha256`. The allowlist is: `.claude-plugin/plugin.json`,
`bin/ambicode`, `scripts/ambicode.mjs`, `skills/**/*.md`, `prompts/*.md`,
`policies/**/*.{yaml,md}`, `templates/*.{eta,css}`, `docs/*.md`. It contains
no `node_modules`, no TypeScript source, no `package.json`/lockfile, and no
path specific to the machine that built it — `npm run package:candidate`
fails loudly if any of those checks does not hold.

```sh
npm run package:reproducible
```

Rebuilds the helper and re-assembles the candidate twice, into two
independent temporary directories, and fails if the two runs do not produce
byte-identical files at identical paths.

## Local candidate install (no marketplace)

For testing a candidate before it is published, or for a developer who wants
the exact packaged artifact rather than `--plugin-dir .`:

```sh
mkdir -p /tmp/ambicode-local-marketplace/.claude-plugin
cp -R dist/ambicode-<version> /tmp/ambicode-local-marketplace/ambicode-<version>
cat > /tmp/ambicode-local-marketplace/.claude-plugin/marketplace.json <<'EOF'
{
  "name": "ambicode-team",
  "owner": { "name": "local test" },
  "description": "Local candidate marketplace for isolated install testing.",
  "plugins": [
    { "name": "ambicode", "source": "./ambicode-<version>", "version": "<version>" }
  ]
}
EOF

CLAUDE_CONFIG_DIR=/tmp/ambicode-isolated-claude-config \
  claude plugin marketplace add /tmp/ambicode-local-marketplace
CLAUDE_CONFIG_DIR=/tmp/ambicode-isolated-claude-config \
  claude plugin install ambicode@ambicode-team -s user -y
```

Using a fresh `CLAUDE_CONFIG_DIR` (confirmed in this session to fully
isolate settings, session history and plugin state from the real
`~/.claude`) is what makes this a genuine install test rather than a change
to whoever runs it. `claude --plugin-dir .` is not a substitute: it loads
the live source tree directly and never exercises the packaged artifact,
the allowlist, or the marketplace install path at all.

Verified in this session against exactly this local marketplace and the
0.1.0 candidate:

- `claude plugin marketplace add` and `claude plugin install ambicode@ambicode-team -s user -y` both succeed.
- `claude plugin list` shows `ambicode@ambicode-team`, version matching the candidate, status enabled.
- `claude plugin details ambicode@ambicode-team` reports exactly two skills, `init` and `review` — the `ambicode:init` / `ambicode:review` namespace doc 03 and `docs/compatibility.md` describe, confirmed without a model call.
- `grep -rl "$(pwd)"` (the source repo's own absolute path) and a search for the operator's `$HOME` across the installed cache tree both come back empty: no developer-specific path in the installed files.
- `claude plugin validate <candidate-dir> --strict` passes against the packaged directory itself, not only against the source repository.

## Team installation from the private marketplace (release owner)

**Release owner**, once the artifact is actually hosted and its real digest
is known:

1. Run `npm run package:candidate` (or have CI run it) and take the printed
   SHA-256 of `dist/ambicode-<version>.zip`.
2. Host that exact zip at a URL your organization controls.
3. Edit `marketplace/ambicode-team/.claude-plugin/marketplace.json`: replace
   `source.url` with the real hosted URL and `source.sha256` with the real
   digest. Both are placeholders in the committed file today — no
   organization URL has been invented, per doc 03 P1.7 §3, and the
   placeholder `sha256` is 64 zero characters purely so the file still
   passes schema validation before you fill it in.
4. Publish `marketplace/ambicode-team/` (or a repository containing it) at a
   git URL your team can reach, or host `marketplace.json` directly.
5. Team members run:
   ```text
   /plugin marketplace add <your-marketplace-git-url-or-marketplace.json-url>
   /plugin install ambicode@ambicode-team
   ```
6. Before promoting a candidate, have a second developer install the
   packaged version in a fresh environment and complete the core review
   workflow using only `docs/compatibility.md` and `docs/installation.md` —
   doc 08 requires this and it has not happened yet for this candidate (see
   the acceptance record's outstanding-owners section).

An immutable git source (`source: "github"` or `"url"` with both `ref` and
`sha`, a full 40-character commit) is the alternative to the archive form
above, but only if `scripts/ambicode.mjs` is deliberately committed at that
tag — it is gitignored on every ordinary commit, so an ordinary tag of this
repository does **not** contain a runnable candidate. The archive form
avoids that problem entirely because `package-candidate.mjs` always rebuilds
the helper before zipping it. Pick one; do not ship a git-tag source without
first solving the gitignore mismatch.

## Upgrade

```text
/plugin marketplace update
/plugin update ambicode@ambicode-team
```

or the CLI equivalents `claude plugin marketplace update` /
`claude plugin update ambicode@ambicode-team`. Reopen any review with
`ambicode view --review <id>` after an upgrade rather than assuming an
in-flight review's pinned policy changed; it does not (doc 02, "Storage and
ownership").

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
