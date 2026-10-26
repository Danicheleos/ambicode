---
name: plan-py-maxage
description: 'Small change through the layers of a Python service: the rule is in domain, the settings in infra, the services dataclass in app, and tests build that dataclass by keyword.'
tags: ["plan", "small"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

/ambicode:plan --task plan-py-maxage --headless --answer plan-accept=Accept The staleness limit is fixed at 45 minutes. Make it configurable through an environment variable, defaulting to 45, so each deployment can set its own.
