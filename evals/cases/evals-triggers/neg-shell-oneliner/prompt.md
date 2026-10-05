---
name: neg-shell-oneliner
description: "a small shell task that mentions the repository"
tags: ["trigger", "dev"]
runs: 3
max_turns: 4
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Bash, Skill]
---

Give me a shell one-liner that counts the lines of all .ts files under the directory `repo/`. Just print the command.
