Judge the repository from the scan below and write the proposal.
- Reply with it as YAML inside one ```yaml block: `projects` is a list; each has id (kebab-case), root (repo-relative, "." for the top), ecosystem (free text), shortlist (globs of source files, tests excluded), commands {test, lint, typecheck, format}, each an argv list or null, and packs (ids from the scan). `requirements.mcpServer` is the Jira or Confluence MCP server you can see, or null.
- A command is an executable plus arguments, never a shell string; `{files}` stands alone as an argument where the tool takes files. Take it from the package scripts and the tools in the scan. Use null for what you cannot find; invent nothing.
- One project per root with its own manifest.
- Then run it with the same YAML on standard input:
{cli} init propose --task {task} <<'EOF'
<the YAML>
EOF
If a section below reports a bad field, fix that field and run it again.
