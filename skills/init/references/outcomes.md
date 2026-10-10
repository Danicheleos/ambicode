# Init outcomes

**`init-proposal-invalid`.** `init propose` refused your YAML and named the problem (a
config schema field, or `yaml`). Fix it and run it again; the detect step allows three tries.
Only the config schema is checked: a command's executable and a pack id are your judgment,
and the step after `init --apply` has you run each command with `--version` to show what does not run.

**`init-unconfirmed`.** `init --apply` needs the user's own answer to the init question.
Nothing was written. Ask the question again; do not edit the config yourself.
