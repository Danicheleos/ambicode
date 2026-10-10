Write the whole `.ambicode/config.yaml` from the scan below.
- If the scan says a config is present, read it first and keep every value the user set; add only what is missing. If a `change` section is listed, apply exactly that change to your last proposal.
- Shape (schemaVersion 3, nothing else is accepted): `baseline` is the scan's baseline; `review: {model: sonnet, timeoutSeconds: 300, maxFindings: null, maxChangedFiles: null, maxChangedLines: null, maxContextBytes: null}`; `checks: {timeoutSeconds: 120, maxSelectedTestFiles: 20}`; `requirements: {mcpServer: <Jira/Confluence MCP server, or null>}`; `projects`: one per manifest root.
- A project has `id` (kebab-case), `root` (repo-relative, "." for the top), `ecosystem` (free text), `packs` (ids from the scan), `shortlist: {include: [source globs], exclude: [test globs]}`, `commands` and `checks`.
- `commands` maps a slot (lint, unit, typecheck, e2e, format) to `{argv: [...]}` or null. A command is an executable plus arguments, not a shell string; `{files}` stands alone as an argument for tools that take files. Take it from the scan; null when absent, invent nothing.
- `checks` maps lint and unit to `{command: <slot>, adapter: <tool name>}` or null. The adapter names the tool the command runs.
- Then run it with the same YAML on standard input:
{cli} init propose --task {task} <<'EOF'
<the YAML>
EOF
If a section below reports a bad field, fix it and run again.
