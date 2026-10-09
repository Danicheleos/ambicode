# Init outcomes

**`init-proposal-invalid`.** `init propose` refused your YAML and named the field
(`projects.0.packs`, `projects.1.root`, `projects.0.commands.lint`, `yaml`). Fix that
field and run it again; the detect step allows three tries. A pack id must be one the
scan lists, a root must exist, and a command's executable must be on PATH or in
`node_modules/.bin`; use `null` for a tool that is not installed.

**`config-unparsable`.** The existing config is not valid YAML. The route asks whether to
back it up and regenerate; answer only what the user says.

**`init-unconfirmed`.** `init --apply` needs the user's own answer to the init question.
Nothing was written. Ask the question again; do not edit the config yourself.
