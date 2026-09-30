# Codex integration

AMBICODE works in local Codex CLI and Codex in the ChatGPT desktop app. The
installed plugin needs Node.js 24 or newer and Claude Code CLI for independent
reviews. The GitHub repository and marketplace are private; installers need
SSH read access to `Danicheleos/ambicode`.

## Install

```sh
codex plugin marketplace add git@github.com:Danicheleos/ambicode.git --ref codex
codex plugin add ambicode@ambicode-private
```

Start a new Codex session after installing. Review and trust the plugin's
local hooks when Codex asks. To refresh a release, run
`codex plugin marketplace upgrade ambicode-private`, then reinstall AMBICODE
and start another session.

The marketplace catalog on `codex` points to an immutable packaged-plugin tag.
The tag contains the built `scripts/` helper, which the source branch does not
track. Installing directly from the source branch leaves the plugin incomplete.

## Use

Invoke an AMBICODE skill for setup, investigation, planning, implementation,
rules, or review. Codex reads the same AMBICODE skills and uses the same helper
and Claude Code reviewer as a Claude session. The
reviewer reads only AMBICODE's sanitized snapshot. Codex edit reminders
recognize file paths in successful `apply_patch` calls;
edits made through arbitrary shell commands do not have a reliable path in
the hook payload and are not covered by those reminders.

## Release

Run `npm run verify`, `npm run package:reproducible`, and
`npm run smoke:candidate`. Publish the contents of `dist/ambicode-<version>/`
at the root of a new immutable `ambicode-plugin-v<version>` tag on a dedicated
distribution commit in this same private GitHub repository. Update
`.agents/plugins/marketplace.json` on `codex` to point at that tag. Never tag
the source checkout: `scripts/` is ignored there. Keep `package.json`,
`.codex-plugin/plugin.json`, and `.claude-plugin/plugin.json`
at the same version.
