# The fix-the-cause rule: tuned on agents, 2026-10-12

Rule `common-quality/fix-the-cause` was added to `policies/common-quality.yaml`. It is delivered in the
before-work policy block of the task and plan routes. This page records how it was tuned and what it measured.

## The rule (v5, shipped)

> Before writing new code (a function, branch, guard, option or file), even code a plan or spec prescribes:
> find the existing code that produces today's behaviour, edit it, and check whether the request's outcome
> now holds. If it holds, keep that edit, skip the prescribed code and report the departure. Judge by what
> the request asks for, not by the mechanism the spec describes. Change the behaviour in place; an option no
> caller needs only keeps the old one alive.

## Method

- Each agent was a Sonnet 5.5 subagent at effort low. It read a brief from a file: the task, plus the
  before-work block exactly as the plugin delivers it, with or without the rule line. The brief arrives as a
  tool result, as a route step does.
- Each agent worked in its own small git repository. `grade.mjs` checks the outcome with a probe. It also
  lists every edited file other than the cause, and every new file.
- Verdicts:
  - `ROOT`: the cause was fixed and nothing else changed.
  - `ROOT+PATCH`: the cause was fixed and code was also added elsewhere.
  - `ADD`: the prescribed new code was built instead.

## Results

Bug tasks (round 1: price, inbox, discount; round 2: search feature, prescribed patch, shared money helper)
did not separate the arms. Agents fixed the cause on their own in small repositories:

```
            round 1 (3 tasks)    round 2 (3 tasks)
no rule     3/3 ROOT             3/3 ROOT
rule v1     2/3 ROOT, 1 no-op    3/3 ROOT
```

The habit appears where it appeared in this session's real work: an approved spec that prescribes new code.
The spec here is the same one the plugin's map fix had. It asks for a test-file matcher, and a one-line edit
of the test filter already delivers the request.

```
spec task (implement an approved spec)   ROOT   ADD   other
no rule                                  0/2    2/2
v1  "fix where it originates"            0/2    2/2   one said "not a defect fix"
v2  + features and specs, depart+report  1/4    3/4
v3  + "state why the edit cannot"        0/6    5/6   1 ROOT+PATCH (+24 lines)
v4  + "edit it, check the outcome"       5/6    0/6   1 edited the filter via a new includeTests option
v5  + "change behaviour in place"        4/4    0/4

plan task (write PLAN.md)                root-cause plan
no rule                                  1/2   (the other added an includeTests option)
v1–v5                                    7/7

controls with v5
new function genuinely needed (2)        2/2 built it, tests pass
prescribed downstream patch (round 2)    ROOT, reported the departure
shared money helper (round 2)            ROOT
```

What moved the result:

- **Asking for a reason does not work.** v2 and v3 asked the agent to justify new code. Agents then wrote a
  justification measured against the spec's own mechanism:
  - "no existing code maps tests to candidates";
  - "tests must not become candidates";
  - "the spec requires a separate list".
- **Asking for an action works.** v4 has the agent edit the existing code and check the outcome before
  writing new code. That took the spec task from 0–1 per round to 5/6.
- **The last line closes the option variant.** v5 adds "change the behaviour in place". The v4 outlier, an
  `includeTests` option with one caller, did not recur.

Every v4 and v5 agent that departed from the spec said so in its report and listed the spec items it did not
build. That is the exit when the spec's shape really mattered: the departure is visible to whoever reads
the report.

## Cost and limits

- The delivered before-work block is 4,038 of its 4,096-byte cap, with all 16 rules delivered. Before the
  rule it was 3,531 bytes. A project rule of more than 58 bytes now pushes the last rules out of the block.
  They are not lost: the block prints a "N more" pointer to `policy --show`. That pressure existed before
  (565 bytes of headroom) and the rule takes most of it.
- The bench is small single-purpose repositories at effort low, with 2–6 samples per arm. The spec-task gap
  is large: 0/14 for v1–v3 against 9/10 clean for v4–v5. The plan-task rate without the rule is 2 samples.
- Not tested:
  - long sessions, large repositories and medium or high effort;
  - the reviewer side: the rule's `check` is a reviewer explanation, and the review route was not run.

## Data

`raw/2026-10-12-root-cause-rule/` holds:

- `make-bench.mjs`, `set2.mjs`, `set3.mjs` and `set4.mjs`, which build the benches;
- `reports.mjs`, `prompt.mjs` and `briefs/`, the exact briefs;
- `grade.mjs`;
- `rule-v1…v5.txt` and `policy-*.txt`, the delivered blocks;
- `plans-r3/`, the plans the planners wrote.
