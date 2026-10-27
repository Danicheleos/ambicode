---
status: accepted
---

# Limit loan extensions

| requirement | section | code |
| --- | --- | --- |
| a loan can be extended at most MAX_EXTENSIONS times | Iteration 1 | src/contexts/lending/domain/policy.ts:2 |
| the number of extensions a loan has had | Iteration 1 | new: src/contexts/lending/domain/loan.ts Loan.extensions |

## Iteration 1: count extensions and refuse the third

*Goal*: extendLoan refuses once a loan has been extended MAX_EXTENSIONS times, through the existing canExtend rule.

*Changes*:
- src/contexts/lending/domain/loan.ts:9-15 add `extensions: number` to Loan; createLoan (src/contexts/lending/domain/loan.ts:24-27) starts it at 0.
- src/contexts/lending/application/extend.ts:8-14 return err(domainError('extension-limit', loanId)) when canExtend (src/contexts/lending/domain/policy.ts:4) is false for loan.extensions; otherwise add LOAN_DAYS to dueOn and increment extensions.
- new: test/extend.test.ts covers the first two extensions and the refused third, which leaves dueOn unchanged.

*Accept*: the third extendLoan call returns an error with code `extension-limit`; the first two each add LOAN_DAYS and the stored loan counts them.

*Checks*: unit (test/extend.test.ts).

*Leaves out*: an HTTP route for extending a loan.
