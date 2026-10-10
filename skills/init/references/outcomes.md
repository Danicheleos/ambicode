# Init outcomes

**Scaffold exit 2.** The JSON `error` says why: not a git repository, or the working directory is not the git root. Nothing was written. Tell the user to run `/ambicode:init` from the repository root.

**`configExisted: true`.** The scaffold left the existing config alone. Refresh keeps the user's manual edits and their `manual` rules; abort stops.

**`config validate` errors.** Each line names a field and the expected shape (`projects.0.checks.test.file: must contain {file}`). Fix exactly those fields with one corrective Write and validate once more. If it still fails, show the remaining errors; do not loop.

**Scout problems.** The scout's report lists `check.problems` it could not fix (file too large, total too large, duplicate heading, code fence, bad path). The context is then partial or absent: say so in the summary and name the problems. Never write context files yourself; `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" context list` shows what exists. If the scout returned nothing, take `paths`, `include` and `exclude` from the manifests and say they are unverified.
