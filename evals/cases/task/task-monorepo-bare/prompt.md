---
name: task-monorepo-bare
description: 'offset_dc of an empty log divides by zero in mean(); the change is in the Python tools project only.'
tags: ["task", "bare-request", "monorepo", "py"]
runs: 1
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Bash, Edit, Write, Skill, Agent]
---

/ambicode:task --task kl-offset --headless iteration 1 In the Python tools, offset_dc (tools/src/kilnlab/calibration/fit.py) raises ZeroDivisionError on an empty list of pairs. Raise ValueError('no calibration pairs') instead, and add a test in tools/tests/test_calibration.py. The repository is at `repo/`.
