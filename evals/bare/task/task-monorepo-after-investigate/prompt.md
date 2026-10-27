---
name: task-monorepo-after-investigate
description: 'After an investigation: Schedule::new accepts a zero-minute segment that target_at_dc then skips; the change stays in the Rust engine.'
tags: ["task", "seeded", "monorepo", "rust"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

Make Schedule::new in the engine refuse a segment of zero minutes with its own ScheduleError variant, as the investigation found it accepted, and cover it in engine/crates/schedule/tests/firing.rs.

An earlier investigation of this code found the following; build on it.

A schedule may hold a zero-minute segment: it is accepted and then never takes effect.

- Schedule::new checks only that the list is not empty and that each target is within limits: engine/crates/schedule/src/plan.rs:31-39. Segment.minutes is a plain u32 (engine/crates/schedule/src/segment.rs:3).
- target_at_dc adds each segment's minutes and returns the first segment whose end is past the minute (engine/crates/schedule/src/plan.rs:45-52); a segment of 0 minutes adds nothing, so it is skipped, and its setpoint is never reached.
- ramp_dc already treats a zero total as an instant jump (engine/crates/schedule/src/ramp/linear.rs:3-5), a sign the case was considered but not refused.
- ScheduleError has Empty and Unsafe (engine/crates/schedule/src/plan.rs:9-12); a new variant needs a Display arm at plan.rs:14-21.
- check_rate_dc exists (engine/crates/safety/src/limits.rs:17-22) and is not called by Schedule::new; wiring it in would reject the built-in glaze profile (6000 to 12400 dC in 60 minutes), so it is a separate decision.
- Tests: engine/crates/schedule/tests/firing.rs:7-27 covers the hot setpoint and glaze targets; nothing covers a zero-minute segment.
