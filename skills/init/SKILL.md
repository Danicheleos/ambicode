---
name: init
description: Set up AMBICODE in this repository — detect projects, write .ambicode/config.yaml, and explain which checks are configured and which are missing. Use when the user asks to set up, initialize, or configure AMBICODE, or when another AMBICODE skill reports that no configuration exists.
---

# Set up AMBICODE

Run the helper and report what it found. The helper does the work; your job is to
read its output back to the user and help them decide what to fill in.

## Steps

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" init`. Add `--dry-run` first if the user wants to see the
   proposal before anything is written.
2. Read the result to the user: which projects were detected, which checks are
   configured, which are missing, and each project's code-intelligence
   recommendation. Explain that the listed official LSP plugin and server are
   optional setup; only the active Claude session can confirm LSP availability.
3. For every missing check, give the notice verbatim. The notices say exactly why
   a slot is null and what to do about it.
4. Stop. Do not edit `.ambicode/config.yaml` yourself unless the user asks for a
   specific change.

## What init will and will not do

It reads `package.json`, `pyproject.toml`, `requirements*.txt`, and looks for
installed executables under `node_modules/.bin`, `.venv/bin`, and
`.venv/Scripts`. It reads the
`scripts` section as evidence about which tools the project uses.

It does **not** run a project script, install a package, or invent a command
line. A tool it cannot find becomes a `null` command with a notice, and a null
command produces a skipped check rather than a guess.

Re-running init is safe. It adds entries that are missing and never overwrites a
value the user has set, including an explicit `null`. Comments in the file
survive.

## Things that will come up

**A check is null even though the tool is installed.** pytest and Playwright
cannot report which tests a change affects. Rather than write a selector that
selects nothing, init leaves the check null and prints a worked `mapping`
example. Offer to add the mapping using the project's real directory layout.

**`npm run test` exists but the check is still null.** AMBICODE runs the runner
directly, because it cannot scope a wrapper to the changed files or ask a wrapper
which tests a change affects. Point the `argv` at `./node_modules/.bin/<tool>`.

**No baseline was recorded.** AMBICODE does not assume a branch is called `main`.
Either set `baseline` in the configuration or pass `--base <ref>` when reviewing
a branch.

**`requirements.mcpServer` is null.** Requirement-based review retrieves Jira and
Confluence content through one bound MCP server, and the helper cannot see which
servers this session has. Look at what is connected:

- exactly one compatible Jira/Confluence server — offer to write its name;
- more than one — **ask the user which one this repository should use**, then
  write that name. Do not choose for them;
- none — leave it null and say that requirement-based review is unavailable
  until a server is connected. Quality review still works.

The name goes under `requirements:` in `.ambicode/config.yaml`:

```yaml
requirements:
  mcpServer: atlassian
```

**Nothing was detected at all.** One project covering the repository root is
written with every command null. That is a working configuration; it simply has
no checks yet.

**Rule sources were reported.** Init lists documents that usually hold written
rules — `CLAUDE.md`, `CONTRIBUTING.md`, `docs`, `.cursor/rules` — when they
exist. It has not read any of them, and rules written in Markdown are not in
effect: AMBICODE resolves policy from YAML packs only. Offer `/ambicode:rules`,
which turns them into scoped packs once, at setup. Do not attempt the migration
yourself here.

## After init

`node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" config` prints the effective values, including the limits that are not
stored in the file. Quote it rather than repeating numbers from memory.
