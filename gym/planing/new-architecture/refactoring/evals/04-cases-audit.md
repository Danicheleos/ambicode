# Eval cases audit — 2026-10-06

Inputs:

- the case folders on disk;
- the generators;
- `package.json`;
- the 2026-10-04 naked baseline (18 cases × 3);
- run 12 (10 localize × 3, `--prompt with`), read with the new `evals:report`.

Six skills, all `disable-model-invocation: true`: `init`, `investigate`, `plan`, `review`, `rules`, `task`. A skill runs only
when the prompt types `/ambicode:<skill>`. A case whose prompt does not type its command measures hooks and injected
context, not the skill.

## 1. Cases per project

| project | full set (`benchmarks/<p>/cases`) | curated (`common/core`) | task | impact | reuse | other | in a paid run |
|---|---|---|---|---|---|---|---|
| BE-express | 94 (59 localize, 35 review) | 9 (5 localize, 4 review) | 0 | 3 | 3 + 3 `-forced` | — | curated only |
| FE-angular | 108 (57 localize, 51 review) | 9 (5 localize, 4 review) | 1 | 4 | 4 + 4 `-forced` | — | curated, task walk |
| python | 5 (map inputs: no `case.yaml`, no graders) | 0 | 0 | 0 | 0 | `cases/python/` notes | never: not in `BENCH_PROJECTS`, no `.git`, `assets`, `reviews` |

**Too much?**

- The curated 18 is the right size for a sweep. Its makeup is the problem (section 2).
- The 202 full-set cases are too many. Nothing has run them since the layout change, and their prompts are stale:
  - no `prompt.with.md`, so the plugin arm never types a command;
  - they were generated before the per-arm prompts existed.
- Keep them as the **pool** that `select` picks from, not as a suite to run.

**Five per project is enough for the default sweep.** It is not enough to decide on one skill:

- 5 cases × 3 runs detects only about a 20–25 pp effect.
- The task README's estimate is 10 × 3 for about 20 pp.
- Runs of one case are correlated, so the effective sample is closer to the number of cases than to the number of runs.

Proposed per project:

| slot | skill | why |
|---|---|---|
| 2 localize | investigate | the skill with the most data and the cheapest runs (~$0.19 a run) |
| 1 review | review | one per merge request, at least 3 substantive human threads |
| 1 task | task | the hidden test is the strongest oracle in the suite |
| 1 localize or plan | investigate / plan | plan once epic data exists (section 3) |

That makes 10 cases across both projects: about $2 a repetition on the plugin arm, about $6 at 3 runs. Per-skill
decisions run a 10-case pool for that skill (5 per project) by `--tag`.

## 2. Is the selection the best, and how are projects included?

**How projects get in:**

- `select` loops over `BENCH_PROJECTS` (`BE-express`, `FE-angular`) and reads each project's `assets/` and `reviews/`.
- It picks 5 localize and 4 review cases per project and writes them all to `common/core/cases/`, named and tagged
  `be-`/`fe-`.
- One run with `--eval-dir evals/cases/common/core` covers both projects; `--tag be` or `--tag fe` narrows it.
- Full sets run per project (`--set full --project <p>`).
- Python is in no paid run. Its 5 cases feed `evals:map-recall` only (`outputs/search-maps/`).

**What the selection gets right:**

- It uses criteria, never a list.
- Localize is ranked by *hardness*: the ticket names no true file, so grep over the ticket's words fails. That is where a
  map should help.

**What it gets wrong**, measured on the baseline and run 12:

| problem | cases | effect |
|---|---|---|
| Saturated: both arms at 1.0 | be-vs-6140, fe-vs-6181; fe-vs-5164 is 1.0 for bare | no signal at full price; be-vs-6140 also costs 1.35× bare |
| Floor: both arms ≤ 0.23 | fe-vs-6334 (10 true files) | the whole run-12 cost excess (+$0.37) and the only loss beyond the band |
| Review floor: bare recall 0 in all 3 runs | 6 of 8 review cases | a gain cannot show; 1-thread cases score 0 or 1 |
| Same merge request twice | fe-vs-6086 `d1f112e5` and `d7c43dc5` | one case counted twice |

Hardness alone cannot avoid saturation. Rank by **discrimination** instead, using the baseline we already have:

- keep localize cases where bare recall is 0.3–0.8 and truth is 3–7 files;
- keep review versions with at least 3 threads and one version per merge request;
- break ties by hardness.

`select` would then read `outputs/core/<baseline>` as an input. That is a generator change, not a list, so the "no word
of the data" rule still holds.

**Blocking issues found during the audit**, none caused by the refactor:

1. **`npm run evals:walk` and `evals:decide` serve the naked prompt.** `run` defaults to `--prompt naked`. With every
   skill typed-only, their plugin arm runs no route. The decision-A runs (run04–run12) passed `--prompt with` by hand.
   The scripts need `--prompt with`.
2. **`--prompt with` is refused for the review cases.** The 8 curated review cases on disk have no `prompt.with.md`.
   - The generator writes one now (step 08, `REVIEW_COMMAND`).
   - The on-disk set predates that and cannot be regenerated until `assets/` and `reviews/` are back.
   - So `evals:decide` over all 18 cases fails, and `evals:walk` fails as well, because its 4 cases include 2 review
     cases.
3. **Obsolete indicators.**
   - `plugin-fired` waits for a `Skill` tool call to `ambicode:review` / `ambicode:investigate`.
   - `helper-ran` waits for a Bash `ambicode review`.
   - A typed route makes neither call (run 12: "skill fired 0/30" while 30/30 routed).
   - The report now reads the ledger instead (`unrouted`, `route-open`). The graders should do the same.
4. **`evals:archived` stops at preflight.**
   - 12 of 13 archived prompts type no command.
   - The preflight requires `plugin-fired` on `regression-ts`, which can no longer happen.
   - The suite needs typed commands in its prompts, or it should be retired.

## 3. One set for all skills, or one per skill?

**One ticket pool and one suite, with a case kind per skill.** One shared case does not work, because each skill needs
a different starting state and a different oracle:

| skill | starting state | oracle | cost/run | fits the harness suite |
|---|---|---|---|---|
| investigate | snapshot, read-only | true files of the merged change (recall/precision) | ~$0.19 | yes |
| review | base + the change uncommitted | human threads raised (recall only) | ~$0.2 + reviewer | yes |
| task | base commit, edits allowed, 80 turns / 30 min | withheld test of the merged fix, red→green ledger | ~$0.5 | yes (`--set task`) |
| plan | epic + AC labels | file recall, anchor validity, AC coverage (`plan-score`) | — | no: `plan-run.mjs` runs one `claude -p` session per run; no epic data is on disk |
| rules, init | rule documents / no config | the drafted packs and config | — | no: deterministic setup routes, better covered by integration tests than paid evals |

Several skills can share one ticket: ticket 5546 is already a localize, review and reuse case. That makes the skills
comparable on the same work. The gate already scores each kind separately, so one sweep can mix kinds. Cost and time
differ 3–10× between kinds, so decide one skill at a time with `--tag <kind>`, and keep the mixed 10-case set as the
walk/smoke tier.

## 4. Unused, duplicated, useless

| what | count | status | proposal |
|---|---|---|---|
| reuse `-forced` twins | 7 | prompt says "Use the ambicode investigate skill…": prose cannot fire a typed-only skill | delete; stop `reuse-cases.mjs` generating them (its comment waits for step 05) |
| impact pool | 7 | only `lsp-arms.mjs --impact`; no npm script; no run since before 10-03; no `prompt.with.md` on disk | keep for the LSP three-arm study, regenerate before use; otherwise archive |
| reuse pool (non-forced) | 7 | as impact; the reuse generator writes no plugin prompt | as impact; add `writePluginPrompt` if kept |
| full sets | 202 | never run in the new layout; stale prompts | pool for `select`, not a suite; `evals:full` only after regeneration |
| fe-vs-6086 review, 2 versions | 1 extra | same merge request | keep `d1f112e5` (4 threads) |
| 1-thread review cases | 2 (be-vs-3571, be-vs-5075-review) | binary, bare 0 | replace |
| saturated localize | 2 (+1 with bare at 1.0) | no signal | replace (section 2) |
| floor localize | 1 (fe-vs-6334) | drives cost, no signal | replace, or keep as a deliberate stress case outside the gate |
| task suite | 1 of the planned 10 | walk only | generate the other 9 (`task-cases.mjs --test-command`) |
| python | 5 map inputs | search-maps only | fine; it is not a paid suite, and the README now says so |
| archived typescript / py | 13 / 6 | 12 of 13 cannot fire; preflight fails | type the command into the 13 prompts, or retire with `evals:archived`/`evals:preflight` |
| triggers | 28 | all expect no skill; `disable-model-invocation` already guarantees it | replace the paid run with a unit test over `skills/*/SKILL.md` frontmatter; keep `url-bare` as a diagnostic if wanted |
| `selection.json` | — | still keyed `BE`/`FE` | rewritten by the next `select` |

## 5. The analyzer

`npm run evals:report -- <iteration>` runs `evals/cases/scripts/src/analysis/run-report.mjs`. It is offline and makes no
model calls. It writes into `evals/reports/<type>/<date>/<iteration>/`:

- `report.md`:
  - the metric table against bare and the 2 previous iterations;
  - findings, strong and weak;
  - proposals;
  - per case;
  - route;
  - context;
  - tools and files;
  - time;
  - price.
- `chains.md`: every run's ledger, map, injected context, model calls and tool calls, with files, time and price.
- `report.json`.

Run 12 through it reproduces the hand report's numbers:

| number | run 12 | bare |
|---|---|---|
| recall | 0.731 | 0.723 |
| wall time | 48.4 s | 38.8 s |
| noise band | 0.099 | |

It also confirms that fe-vs-6334 drives the cost excess. It adds what the hand report did not have:

- **be-vs-5928's loss:** the map held all 6 true files, and the answers dropped 2 (`map-missed`).
- **fe-vs-6269 and fe-vs-6334:** the map held no true file.
- **First move:** 15 of 30 runs opened with a search that names no map file.
- **Open routes:** 4 runs ended with no exit entry.
