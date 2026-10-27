---
name: task-monorepo-after-plan
description: 'After a plan: the dashboard checks only targetDc of a segment; the plan adds a positive-integer minutes check that throws SetpointError (422).'
tags: ["task", "seeded", "monorepo", "ts"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

Implement the accepted plan below in this repository: make the changes it lists and add the tests it asks for.

# Validate segment minutes in the dashboard

| requirement | section | code |
| --- | --- | --- |
| a segment lasts a positive whole number of minutes | Iteration 1 | dashboard/src/lib/validate/segments.ts:5-8 |

## Iteration 1: checkSegments refuses bad minutes

*Goal*: POST /firings (dashboard/src/routes/firings.routes.ts:4-7) answers 422 for a segment whose minutes is 0, negative or fractional; today only targetDc is checked, so beginFiring (dashboard/src/services/firings.ts:7-13) sends it on to the engine.

*Changes*:
- dashboard/src/lib/validate/segments.ts:5-8 also throw SetpointError (dashboard/src/lib/engine/errors.ts:1, mapped to 422 in dashboard/src/middleware/errors.ts:5) when `!Number.isInteger(segment.minutes) || segment.minutes < 1`.
- new: dashboard/test/segments.test.ts covers checkSegments for minutes 0, -5 and 1.5 (each throws) and a valid segment (does not).

*Accept*: checkSegments([{ minutes: 0, targetDc: 5000 }]) throws SetpointError; { minutes: 60, targetDc: 5000 } passes.

*Checks*: dashboard unit (npm test in dashboard/).

*Leaves out*: the Rust engine's own checks; dashboard/src/__generated__ is not edited.
