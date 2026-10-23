---
name: investigate-go-parceld-lookup
description: 'Follow a parcel from one binary of a repository to another through the store both use.'
tags: ["investigate", "stack"]
runs: 1
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

/ambicode:investigate --task inv-lookup After `parcelctl PH-7 1200 north` has run, what does a request `GET /parcels/PH-7` to a running parceld answer, and why? Cite `path:line` for each claim. End your answer with a `## Files` section: one path per line, only the files that take part in the answer. The repository is at `repo/`.
