# plan-reuse: option A (regenerate scout context) vs option B (reword sweep) (2026-10-15)

Recommendation: B first, alone. A is not rejected but is unsupported by the traces and not cheap to isolate. Evidence is from the same 21 plan-reuse traces as 2026-10-15-plan-reuse-validaterange.md.

## 1. Delivery path

- `context.list` (src/skills/common.ts:105) sends only a listing: `path  H1  ~tokens` per file, plus "Read the notes of the modules the change touches and of modules whose helpers other code reuses (shared, common)." Note contents are never in the payload. The design step payload is `[map, policy:before-work, context.list]` (routes/plan/plan.yaml). The model must open notes itself.
- Per-run scan of the 21 traces (Read/Bash inputs naming .ambicode/context):

```
                         shared.md read   range.js read
7 misses                 3 of 7           0 of 7
  4 early (10-12)        0 of 4 (no context notes read at all)
  3 refs-era (10-14/15)  3 of 3 (21-42 r2, 23-04 r3, 06-21 r3)
14 hits                  9 of 14 (all 10-14+ hits; the 5 hits from 10-12 read none)  range.js 14 of 14
```

- So in every refs-era miss the model did read the note that lists `validateRange` and still did not open range.js. 06-21 r3 also read CONTRIBUTING.md, which names `validateRange` and says "Do not write a new date, range or amount check in a service" (fixtures/app-medium.mjs:20), and it still wrote a new `validateNotBefore`. A name in front of the model was not enough; the model did not map "date not before issue date" onto it.
- The 4 early misses never read any note, so neither option A nor a note-based fix could reach them. Only B (or the refs-era wording) acts without a note read.

## 2. Option A fidelity (hand-written expected line)

Scout rule (agents/scout.md, templates/context-format.md): `- <path> - <name>(args): <what it does>`, "one bullet per exported name, at most 8 per file, skip test files; the signature alone when the name already says what it does", names from the Grep line, "most-used names first and drop the rest rather than exceed the file limit".

Expected line for validateRange (name says what it does, so signature only):

```
- src/shared/validation/range.js - validateRange(value, { min, max } = {}, field)
```

Possibly `...: bound a number or day` if the scout judges the name unclear; the rule does not require it. Problems:

- The signature shows min/max but not that it works on YYYY-MM-DD strings (that fact is only the comment at range.js:3). The model's need was "a date must not precede another date"; `{ min }` on a day is the mapping it failed to make with the bare name. Not shown to be closed by the signature.
- Not guaranteed to appear: shared has 26 fixture files and about 35 exported names; the cap is 8 bullets per note. The current hand-written note uses one bullet per file with `items:`. A regenerated note drops names or files. validateRange is used 6+ times in src, so "most-used first" likely keeps it, but that is a guess (unverified).
- Size is not the limit: shared.md is about 1.4k chars; maxFileTokens is 2500 tokens (10000 chars), maxTotalTokens 24000.
- A also only helps runs that read shared.md (9 of 14 hits and 3 of 3 refs-era misses).

## 3. How fixtures/contexts are produced

- `fixtures/contexts/ts-app-medium.md` (8031 chars) is a committed file, replayed by `fixtures/materialize.mjs --context` through `context write --replace` (the CLI's own limits apply). No generator exists: grep of tools/, evals/scripts, fixtures/, package.json finds no producer. git history: one commit (001b7bac). The README calls it "standing in for the scout". It is in the protected list (optimization-status.md:143).
- Not deterministic without a model: the scout is a sonnet agent. Regeneration = one scout run on the ts-app-medium scaffold (`/ambicode:init` or the scout step of init-auto). init-auto history shows $0.17-0.18 per run including the scout (ts-feature-boundary, not ts-app-medium; so about $0.2 is an estimate). The output varies by run, so a one-off sample would be hand-reviewed before replacing the file.
- A also changes the fixture for 8 of 17 cases, so any adoption needs those re-baselined.

## 4. Option B cost (traces)

- range.js is 498 chars (about 125 tokens). The whole validation dir is 3.9k chars; all of src/shared is 13.5k chars.
- Refs-era misses already read date.js and index.js and ran `ls`/refs on shared/validation. B adds about 1 Read of 125 tokens, or reading the dir's 7 files if followed literally (about 1000 tokens).
- Hits and misses cost the same: mean $0.191 (14 hits) vs $0.190 (7 misses). Tool calls: hits 5-12, misses 6-17. The two long runs (16-17 calls) are misses, so reading range.js early may even save calls.
- Generalization: "the shared module that holds that kind of helper" is language-agnostic text. Weakness: in a real repo the module can be large; read all files could cost thousands of tokens. The wording should say "files named for that kind of helper" or list the module dir first. The sweep is keyed to the kind of piece, which is the failure shown (no known name).
- design.md is 1499 of 1500 chars; the new bullet is about equal length and requires trimming "Reuse over new" or the Weigh bullet to fit. Not tested here.

## 5. Real-use relevance

- B applies to every plan in every repo, costs nothing at init, and acts even if the model skips notes (4 of 7 misses). It carries the same risk as any reuse step text: it nudges reads, so token cost grows with module size.
- A improves the scout output for every repo at init, but the scout cap of 8 bullets per module makes large shared modules lossy, and it only helps the runs that open the note. The purpose-line idea has support in the E6 design but no trace evidence here; the one clean test, 3 refs-era misses that read the name and still failed, suggests name plus signature is not enough.
- A real repo's note is generated by the current scout anyway, so A matters for production but not as a fix for this bench.

## Confirmation run (paid; ask first)

- Chosen option B: build (npm run build), then plan-reuse x5 at plugin arm (drift tier). Expected about 5 x $0.19 = about $0.95. Compare to baseline 3 of 13 misses (refs era) / 7 of 21 overall.
- Metrics: (a) runs opening range.js (grep traces), (b) plans reusing validateRange (plan-body.md), (c) plan-quality, (d) cost and tool calls per run vs $0.19 and 9.
- Reject B if: any 2 of 5 miss (rate no better than 3/13 = 23% at this n; 2 of 5 is 40%), or range.js is opened but a new validator is still written (then reading is not the cause), or mean cost rises over about $0.22.
- If B passes 5 of 5, a second x5 is cheap evidence against noise (interval at 0 of 5 misses is up to about 45% at 95%).
- A is worth a paid test only after B, as one scout run on ts-app-medium (about $0.2) to read the actual line for validateRange, then plan-reuse x5 with that file in a scratch copy of the fixture (not committed).

## Not determined

- Whether either option changes the model's behaviour; no run was made.
- Whether a real scout run would keep validateRange under the 8-bullet cap and what purpose text it would give.
- Why the 4 early misses never read any note (context may have been absent or the model skipped it); thinking blocks are empty.
- Sample size is small (7 misses); the shared.md read split (3 of 3 refs-era misses vs 9 of 14 hits) is not significant.
