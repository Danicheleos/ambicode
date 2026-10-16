---
type: llm
focus: last_message
weight: 2
---

PASS if the final message summarises the projects found, the checks found and missing, and the context files written, and reports that config validate passed (or lists its errors).
FAIL if it reports success without naming the checks, or claims validation passed while also showing validation errors.
