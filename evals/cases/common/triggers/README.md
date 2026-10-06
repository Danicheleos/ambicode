# Trigger-boundary suite

Measures which skill fires on which phrasing — nothing else. Every case is
synthetic (the Jira URL is `example.atlassian.net` and retrieves nothing), so
this directory is tracked, unlike `../core/`. For the same reason it is
what the manifest names, so a bare `claude plugin eval .` — which publishes
its report by default — runs this suite and nothing under NDA.

The suite becomes a negative-only check as each remaining skill migrates to a
route: a migrated skill disables model invocation, so no phrasing fires it. It is no
longer a release gate for description edits. Step 06 did so for `plan-think`, `plan-roadmap` and `url-plan` (`plan-fired.md` now expects no
skill; `url-bare`'s `fired-plan` is `max: 0`): `plan` is user-typed only
(`disable-model-invocation`), so no phrasing fires it. Step 08 did so for the eight
review cases (`collide-code-review`, `collide-verify`, `review-bench-shape`,
`review-check-push`, `review-mr`, `review-vs-ticket`, `url-review`, `verb-review`):
each now carries `no-skill-fired.md`, `verb-review` also `no-helper.md`, and
`url-bare` lost `fired-review.md`. Steps 07, 08 and 09 convert
their skill's positive cases to `no-skill-fired.md` in the same change as that
skill's `disable-model-invocation`. Step 03 did so for the five investigate
cases (`casual-look`, `how-much-work`, `url-question`, `which-files`,
`why-question`); `url-bare`'s diagnostic graders are unchanged. Editing cases is
model-free; executing the suite is a separately authorized paid item.

```sh
npm run evals:triggers        # all 28 cases, 1 run: $2.2–2.3, about 3 min (measured)
```

The script writes `results/latest.json` and then runs `run-validity.mjs` on
it. A run that died outside the arm (session limit, lost login) fails the
script: the harness would score it, and every `max: 0` grader passes on a run
that did nothing. A run that hit `max_turns` is not flagged.

Every case carries a split tag. Edit a description while looking at `dev` results
only, and confirm on `test` (`--tag dev`, `--tag test` select them). `diag` is the
bare-URL diagnostic and belongs to neither. The new cases run at `max_turns: 4`: the
Skill call is the measure, so a case that reaches the turn limit after the skill
fired still passes (its `exit 1` is noise, not a miss). The eight older cases keep
their 8 turns.

Twenty-eight cases (eight hand-written, twenty added 2026-09-30), all on the `ts-staged-unstaged` fixture with `ambicode init`
run:

- `url-question`, `url-plan`, `url-implement`, `url-review` — a verb plus a
  Jira URL; each skill is now user-typed only, so each case expects no skill
  (`no-skill-fired.md` or `<skill>-fired` with `max: 0`).
- `url-bare` — a bare URL with no verb. **Diagnostic:** its three `fired-*`
  graders can never all pass; the per-grader pattern across runs *is* the
  answer (which skill claims a bare URL today), so read the grader table,
  not the case score.
- `verb-review`, `verb-implement` — the plain phrasings with no URL; both
  expect no skill, and `verb-review` also no helper call.
- `unrelated-question` — a general-knowledge question fires no skill and no
  helper (`min: 0, max: 0` on both).

The suite runs one arm (no ablation): a without-plugin arm has no skills to
trigger, so it can measure nothing here. Unlike `evals:archived` it grants no
`WebFetch(domain:api.anthropic.com)`: no grader depends on the reviewer
answering, and the 2026-09-28 map (27 of 27 runs consistent) was taken
without it. Grading is structural
(`tool_used`/`tool_order` on the trace) — no llm judges, no cost ceiling
needed. Retrieval failures inside a fired skill are expected and irrelevant:
the Skill call is in the trace before the skill discovers the URL is not
retrievable.

## The added cases

Twelve mixed-intent phrasings, four negatives, and three collisions with built-in
skills, each with an expected skill and the sibling graders of the older cases:

- `fix-ticket`, `fix-bug-plain`, `build-ticket-casual` → task;
- `why-question`, `which-files`, `how-much-work`, `casual-look` → investigate;
- `plan-roadmap`, `plan-think` → plan;
- `review-bench-shape`, `review-check-push`, `review-mr`, `review-vs-ticket` → no
  skill (review is user-typed only). `review-bench-shape` is the neutral prompt of
  the curated review cases in `common/core`;
- `neg-regex`, `neg-git-concept`, `neg-shell-oneliner`, `neg-http` → no AMBICODE
  skill;
- `collide-code-review`, `collide-verify` → no AMBICODE skill; `collide-security` only asserts
  that no *wrong* sibling fires (the built-in security review may reasonably win).
