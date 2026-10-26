---
name: plan-mono-calibrate
description: 'A feature across Rust, TypeScript and Python in one repository: protocol message, thermocouple driver, safety limit, dashboard route, client, validation and view, tool export, under the _dc unit convention and the generated-code rule; the engine has no HTTP surface yet.'
tags: ["plan", "huge"]
runs: 1
max_turns: 45
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

/ambicode:plan --task plan-mono-calibrate --headless --answer plan-accept=Accept Apply thermocouple calibration offsets end to end. The Python tool already fits an offset per kiln. The engine should apply a per-kiln offset to thermocouple readings, the dashboard should have an endpoint on the kilns API that validates an offset and passes it to the engine, show it on the kiln page, and the tool should write the offsets as JSON the dashboard can post.
