# S4: fixed-prefix diet (2026-10-14)

**Status: dropped as a cost lever.**
- In 8 real sessions here (223–1730 calls, mean context 134k–180k), 900 tokens are 0.51–0.69% of cache reads. The whole 3k plugin prefix is under 2%.
- The saving only shows up in the 2–10-call eval sessions.
- What stays is cutting text that misleads the model, where a trace shows it did, such as `policy.enabled` in rules-migrate.

## Goal

Cut what the plugin puts into the first model call before any work starts, with no score drop.

The first call is a cache write at $4/Mtok. Every later call re-reads it at $0.1/Mtok. Saving 1k tokens there is worth about $0.0045 per run.

## Where we stand

First-call input tokens are from the last ×1 run: plugin `2026-10-14T00-23-11-856Z`, bare `2026-10-14T00-14-40-645Z`.

```
case                 plugin  bare    over bare
review-skipped       17509   ~16136  +1373
investigate-nomatch  17652   16153   +1499
review-clean         18200   16126   +2074
investigate-files    19023   16240   +2783
task-fix             19215   16251   +2964
plan-accept          19285   16277   +3008
rules-migrate        19944   ~16200  +3744
investigate-trace    20689   16255   +4434   (map 5.9 KB: work, not overhead)
```

The first step message was replayed offline for $0. Each case was materialized and the SessionStart and UserPromptSubmit hooks were run. Bytes per section:

```
case                 step text  map   policy  policy.enabled  context.list  other
investigate-files    1268       1949  -       -               495           -
investigate-nomatch  885        -     -       -               -             -
plan-accept          1424       -     2486    -               495           -
plan-reuse           1440       390   2486    -               648           -
review-clean         1708       -     -       -               -             207 (brief)
review-skipped       188        -     -       -               -             -
rules-migrate        1897       -     -       2881            -             93 (discover)
task-fix             1441       -     2987    -               79            201
task-multi           1447       -     2987    -               648           203
```

Fixed blocks on every run:

```
session contract (SessionStart)                     1053 B
SKILL.md       init 2003  investigate 778  plan 1730  review 793  rules 2867  task 1546
agent descriptions in the system prompt             reviewer 250 chars, scout 77
unexplained                                         ~900 tokens
```

**The unexplained ~900 tokens.** review-skipped carries only about 2 KB of known plugin text (contract, SKILL.md body, a 188 B step), about 500 tokens, yet it is +1373 over bare. init-auto shows the same remainder. All six skills set `disable-model-invocation`, so the skill listing should not count. I'd guess it is the system prompt: agents, slash commands and the hook framing. This is unverified.

## What S4 can and cannot do

The estimated saving is about 0.6–1k tokens on review and investigate, 1.5–2k on plan and task, and 3k+ on rules. That is $0.003–0.015 per run.

The cost gap is larger. task-fix is $0.098 against bare's $0.045. The rest of the gap is the number of calls: each call re-reads the context and writes new tokens to the cache. S4 is the cheap part. The calls are the next lever after it.

## Steps

### 0. Measure the unexplained part (~$0.3, needs approval)

Send one-turn `claude -p "ok"` probes from a scratch directory: the naked plugin, the ambicode plugin, ambicode without `agents/`, and ambicode without `hooks/`. Read the first call's input tokens from `--output-format json`. The result names what the ~900 tokens are and whether we can remove them.

### 1. A $0 regression measure

Extend `src/cli/context-cost.test.ts`, which already caps SKILL.md bytes with `MAX_SKILL_BYTES`. Add a cap on the session contract and on each first-step payload's fixed text (the step text without map, context and brief), using the same hook replay as above. Set each cap to the new size after the cut, so growth fails `verify`.

### 2. SKILL.md bodies

The route's step text already carries the instructions. A body keeps only what no step says:
- the fallback `route start` command;
- the git boundary;
- the argument contract.

The rules SKILL.md (2867 B) repeats the draft and apply steps nearly word for word. Its "Skip a rule the enabled built-in packs already cover" line already contradicted option 2, and I fixed it today. Targets are about 600 B for each route skill and about 1 KB for rules. init stays as it is, because it is human-only and has no route to carry its text.

### 3. Remove `policy.enabled` from the rules draft payload (−2.9 KB)

Under option 2, the only job left for this list is to avoid an exact duplicate, and `drafts.ts` already rejects one. The list is also what caused the rules-migrate regression: the model skipped a team rule as "covered". Two outcomes:
- If the rules-migrate ×3 run on today's wording passes, this item is a cost cut only.
- If it fails, removing the list is the fix.

The handler stays, because `routes/README.md` documents it for other payloads.

### 4. Session contract (1053 B → ~600 B)

Keep the Route lines and the Untrusted content section, since the rules-migrate `instruction-not-obeyed` grader leans on it. Cut the Evidence and Scope bullets that each step and report already enforce in code: the report is built from the ledger, and a skipped check is downgraded by the harness.

### 5. Step header

Two items:
- **The `Route:` line, about 300 B per step:** list only the remaining steps, not the done ones.
- **The CLI path:** the absolute path to `ambicode.mjs` appears up to 3× per step, about 70 B each. Print it once in `Then:`, and say "the command above" in the body.

The first-step header is 1.3–1.9 KB today. The target is about 1 KB.

### 6. Policy text in plan and task: your decision

Rule text is 2.5 KB on plan and 3.0 KB on task. The longest rules are fix-the-cause (560 B), reuse (470 B) and comment-reasons (430 B). Shortening them means editing `policies/*`, which I don't do without your say. The other option is to deliver `id: first sentence` in the step and keep the full text for the reviewer. That would save about 1.5 KB, but it risks plan quality: plan-reuse grades reuse.

## Verification

- **$0:** targeted tests per step, `npm run build`, and the hook replay table before and after.
- **Paid:** plugin ×3 on all cases, about $5 by my guess from the last ×1 at about $1.6. Success means no score drop on any case and lower first-call tokens and cost on every case. The rejected numbers are reported next to the accepted ones.

## Not in S4

- **Fewer calls per run** (route-next handshakes, the review offer). This is the bigger lever, and it comes after S4.
- **map and context.list:** they are work content. A bare model pays for the same information with grep calls.
