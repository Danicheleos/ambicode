# Init outcomes

**Scaffold exit 2.** The JSON `error` says why: not a git repository, or the working directory is not the git root. Nothing was written. Tell the user to run `/ambicode:init` from the repository root.

**`configExisted: true`.** The scaffold left the existing config alone. Refresh keeps the user's manual edits and the packs in `policyFiles`, including edited built-in copies in `.ambicode/policies/`; abort stops. A config that still has a `rules` key or an older `schemaVersion` is refused by `config validate`: move the rules into drafts and write the config again.

**`config validate` errors.** Each line names a field and the expected shape (`projects.0.checks.test.file: must contain {file}`). Fix exactly those fields with one corrective Write and validate once more. If it still fails, show the remaining errors; do not loop.

**Scout returned nothing.** Take `paths`, `include` and `exclude` from the manifests and say they are unverified.
