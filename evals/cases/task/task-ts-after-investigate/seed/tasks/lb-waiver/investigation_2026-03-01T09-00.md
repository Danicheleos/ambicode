A late fee is worked out in one place and invoiced in another; the waiver rule exists but nothing calls it.

- returnItem stamps the return and works the fee out: `lateFee(loan.dueOn, now)` at src/contexts/lending/application/return.ts:13, then publishes `lending.loan-returned` with `feeCents` at src/contexts/lending/application/return.ts:14.
- lateFee is 50 cents per day after the due date, never negative: src/contexts/lending/domain/fees/late.ts:6-7.
- Billing reacts to the event by name and issues the invoice when feeCents > 0: src/contexts/billing/application/on-loan-returned.ts:7-8.
- `waive(fee, reason)` returns a zero fee when the reason is not blank: src/contexts/lending/domain/fees/waiver.ts:3. A grep for `waive` finds no caller, so no return can waive today.
- A waiver therefore belongs between lateFee and the publish in returnItem (return.ts:13-14); billing needs no change because it already skips a zero fee (on-loan-returned.ts:8).
- Tests: test/fees.test.ts covers lateFee only; nothing covers returnItem.
