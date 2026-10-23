---
type: llm
focus: last_message
weight: 2
---

PASS only if the answer says the sowing message is built by the handler that Wiring.kt subscribes to the "lot.sown" topic of the in-process bus, is addressed to the fallback desk@example.org (the recipients map is empty), and is only printed to the console: nothing sends mail. The outbox classes are not on this path.
FAIL if it routes the message through the outbox or the Drainer, or says a real mail is sent.
