---
name: plan-jvm-chill
description: 'A feature across all seven Gradle subprojects: domain rule and field, a new event the exhaustive topic mapping must cover, the file codec, use case and input port, mail, REST, CLI and the bootstrap wiring, under the Outcome.Rejected and value-class rules.'
tags: ["plan", "huge"]
runs: 1
max_turns: 45
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

/ambicode:plan --task plan-jvm-chill --headless --answer plan-accept=Accept Seeds of species with dormancy must be chilled before they can be sown. Add a chill step: a banked lot is marked as chilled on a date; sowing is rejected until the species' chill days have passed since that date; the chill date survives a restart; the desk is mailed when a lot is chilled, as it is for sowing; and chilling is available over REST and from the CLI.
