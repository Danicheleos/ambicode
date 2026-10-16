# Phase 0: where the plugin's extra cost and time go (2026-10-12, $0)

Source: latest trace dir holding each case, plugin and bare, x5 runs each (95 traces). Tool: `evals/scripts/breakdown.mjs`. Raw dumps: `eval-replay/evals/raw/2026-10-12-phase0/`.

## Answer

**Harness cost includes subagent cost.** `total_cost_usd` on the result line covers the reviewer. `result.usage` is the main session only; `modelUsage` is not what the cost is built from. No fix to `track.mjs` is needed for subagents.

**`track.mjs` counts the judge twice.** `run.costUsd` already equals `total_cost_usd + judgeCostUsd`, and `track.mjs:42,63` adds `judgeCostUsd` again. Size: about $0.0007 per run (max 0.00074), 1-2% of a $0.04-0.07 run. Not fixed, per instruction.

**Over the 8 cases both arms run (mean per run), the plugin costs $0.1080 against bare $0.0499 (+$0.0581) and takes 25.4 s against 9.7 s (+15.7 s).** Three contributors, cost:

1. **Cache writes of new context: +$0.0271 (47%).** About +6.8k tokens written per run. The first call alone carries +1.6k to +3.8k tokens over bare (contract, plugin prefix, hook-delivered step); step messages, plumbing results and the model's own output re-enter the cache after that.
2. **Output tokens: +$0.0147 (25%).** +1,466 tokens per run (2,160 against 693). The final report with its Evidence block is 2.0-3.9 KB against bare's 0.25-1.1 KB; `ambicode.mjs` command inputs (review record, notes) add 1.0-2.2 KB; plan-accept also writes a 4.5 KB plan file.
3. **Cache reads from extra calls: +$0.0102 (18%).** 7.05 calls against 2.78 (+4.3), so +109k input tokens (155k against 46k). Of the extra calls, 2.2 are route plumbing, 0.6 delegation, 1.3 work.

The reviewer subagent adds $0.0062 (11%) on average, $0.0103-0.0146 on the four cases that run it.

Seconds, same 8 cases (OLS over 80 runs, R2 0.94, calls and output tokens are collinear, so read as estimates):

1. **Output tokens: about 8.5 s of the 15.7 s.** 0.0058 s per output token times +1,466.
2. **Extra model calls: about 3.1 s.** 0.73 s per call times +4.3.
3. **Waiting for the reviewer Agent: 1.9 s on average, 3.2-4.4 s on the four cases that run it** (measured from timestamps, not fitted).

The cases are where the cost sits: review-regression +$0.113, task-fix +$0.123, plan-accept +$0.061, review-clean/defect +$0.064-0.070, investigate +$0.016-0.021, investigate-nomatch -$0.003. Investigate pays only the fixed overhead; the rest pays for steps.

## Is subagent cost in the harness cost

Evidence from the 48 plugin traces with a reviewer subagent.

```
result.usage cache_read/cache_creation == sum over main-session assistant calls in the trace (exact, all 14 checked of the first batch)
=> result.usage is main only.

task-fix-1 (21-18-58):
  total_cost_usd                                   0.1532918
  price(result.usage)   2/10/0.1/4 $/Mtok          0.1407848
  residual                                         0.0125070
  modelUsage - usage    (4 in, 259 out, 9265 read, 3593 write)
  price of that at 5-min write rate (2.5)          0.0125070   <- equal

48 runs: max |total - price(usage) - price5m(modelUsage - usage)| = 4.68e-17
subagent share of total_cost_usd: 0.0067 - 0.0229, mean 0.0134
```

Prices ($2 in, $10 out, $0.1 read, $4 write per Mtok) fit `total_cost_usd` of 113 bare and 152 no-subagent plugin traces with max error 7e-16. Pricing `modelUsage` at the same rates overstates by about 30% on subagent runs ($0.1587 against $0.1533 on task-fix-1), because the subagent's writes are 5-minute, not 1-hour.

Harness check on `plugin.json` / `bare.json` (15 runs): `run.costUsd - total_cost_usd - judgeCostUsd` max 1e-17. `durationSeconds` is the result line's `duration_ms` plus a constant harness overhead: +12.2 s (10.6-13.3) plugin, +11.3 s (9.5-11.8) bare. The seconds below are the result line's; history.jsonl seconds are about 12 s higher on both arms.

## Per-case table, mean of 5 runs

`plumb` = calls to `ambicode.mjs` other than `check` (route next/start/stop/status, note save, review, review record, format, report, refs). `check` runs the project's tests, so it counts as work. `work` = every other tool call. Agent/Skill/ToolSearch calls are neither (column `deleg`). `calls` = main-session model calls.

```
case                  arm     calls plumb work deleg  inTok  outTok   sec   cost
investigate-files     plugin    3.0   1.0  1.0   0.0   58.8k   1199  11.8  $0.0688
investigate-files     bare      3.4   0.0  4.2   0.0   56.6k    827   8.9  $0.0527
investigate-how       plugin    3.2   1.2  1.0   0.0   63.8k   1406  12.2  $0.0731
investigate-how       bare      2.6   0.0  4.0   0.0   43.4k    897   7.6  $0.0523
investigate-nomatch   plugin    2.0   0.0  0.0   1.0   35.7k    470   5.7  $0.0502
investigate-nomatch   bare      4.2   0.0  3.2   0.0   70.4k    648   8.2  $0.0532
plan-accept           plugin    6.4   2.6  4.6   0.0  150.4k   3464  30.7  $0.1240
plan-accept           bare      3.0   0.0  2.2   0.0   50.4k   1788  17.7  $0.0628
plan-draft            plugin    7.0   3.0  8.8   0.4  167.1k   3534  31.8  $0.1289
review-clean          plugin    8.6   3.0  3.6   1.0  174.9k   1992  34.1  $0.1147
review-clean          bare      2.0   0.0  1.0   0.0   33.0k    308   9.4  $0.0442
review-defect         plugin    7.4   2.6  3.0   0.8  150.7k   2024  29.6  $0.1093
review-defect         bare      2.0   0.0  1.0   0.0   33.0k    449  12.4  $0.0455
review-regression     plugin   14.6   4.2  8.4   1.0  329.8k   3352  43.7  $0.1572
review-regression     bare      2.0   0.0  1.0   0.0   32.9k    329   8.9  $0.0441
review-skipped        plugin    1.0   0.0  0.0   0.0   17.7k    428   5.1  $0.0467
task-fix              plugin   11.2   3.0  7.2   1.0  278.5k   3370  35.5  $0.1669
task-fix              bare      3.0   0.0  2.0   0.0   48.9k    301   4.5  $0.0440
task-review-skipped   plugin    8.4   1.2  8.4   0.0  201.6k   2032  22.3  $0.1188
```

plan-draft, review-skipped and task-review-skipped have no bare arm. Cost includes the reviewer. Judge cost is not in these figures.

## Plugin fixed injected bytes and per-step calls

Bytes are per run. `contract` is the SessionStart hook output (the file is 952 B). `SKILL.md` is the size of the skill file the slash command loads (not visible in the trace). `hook step` and `cli steps` are the ledger's `delivered` bytes by channel. The trace-side sum of step messages is higher than the ledger (task-fix 10.6 KB against 10.3 KB ledger) because a repeated step re-prints its message in `check` replies.

```
case                  contract SKILL.md hook-step cli-steps stop-blocks  calls per step (mean)
investigate-files        1053     896     3496        0      0    read 2.0, complete 1.0
investigate-how          1053     896     3639      450      0    read 2.2, complete 1.0
investigate-nomatch      1053     896        0        0      0    start 2.0
plan-accept              1053    2408     5757     2558      0    design 3.4, plan-write 2.0, complete 1.0
plan-draft               1053    2408     5701     2047      0    design 4.0, plan-write 1.8, plan-accept 1.2
review-clean             1053    1545     1451     3030      0    review-run 5.6, review-agent 2.0, readback 1.0
review-defect            1053    1545     1446     2419      0    review-run 5.0, review-agent 1.6, readback 0.8
review-regression        1053    1545     1446     2917      0    review-run 7.0, review-agent 6.6, readback 1.0
review-skipped           1053    1545        0        0      0    start 1.0
task-fix                 1053    2470     5836     4440    1.0    change 6.0, review-cmd 1.0, review-agent 2.0, write 1.0, stop-feedback 1.2
task-review-skipped      1053    2470     5881     1866    0.4    change 6.8, write 1.0, stop-feedback 0.6
```

Fixed overhead measured on the first model call (input + cache, mean of 5), which is what the plugin adds before any work:

```
bare                      16.1k  (cache write 8.8-8.9k, read 7.2k)
plugin investigate/review 17.7k-19.0k   (+1.6k to +2.9k)
plugin plan/task          19.8k-19.9k   (+3.7k to +3.8k)
```

At $4/Mtok a +3.8k first call is $0.015 of write cost per run, before any step runs. review-skipped does nothing and still costs $0.0467 against bare's $0.044.

Route plumbing (calls to `ambicode.mjs` per run): task-fix 3.0 (format, review, review record), review 2.6-4.2, plan 2.6-3.0 (route next 2, refs 0.6-1.0). The seconds in `ambicode` calls are small (format 0.7 s, review 0.7 s, review record 0.5 s, route next 0.4 s); their cost is the round trip, one model call each at 20k+ context.

Seconds by tool, task-fix plugin run: Agent 3.2, `check` 2.3, format 0.7, review 0.7, review record 0.5. Model time 25.0 s, tool time 8.0 s: the time is the model, not the tools.

## What was not done

- No paid run, no commit, no change to `track.mjs`, `context.mjs` or any plugin file.
- History rows older than the latest dir per case (r6, r8 and earlier) were not re-parsed; the latest dirs are the r8-era traces. The 313 traces in `evals/cases/results/traces` were used only for the price fit and the subagent-cost check.
- Hook-injected step messages are not in the trace. Their size comes from the ledger `bytes`, and SKILL.md size from the file, so they are not measured on the wire.
- Subagent calls: the trace carries 1 of several reviewer calls (as `context.mjs` already notes), so subagent tokens come from `modelUsage - usage` and the cost from `total_cost_usd`, not from the trace events.
