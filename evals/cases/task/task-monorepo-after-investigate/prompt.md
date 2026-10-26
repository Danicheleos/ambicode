---
name: task-monorepo-after-investigate
description: 'After an investigation: Schedule::new accepts a zero-minute segment that target_at_dc then skips; the change stays in the Rust engine.'
tags: ["task", "seeded", "monorepo", "rust"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task kl-zero --headless iteration 1 Make Schedule::new in the engine refuse a segment of zero minutes with its own ScheduleError variant, as the investigation found it accepted, and cover it in engine/crates/schedule/tests/firing.rs.
