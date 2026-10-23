---
name: task-go-after-investigate
description: 'After an investigation: tracking.Advance accepts any state after Delivered; IsDelivered exists in the package and the clock is injected.'
tags: ["task", "seeded", "go"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task ph-advance --headless iteration 1 Make tracking.Advance refuse a parcel that is already delivered, reusing what the investigation found, and test it in internal/tracking/tracking_test.go. The repository is at `repo/`.
