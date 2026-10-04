# Backlog: deferred by the user, with entry conditions

Nothing here is in v3's build or measurement plan. Each item names what must be true before it is
reopened, so it is not reopened by habit.

| Item | What it was in v2 | Why deferred | Entry condition | What is already known |
|---|---|---|---|---|
| **LSP tool in `task`** (passive diagnostics after `Edit`) | 10 §1 L6, 24 §LSP, probe P36 | D8: the user wants no LSP of any kind until the skills show good results without it | investigate passes 33 §1–2 **and** the task suite shows a gain or an inconclusive band the user accepts; then probe P36 (does the plugin push diagnostics?) | the LSP tool's first `findReferences` under-reports for 5–11 s (M9); the model makes ≤ 1 LSP call when told (M8) |
| **Exact references by a TypeScript language-service child** (`refs --exact`) | 10 §1 L4, 16 §6, 24 step 4, 25 step 5; P11, P13 | D8 (a language service is "LSP" for this purpose); review-v2 #63 | the colliding-name impact cases (33 §3) show the plugin arm losing with collision flags alone | measured 2026-10-03 (unlogged re-run): first query 0.7 s BE / 2.4 s FE, second 10 / 48 ms, RSS 368 / 777 MB; one child per call, all names per call; cap 3,000 `.ts/.tsx` |
| **`ExitPlanMode` as a plan-acceptance channel** | 23 step 9, P2's second half | D12 (5c): the draft is saved first anyway; the channel needs an unverified hook payload and a plan-mode write probe | a user asks for plan mode, or 33 §4's traces show `AskUserQuestion` acceptance is a bottleneck | needs `PostToolUse(ExitPlanMode)` in the matrix and the question whether `Write` to `steps/plan-body.md` is allowed while plan mode is on (#56) |
| **Recorder of model reads** (`PostToolUse(Read\|Grep\|Glob)` + a Bash matcher) | v1 13 §5 | review-v1 #18: it would miss Bash reads (M7) and label the line complete | a measurement needs the model's reads (e.g. to explain a recall loss) | needs the structural parser to resolve `cat`/`sed` targets |
| **Scout, collector, plan-judge workers** | 17 appendix | review-v1 #32; P21 unprobed; the plan eval has not run | 33 §4 points at context or cost; P21 probed | the collector is the only mechanism that keeps JQL payloads out of context (#47) |
| **agentmap adapter** | v1 10 §3 | `relates` returned 65 of 179 importers with no truncation flag (P14) | someone investigates the gap | measured: cold 1.2/1.3/6.1 s, relates 115/199 ms (logged) |
| **`claude plugin list` for LSP advice in `init`** | v2 20 step 1, P24 | no LSP in v3 | with the LSP item | availability per environment unknown |
| **`PostToolUse(Edit\|Write)` reminder hook** | v1 30 §1 | inert until a pack sets `remindOnEdit` (G18); 89–143 ms per edit | a pack sets `remindOnEdit` | — |
| **`budget.codeCalls`**, interactive `wallMinutes` | v1 12 §5 | measured nothing (review-v1 #33) | **none: dropped** — listed only so the names are not reinvented (#100) | — |

## How an item leaves the backlog

The entry condition is met and written down with its number; the item gets a measurement in 33 with
a decision point; the user approves the spend; it returns to the version's main files. Backlog items
are not referenced by route files or config.
