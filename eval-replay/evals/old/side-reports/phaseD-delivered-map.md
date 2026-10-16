# Phase D — delivered map contract, 2026-10-08

## Changes
- `map.ts`:
  - `MapResult.ranked` is the full rank order.
  - `leadsOf()` takes the leads from the ranking, not from the 6 KiB serialized `candidates`.
  - Over the 1,200 B budget, the term list shortens first (`(+N more)`, at least 2 terms kept), then reasons drop from the last lead up, and only then do leads drop.
  - The `tuning:` line now counts inside the budget.
  - `leadsOf` returns the text plus the delivered paths, the bytes and a hash. `leadsText` is its text.
- The `search.map` handler appends `delivered: {leads, feature, bytes, hash}` and `serialized` (candidates kept by the 6 KiB text) to the `map` entry. The ledger schema allows both.
- `layer-audit`:
  - Uses the receipt when no session was harvested.
  - Reports a problem when the step text and the receipt disagree.
- `map-recall`: adds ranked-20 and serialized-20 true counts, macro recall of the ranking vs the delivered map, and the number of cases delivered no true file.

## Offline measure (20 core investigate cases, free)
```
                    true delivered  zero-truth cases  macro delivered  ranked20 macro
before              24/442          9/20              0.155            0.203
after               28/442          8/20              0.162            0.203
truth in ranked top 8 -> shown:  before 21 -> 17,  after 21 -> 21
```
Per case, these changed (`--expect` against before: no case lost a true file, no text over its cap):
```
be-vs-5973  true 4 -> 5   leads 5 -> 8
fe-vs-5967  true 4 -> 6   leads 6 -> 8
fe-vs-6406  true 0 -> 1   leads 5 -> 8
fe-vs-3571, fe-vs-438, fe-vs-5948, fe-vs-6141: leads 5-7 -> 8, no truth change
```

## Bundle probe
`route start investigate` (code only) on the fe-vs-6141 repo with a short request recorded `candidates 26, serialized 0`. The 6 KiB text kept no candidate, so before this change the model would have received no leads. It now gets 8 (`delivered.bytes 1158`).

## Still limiting, not in scope
- Ranking: ranked-20 macro recall is 0.203, and 8 cases have no true file even in the top 20.
- 17/20 maps carry eval-wrapper words as terms (`creations/deletions`, `repository-relative`, `pre-change`). They come from the case prompt's instruction paragraph, which reaches term ranking. No lead in the 20 maps matched them, but they take term slots and header room.

## Tests
- search: 49 tests (03b-M4 updated to the new priority, plus 1 new).
- investigate route: receipt == payload bytes and hash.
- layer-audit: 6 tests.
- Targeted src suites: 785/786. 05-B1 fails, and it also failed at HEAD.
- evals: 366/366.
- typecheck clean, build ok.

## Prompt-word leak (follow-up, 2026-10-08)
Cause: the case prompt's framing text reaches `rankTerms`. In the 20 delivered maps, 17 carried `creations/deletions`, 16 `repository-relative` and 15 `pre-change` as terms. The four maps built from prose (no identifiers in the ticket) carried `Investigate, Read, relevant, editing, Explain`.
Fix (`map.ts`): the request-word list gains `investigate, read, relevant, editing, explain, relative, creation(s), deletion(s), pre, distinguish, existing, proposed, bullet, cite, evidence, assumptions`. A hyphen or slash compound whose parts are all request words is one too. A test failed first, then passed: `read-only` and `CartService` stay terms.

```
                       true delivered  macro delivered  ranked20 true  zero-truth cases
before leak fix        28/442          0.162            40             8/20
compounds + 8 words    32/442          0.194            48             9/20
+ 8 more (this fix)    35/442          0.221            47             7/20
+ snapshot, explicit   34/442          0.209            46             7/20   (reverted)
```
Per case vs before the fix: won 5071 (+2), 5721 (+2), 5928 (+3 net), 6404 (+1 net); lost 6015 (Report.ts) and 5928's mocks file. The framing's second paragraph (`snapshot, commands, working, directory`) and the words `request, code, role, path, mark` still reach the prose retry. Adding them did not help, so the list stops here.
