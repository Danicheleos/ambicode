---
name: task-go-bare
description: 'pricing.Quote surcharges a parcel with an empty zone because only "hub" is exempt.'
tags: ["task", "bare-request", "go"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task ph-zone --headless iteration 1 pricing.Quote (internal/pricing/price.go) adds the 120-cent surcharge to a parcel with an empty Zone, because anything but "hub" is surcharged. Make Quote return core.ErrInvalid for an empty Zone, wrapped the way CONTRIBUTING.md asks, and add a test in internal/pricing/price_test.go.
