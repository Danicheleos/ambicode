---
type: llm
focus: last_message
weight: 2
---

PASS if the answer states, in any wording, all three:
- The first line is "PH-7 | zone north | 1200g | bay 0": the bay is 0 because parcelctl builds the Parcel from its arguments only and nothing assigns a bay (the depot's BayFor and Planner are not called by parcelctl).
- The zone printed is the argument as typed ("north"); the routing package is not used to derive it.
- The second line is price 7.40: 620 cents for the band up to 2000 g plus the 120 cent surcharge for a zone other than hub.
FAIL if it says the bay is a number from 1 to 12 worked out by the depot, says the zone is derived from a postcode by routing, or gives a price other than 7.40.
