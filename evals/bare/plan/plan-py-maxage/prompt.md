---
name: plan-py-maxage
description: 'Small change through the layers of a Python service: the rule is in domain, the settings in infra, the services dataclass in app, and tests build that dataclass by keyword.'
tags: ["plan", "small"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Write, Skill]
---

Write an implementation plan for this change, in iterations that can each be reviewed alone, and give the plan as your answer; do not implement it. If something is unclear, state your assumptions. The staleness limit is fixed at 45 minutes. Make it configurable through an environment variable, defaulting to 45, so each deployment can set its own. The repository is at `repo/`.
