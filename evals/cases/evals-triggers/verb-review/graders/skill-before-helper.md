---
type: tool_order
before:
  tool: Skill
  input_match: '"ambicode:review"'
after:
  tool: Bash
  input_match: 'ambicode(\.mjs\\")? review'
arm: with-only
---
