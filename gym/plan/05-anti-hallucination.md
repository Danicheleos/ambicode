# 05 — Anti-hallucination and anti-drift controls

Controls against a lead that acts on remembered rather than measured facts, manages
helpers by trust, or wanders from [01](01-goals-and-metrics.md). The audit that seeds
these rules found, in one real cycle, provenance timestamps invented in 4 of 4 sessions
and a metric that double-counted rows as messages ([00 §4](00-audit.md#4-vs-6735-cycle-claims));
the controls below assume the lead will do the same unless stopped.

## 1. Mandatory re-verification before acting

| Before the lead … | It must first … |
|---|---|
| writes a number into `brief.md`, `decision.md`, `cp-K.md` or `STATE.md` | quote the command or `path:line` it came from on the same line; a number without a source is deleted, not fixed from memory |
| compares to "the baseline" | `cat gym/runs/<campaign-id>/baseline/metrics.json` in that turn and quote the field; the 1-run rows in 01 §3 are not the baseline once cp-0 exists |
| accepts a helper's claim that a step ran | open the output file the handoff names ([04 §6](04-orchestration.md#6-handoff-format)); no file, no run |
| cites a file or line in `src/` | `sed -n '<a>,<b>p' <path>` in that turn; the audit found four line citations drifted in one day |
| calls a failure "pre-existing" | `git stash && npm run verify` or `git checkout <last tag> && npm run verify`, and say which (CLAUDE.md "Before calling a failure pre-existing") |
| says a human decided something | quote the `labels/labels.json` entry or the message verbatim; otherwise it is an ASSUMPTION and goes to `labels/pending.md` |
| skips a measurement | write `null` plus `notes` in `metrics.json` and name it in `decision.md`; never write `0` |

## 2. Disk is the only memory

Nothing counts unless it is under `gym/runs/<campaign-id>/` ([06](06-data-and-state.md)).
After any compaction, restart or resume, the lead re-enters through
[06 §6](06-data-and-state.md#6-reconstructing-state-from-disk) and re-reads
[01](01-goals-and-metrics.md) and the current `brief.md` before its next tool call. A
lead that "remembers" a number it cannot find on disk treats it as unknown.

## 3. Cross-checks

- **Verifier vs lead:** every T-number in `metrics.json` is re-extracted by the verifier from the same result files with different commands ([04 §2](04-orchestration.md#2-verifier)). Disagreement → inconclusive.
- **Without-arm as control:** the eval's without-plugin arm cannot be moved by a plugin change. If it moves beyond noise (01 §3), the model or harness moved, and every with-arm number in that sweep is suspect; the sweep is repeated once and, if it repeats, S4 stops the loop ([03 §3](03-checkpoints-and-gates.md#3-stop-and-escalate)).
- **Gate vs claim:** a WP that claims new behaviour must raise `tests` in G1 ([01 §2](01-goals-and-metrics.md#2-gates-deterministic-0)); prose-only "improvements" of `src/` are rejected by that rule alone.
- **Two sources for a T4 number:** the transcript script's output and the `result.json` it points at must agree (e.g. reviewer turns); the auditor spot-checks one T4 field per human cycle by hand.
- **Recordings vs prompt hash:** T3 replays are valid only while `reviewer-system-prompt.md` md5 and the `policies/` tree hash equal those recorded in `metrics.json.T3`; a change without a re-record is S6.
- **Auditor vs lead:** every 3 iterations the auditor re-derives the last decision from files alone and reports whether it reaches the same verdict.

## 4. Cadence

| Event | The lead must |
|---|---|
| start of every iteration | re-read [01 §1, §3, §4](01-goals-and-metrics.md) (the definition, the signal rules, the WP table) and the previous `decision.md` |
| every 3 iterations | read the auditor's handoff before selecting; re-run `sha256sum gym/plan/*.md` against `CAMPAIGN.md` |
| every checkpoint | re-read all of 01 and 03; recompute spend from `metrics.json` files, not from a running total in memory |
| after any compaction/resume | [06 §6](06-data-and-state.md#6-reconstructing-state-from-disk) then this file |
| before any `git reset`, `rm`, `worktree remove` | [08 §3](08-safety-and-rollback.md#3-rollback-to-a-checkpoint) checklist |

## 5. Red flags

Signs that the lead has wandered.

Any of these, noticed by anyone, is written to `it-NNN/handoffs/auditor.md` or
`incidents/` and pauses acceptance until resolved:

- A `decision.md` sentence with a number and no `path:line` or command beside it.
- The claimed metric of an iteration is not the one in its `brief.md`.
- Comparison against a sweep other than `baseline/metrics.json` or the previous accepted iteration.
- "Improved" used for a change inside the noise band of 01 §3.
- Work started on WP(n+1) while WP(n) has no checkpoint record.
- Two iterations in a row whose diffs touch the same seam with opposite intent.
- A helper handoff cites a path that does not exist at that commit.
- `metrics.json` contains a `0` where the step was skipped, or a T2 entry with `runsPerArm: 1` used in an accept.
- The lead edits `src/` itself, edits `gym/plan/`, or cites its own earlier message as evidence.
- The lead reports a step as done that has no output file.
- A label default was taken without a `labels/pending.md` entry naming it.
- Spend in `STATE.md` disagrees with the sum of `metrics.json.costUsd` by more than $1.

Three red flags in one iteration = stop and escalate (S8, [03 §3](03-checkpoints-and-gates.md#3-stop-and-escalate)).

## 6. Language rules for records

- "Measured" only with a command and its output; otherwise "observed" (from a file) or "assumed".
- "Regression" and "improvement" only past the signal thresholds; inside them, "within noise".
- "Pre-existing" only after the check in §1.
- "Done" only with an output path; "skipped" is written as skipped.
