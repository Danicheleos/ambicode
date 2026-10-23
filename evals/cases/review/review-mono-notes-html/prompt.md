---
name: review-mono-notes-html
description: 'Local review of an uncommitted change on monorepo-rust-ts-kiln.'
tags: ["review"]
runs: 1
max_turns: 20
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:review --task rev-13 --headless --answer estimate=run Cite `path:line` for each claim. The repository is at `repo/`.
