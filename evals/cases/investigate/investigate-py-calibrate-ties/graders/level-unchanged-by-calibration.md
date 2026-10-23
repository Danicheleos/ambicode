---
type: llm
focus: last_message
weight: 2
---

PASS if the answer states, in any wording, that current_level still reports 1000 mm, the uncorrected value, and why: calibrate adds a corrected copy of each reading to the store (store.add appends, it does not replace the old one) with the same taken_at, and latest_reading takes the newest by taken_at, where max() keeps the first of equal keys, which is the original. "The calibrated 1020 never wins the tie" or "the old row is returned first" count.
FAIL if it says the level becomes 1020 (or any calibrated value), or says the call fails (unknown gauge, stale reading, window), or explains 1000 by something other than the equal timestamps.
