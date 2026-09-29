# Running AMBICODE from Codex

Codex does not promise `CLAUDE_PLUGIN_ROOT` in skill shell commands. Resolve the
absolute plugin root from the installed skill file you are reading: go up two
directories from `skills/<skill-name>/SKILL.md`. Use that absolute root in every
example that shows `${CLAUDE_PLUGIN_ROOT}`. Do not use the product repository
root or a checkout of AMBICODE unless that is the installed plugin.

For `ambicode review`, pass `--reviewer codex`. The configured Codex review model
is `review.codexModel`; the default is `gpt-6-sol`. Codex's read-only reviewer
can read beyond its snapshot, so report the review's isolation gap as printed.
For `ambicode init`, pass `--host codex` to show Codex navigation guidance.

Codex tool approval and permissions remain in force for skill work. A command
waiting for an explicit AMBICODE check authorization still needs `--approve`
or `--decline` on its next invocation.
