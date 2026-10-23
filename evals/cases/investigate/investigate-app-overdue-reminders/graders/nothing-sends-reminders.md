---
type: llm
focus: last_message
weight: 2
---

PASS if the answer states, in any wording, that this repository has no overdue-reminder job or sender: no code mails customers about overdue invoices and no scheduler triggers one (the overdueReminders flag in src/flags.js exists, is off by default and is read by no code). "There is no reminder job", "the feature does not exist", "nothing sends overdue reminders" all count. Mentioning the flag, the aging report or the queue's "scheduled job" comment as nearby things is fine, as are statements about what was not searched.
FAIL if it names a file or function as what sends overdue reminders, states a number of days after which a reminder goes out (the aging buckets are not a reminder schedule), or describes a reminder feature as existing, or answers from general knowledge instead of this repository's code.
