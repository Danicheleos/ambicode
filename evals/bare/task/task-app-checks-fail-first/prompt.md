---
name: task-app-checks-fail-first
description: 'A third aging bucket makes existing expectations (the 60+ label) obsolete: the first check run of the related tests can fail, and the run must end with those tests updated and green.'
tags: ["task", "failing-checks"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

Add a third aging bucket: invoices 61 to 90 days old are labelled 61-90 and older ones 90+. config.agingBucketsDays becomes [30, 60, 90], bucketFor in src/reports/aging.js follows it, and every test that still expects the old 60+ label is brought in line. The repository is at `repo/`.
