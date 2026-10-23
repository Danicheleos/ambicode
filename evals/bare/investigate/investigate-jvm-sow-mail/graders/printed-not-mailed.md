---
type: llm
focus: last_message
weight: 2
---

PASS if the answer states, in any wording, all three:
- The sowing message is built by the handler that Wiring.kt subscribes to the "lot.sown" topic of the in-process bus (SowLotService publishes LotSown).
- It is addressed to the fallback desk@example.org, because the recipients map is empty.
- It is only printed to the console: no mail is sent.
Saying the outbox classes are not on this path, or that they were not read or not confirmed, is fine.
FAIL if it routes the message through the outbox or the Drainer, says a real mail is sent, or names another recipient.
