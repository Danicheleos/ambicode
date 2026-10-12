# Longest plugin run: investigate-how (run 1)

score 1 · 7 turns · 20s · $0.0731 · peak context 21.2k · failing: none
trace: /Users/KillBill/Documents/projects/mine/ai/ambicode/evals/cases/results/traces/plugin/investigate-how-1.jsonl

`#n` is a main-session model call, `·` a subagent call, `→` the tool result with the time it took; ⏱ marks 30s or more.

```
        hook SessionStart: {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"# AMBICODE operating contract\n\nThis sectio…
 #1   +0s ctx 20.0k Read: /private/tmp/e-JimgyF/home/cwd/repo/src/invoices/service.ts
      → 0.0s 1 import type { Invoice } from './model.ts'; 2 3 export const total = (invoice: Invoice): number => { 4 if (invoice.amountCents < 0) throw …
    Read: /private/tmp/e-JimgyF/home/cwd/repo/src/routes/invoices.ts
      → 0.0s 1 import { total } from '../invoices/service.ts'; 2 3 export const invoicesRoute = { path: '/invoices', total, currency: true, tax: true };…
    Read: /private/tmp/e-JimgyF/home/cwd/repo/src/invoices/model.ts
      → 0.0s 1 export interface Invoice { id: string; amountCents: number; currency: string; taxCents: number } 2
    Read: /private/tmp/e-JimgyF/home/cwd/repo/src/legacy/invoice-export.ts
      → 0.0s 1 // Retired in 2019; kept so the old invoice export links still resolve. 2 export const legacyInvoiceExport = null; 3
    Read: /private/tmp/e-JimgyF/home/cwd/repo/src/reports/monthly.ts
      → 0.0s 1 // Totals every invoice of the month, reading the reporting replica. 2 export const monthly = () => 0; 3
 #2   +3s ctx 20.9k Bash: node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" note save --task inv-how --kind investigation <<'EOF' Total = amountCents + tax…
      → 0.6s Saved investigation note: .ambicode/tasks/inv-how/investigation_2026-10-12T16-16.md [ambicode] investigate · task inv-how · complete The ro…
 #3   +8s ctx 21.2k says: An invoice total is `amountCents + taxCents`, and it is exposed over HTTP by a route object at `/invoices`. **Computati…
end: success, stop end_turn, 7 turns, 11s, completed
```
