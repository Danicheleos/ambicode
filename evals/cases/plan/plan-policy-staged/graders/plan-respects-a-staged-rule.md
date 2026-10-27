---
type: llm
focus: { source: file, path: .ambicode/tasks/rpl-1/plan.md }
weight: 2
---

The plan answers a request to refuse payments of zero or negative cents. The policy staged for planning included: common-design/scope (stay within what was asked, say what is left out), common-design/reuse-before-reimplementing (reuse existing helpers) and common-design/need (justify any new surface).
PASS only if the plan visibly applies at least one of them: it names a rule id, or it keeps to the one guard in applyPayment and lists what it leaves out, or it reuses the existing findInvoice/saveInvoice instead of adding new modules.
FAIL if it adds unrelated features or new layers without saying why.
