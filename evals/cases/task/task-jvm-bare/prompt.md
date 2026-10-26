---
name: task-jvm-bare
description: 'TrayPlanner divides by trayCapacity, so a capacity of 0 throws ArithmeticException.'
tags: ["task", "bare-request", "jvm"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task sv-capacity --headless iteration 1 TrayPlanner (application/src/main/kotlin/org/seedvault/application/usecase/germination/TrayPlanner.kt) divides by trayCapacity, so a capacity of 0 throws ArithmeticException from traysFor. Refuse a capacity below 1 when the planner is built (require, with a message), and add TrayPlannerTest.kt next to SowLotServiceTest.kt covering it and one normal plan: capacity 10 and 25 seeds give trays T-001 to T-003.
