# Longest plugin run: investigate-how (run 1)

score 0.78 · 7 turns · 22s · $0.0870 · peak context 24.1k · failing: citations-valid, route-done
trace: /Users/KillBill/Documents/projects/mine/ai/ambicode/evals/cases/results/traces/plugin/2026-10-12T18-45-58-015Z/investigate-how-1.jsonl

`#n` is a main-session model call, `·` a subagent call, `→` the tool result with the time it took; ⏱ marks 30s or more.

```
        hook SessionStart: {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"# AMBICODE operating contract\n\nThis sectio…
 #1   +0s ctx 20.0k Read: /private/tmp/e-bP9aof/home/cwd/repo/src/invoices/service.ts
      → 0.0s 1 import type { Invoice } from './model.ts'; 2 3 export const total = (invoice: Invoice): number => { 4 if (invoice.amountCents < 0) throw …
    Read: /private/tmp/e-bP9aof/home/cwd/repo/src/routes/invoices.ts
      → 0.0s 1 import { total } from '../invoices/service.ts'; 2 3 export const invoicesRoute = { path: '/invoices', total, currency: true, tax: true };…
    Read: /private/tmp/e-bP9aof/home/cwd/repo/src/invoices/model.ts
      → 0.0s 1 export interface Invoice { id: string; amountCents: number; currency: string; taxCents: number } 2
    Read: /private/tmp/e-bP9aof/home/cwd/repo/src/legacy/invoice-export.ts
      → 0.0s 1 // Retired in 2019; kept so the old invoice export links still resolve. 2 export const legacyInvoiceExport = null; 3
    Read: /private/tmp/e-bP9aof/home/cwd/repo/src/reports/monthly.ts
      → 0.0s 1 // Totals every invoice of the month, reading the reporting replica. 2 export const monthly = () => 0; 3
 #2   +2s ctx 20.9k says: Next the route step requires saving the note.
    Bash: node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" note save --task inv-how --kind investigation <<'EOF' ## Answer **Computation.*…
      → 0.5s Saved investigation note: .ambicode/tasks/inv-how/investigation_2026-10-12T20-46.md [ambicode] investigate · task inv-how · step read (4/5)…
 #3  +14s ctx 24.1k says: An invoice total is `amountCents + taxCents`, and the `/invoices` route object carries that function. I did not find th…
end: success, stop end_turn, 7 turns, 16s, completed
```
