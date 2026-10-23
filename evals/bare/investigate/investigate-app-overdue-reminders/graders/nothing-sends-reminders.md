---
type: llm
focus: last_message
weight: 2
---

PASS only if the answer says no code sends overdue reminders: the overdueReminders flag in src/flags.js is defined (off by default) and nothing reads it, and there is no job or scheduler. It may mention the aging report as the nearest existing thing.
FAIL if it names a file or function as the reminder sender, gives a number of days (the aging buckets are not a reminder schedule), or answers from general knowledge as if it were this repository's code.
