---
name: plan-ts-reserve
description: 'A feature across contexts: a new queue, the return flow, the borrow flow, notifications, persistence tables and the composition root, under the context-boundary and event-name rules.'
tags: ["plan", "huge"]
runs: 1
max_turns: 45
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill]
---

/ambicode:plan --task plan-ts-reserve --headless --answer plan-accept=Accept Members should be able to reserve a tool that is out on loan. Reservations queue per tool, first come first served. When the loan comes back the first member in the queue is notified and the tool is held for them for two days; if they do not borrow it by then, the next member is told. A member can cancel a reservation and see their place in the queue.
