---
name: task-app-checks-fail-first
description: 'A third aging bucket makes existing expectations (the 60+ label) obsolete: the first check run of the related tests can fail, and the run must end with those tests updated and green.'
tags: ["task", "failing-checks", "task-tune"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task aging-bucket --headless iteration 1 Add a third aging bucket: invoices 61 to 90 days old are labelled 61-90 and older ones 90+, so the boundaries are 30, 60 and 90 days. Keep the whole suite green.
