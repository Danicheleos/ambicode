# Longest plugin run: investigate-how (run 2)

score 1 · 2 model calls · 8.4s session · $0.0618 · peak context 19.7k · failing: none
trace: /Users/KillBill/Documents/projects/mine/ai/ambicode/evals/cases/results/traces/plugin/2026-10-15T08-54-12-998Z/investigate-how-2.jsonl

`#n` is a main-session model call, `·` a subagent call, `→` the tool result with the time it took; ⏱ marks 30s or more.

```
        hook SessionStart: {}
 #1   +0s ctx 19.0k Bash: cd repo 2>/dev/null || cd /private/tmp/e-pmlhRS/home/cwd/repo; for f in src/routes/invoices.ts src/legacy/invoice-export.ts src/invoices/service.ts src/invoice…
      → 0.3s == src/routes/invoices.ts 1 import { total } from '../invoices/service.ts'; 2 3 export const invoicesRoute = { path: '/invoices', total, cu…
 #2   +6s ctx 19.7k says: ## How an invoice total is computed - `total(invoice)` returns `invoice.amountCents + invoice.taxCents`, so the result …
end: success, stop end_turn, 2 turns, 8s, completed
```
