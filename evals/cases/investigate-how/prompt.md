---
name: investigate-how
description: 'A how-does-it-work question whose answer spans a service and a route, with keyword decoys in the repository.'
tags: ["investigate"]
runs: 1
max_turns: 12
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-how How is an invoice total computed, and where is it exposed over HTTP? The repository is at `repo/`.
