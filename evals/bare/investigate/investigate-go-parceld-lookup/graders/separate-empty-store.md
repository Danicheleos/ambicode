---
type: llm
focus: last_message
weight: 2
---

PASS if the answer states, in any wording, that parceld answers 404 "no such parcel", because parceld builds its own in-memory store (memstore.New in buildHandler), nothing seeds it and no route writes to it, while the parcel parcelctl seeded lived in the store of another process that has already exited: no store is shared or persisted between the two.
FAIL if it says the request returns the parcel (200), says parcelctl and parceld share a store, or explains the 404 by tag validation, retention or expiry.
