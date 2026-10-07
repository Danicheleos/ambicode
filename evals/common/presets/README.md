# Preset sets: light, average, large

Real merged tickets in three size bands, 20 tickets each, turned into eval cases for four skills:
`investigate`, `plan`, `task` and `review`. Everything in this folder except this README is generated and
gitignored, because the cases name real code (NDA).

**Average is the core suite.** Its cases are written to `evals/common/core/cases/`, not here, and run as
`--set curated` under the baseline lock, the gate, `evals:walk` and `evals:decide`
([../core/README.md](../core/README.md)). `--set preset` takes light and large only.

## Source and generation

The source lives outside the repository, in `../ambicode-evals-assets/presets/<preset>/<ticket>/` (or under
`$AMBICODE_EVALS_ASSETS`). Each ticket there holds `case.json` (eligible skills, base commits, review threads),
`prompts/<skill>.md` and `oracle/` (the merged change). The generator only reads it.

```
npm run evals:presets                       # all three presets (average into core/cases)
npm run evals:presets -- --preset light     # one preset
npm run evals:presets -- --regenerate       # after an interrupted generation or an outstanding prompt swap
```

It makes no model calls. It writes `<preset>/<ticket>-<skill>/` per eligible skill, plus `<preset>/manifest.json`
(for average, `../core/cases/` instead of `average/`). `npm run evals:select` writes average alone.
Each case holds only what a run and its scoring need:

| File | Use |
| --- | --- |
| `case.yaml`, `prompt.md`, `prompt.with.md`, `prompt.naked.md` | the run; the plugin arm gets the `/ambicode:<skill> --headless` command |
| `scaffold.sh` | `git archive` of the base commit from `../ambicode-evals-assets/benchmarks/<project>/.git` |
| `review/change.patch` | review only: applied by the scaffold and left uncommitted, so the agent reviews the working tree |
| `truth.json` | the merged change's files, split into existing, created and deleted; review adds per-thread labels |
| `oracle.patch` | task only: the merged change, read by scoring and by the judge |
| `graders/` | `names-a-true-file` (carries the final answer), no-code-edit, `raises-NN` per review thread, peek detection |

Counts at generation: light 69 cases (20 investigate, 20 plan, 20 task, 9 review), average 76 (16 review),
large 72 (12 review). Init and rules are not generated.

## Leakage

The model sees only the prompt and the scaffolded repository. The sandbox denies reads inside `--eval-dir`, so
`truth.json` and `oracle.patch` stay hidden, and the source sits outside the plugin. The peek graders fail a run that reads anything under `benchmarks/` or `presets/`.
Investigate and plan cases fail a run that edits or writes code.

## Running

```
npm run build
npm run evals:bench -- run --set preset --preset light --prompt with --ablation none \
  --model claude-sonnet-5-5 --max-cost-usd 10 -j 4
```

`--dry-run` lists the cases without spending anything. `--tag localize|plan|task|review` narrows to one skill.
`EVAL_AMBICODE_REVIEWER_REPLAY` is refused: its recordings belong to the core review cases.

For average, use the core scripts (`evals:walk`, `evals:decide`, `evals:baseline`) instead.

For the bare model, build the naked plugin from the preset's cases and run it the same way:

```
node evals/scripts/src/arms/naked-arm.mjs --preset light
npm run evals:bench -- run --set preset --preset light --plugin .tmp/naked --trust-plugin --ablation none \
  --model claude-sonnet-5-5 --max-cost-usd 10 -j 4
```

There is no baseline lock for light or large. Compare with `score <eval.json> --baseline <naked eval.json>`.

## Metrics per skill

`npm run evals:score -- <eval.json>` scores each run by the case's kind:

| Skill | Measures |
| --- | --- |
| investigate | precision, recall, F1 and hit of the `## Files` list against the merged change's files; recall split into existing, created and deleted files |
| plan | the same file metrics, read from the harvested plan note (promoted over draft), else from the final message; `scoredText` says which |
| task | the run's patch against the merged one: file precision, recall, F1 and the existing/created/deleted split; `hunkRecall` (merged hunks the run touched within 3 base lines); `identifierRecall` (compound identifiers the merged change introduced that the run's added lines contain) |
| review | recall of the human threads, also per label: `defectRecall`, `opinionRecall`, `unclassifiedRecall`, each over its own threads |

A part of a split that the merged change lacks is null, not zero. A task run with no harvested patch is absent;
a harvested empty patch scores zero. Each of these measures is averaged over the runs that have it, and the
summary gives that count beside it (`hunkRecallN`, `judgeScoreN`, …). `scoredFrom` counts where each plan was read
from, so a route that left no note shows up.

The task patch is the sandbox's change against its base commit, untracked files included, so a run that commits is
still measured. It is staged in a copy of the index: the sandbox's own index is never touched.

A bullet in the `## Files` section that names a root file with no directory (`package.json`) counts for preset
cases only, since their truth spans the whole tree. The name must be backticked, or end the bullet, or be set off
by a dash, colon or bracket: `- Node.js runtime` names no file.

## Optional paid judge for task

The overlap measures miss a valid alternative implementation. The judge asks a model whether the run's patch
implements the merged change's behaviour:

```
npm run evals:bench -- judge-task <eval.json> --model claude-sonnet-5-5 --max-cost-usd 2
```

It makes one `claude -p` call per harvested task run, with no tools, and stops at the cap. The runs it did not
judge are recorded as skipped, with the reason. Patches over 10 KB per file or 100 KB in total are cut, and the
verdict records what was cut. It writes `reports/task-judge.json` beside the run and never replaces an earlier
file. `score` then adds `judgeScore` per run and reports the judge's cost apart from the agent's.

The judge runs your installed `claude` CLI, so your user hooks and plugins load with it.
