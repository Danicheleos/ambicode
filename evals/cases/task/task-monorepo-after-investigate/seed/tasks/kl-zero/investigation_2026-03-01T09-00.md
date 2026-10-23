A schedule may hold a zero-minute segment: it is accepted and then never takes effect.

- Schedule::new checks only that the list is not empty and that each target is within limits: engine/crates/schedule/src/plan.rs:31-39. Segment.minutes is a plain u32 (engine/crates/schedule/src/segment.rs:3).
- target_at_dc adds each segment's minutes and returns the first segment whose end is past the minute (engine/crates/schedule/src/plan.rs:45-52); a segment of 0 minutes adds nothing, so it is skipped, and its setpoint is never reached.
- ramp_dc already treats a zero total as an instant jump (engine/crates/schedule/src/ramp/linear.rs:3-5), a sign the case was considered but not refused.
- ScheduleError has Empty and Unsafe (engine/crates/schedule/src/plan.rs:9-12); a new variant needs a Display arm at plan.rs:14-21.
- check_rate_dc exists (engine/crates/safety/src/limits.rs:17-22) and is not called by Schedule::new; wiring it in would reject the built-in glaze profile (6000 to 12400 dC in 60 minutes), so it is a separate decision.
- Tests: engine/crates/schedule/tests/firing.rs:7-27 covers the hot setpoint and glaze targets; nothing covers a zero-minute segment.
