# Longest bare run: investigate-how (run 3)

score 0.8 · 7 turns · 13s · $0.0539 · peak context 17.4k · failing: answer-cites-service
trace: /Users/KillBill/Documents/projects/mine/ai/ambicode/evals/cases/results/traces/bare/2026-10-12T18-47-11-218Z/investigate-how-3.jsonl

`#n` is a main-session model call, `·` a subagent call, `→` the tool result with the time it took; ⏱ marks 30s or more.

```
 #1   +0s ctx 16.2k Grep: (?i)invoice in /private/tmp/e-x7wPrR/home/cwd/repo
      → 0.1s repo/src/reports/monthly.ts:1 repo/src/routes/invoices.ts:2 repo/src/legacy/invoice-export.ts:2 repo/src/invoices/service.ts:4 repo/src/inv…
 #2   +1s ctx 16.5k Read: /private/tmp/e-x7wPrR/home/cwd/repo/src/invoices/service.ts
      → 0.0s 1 import type { Invoice } from './model.ts'; 2 3 export const total = (invoice: Invoice): number => { 4 if (invoice.amountCents < 0) throw …
    Read: /private/tmp/e-x7wPrR/home/cwd/repo/src/routes/invoices.ts
      → 0.0s 1 import { total } from '../invoices/service.ts'; 2 3 export const invoicesRoute = { path: '/invoices', total, currency: true, tax: true };…
    Read: /private/tmp/e-x7wPrR/home/cwd/repo/src/invoices/model.ts
      → 0.0s 1 export interface Invoice { id: string; amountCents: number; currency: string; taxCents: number } 2
    Read: /private/tmp/e-x7wPrR/home/cwd/repo/src/legacy/invoice-export.ts
      → 0.0s 1 // Retired in 2019; kept so the old invoice export links still resolve. 2 export const legacyInvoiceExport = null; 3
    Read: /private/tmp/e-x7wPrR/home/cwd/repo/src/reports/monthly.ts
      → 0.0s 1 // Totals every invoice of the month, reading the reporting replica. 2 export const monthly = () => 0; 3
 #3   +7s ctx 17.4k says: **Computation:** `total(invoice)` in `src/invoices/service.ts` returns `amountCents + taxCents`, so the result is in ce…
end: success, stop end_turn, 7 turns, 8s, completed
```
