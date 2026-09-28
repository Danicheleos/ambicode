# Trigger-boundary suite

Measures which skill fires on which phrasing — nothing else. Every case is
synthetic (the Jira URL is `example.atlassian.net` and retrieves nothing), so
this directory is tracked, unlike `../evals-core/`. For the same reason it is
what the manifest names, so a bare `claude plugin eval .` — which publishes
its report by default — runs this suite and nothing under NDA. It exists to gate
description edits: run it before and after changing any SKILL.md
`description`, three runs, compare medians, per the accepted plan
(`.ambicode/task/ambicode-refactor/plan_2026-09-28T12-45.md`, iterations
I2/I3).

```sh
npm run evals:triggers
```

Eight cases, all on the `ts-staged-unstaged` fixture with `ambicode init`
run:

- `url-question`, `url-plan`, `url-implement`, `url-review` — a verb plus a
  Jira URL routes to exactly one of investigate/plan/task/review
  (`<skill>-fired` min 1) and to none of its siblings (`sibling-fired`
  `min: 0, max: 0`).
- `url-bare` — a bare URL with no verb. **Diagnostic:** its four `fired-*`
  graders can never all pass; the per-grader pattern across runs *is* the
  answer (which skill claims a bare URL today), so read the grader table,
  not the case score.
- `verb-review`, `verb-implement` — the plain phrasings with no URL;
  `verb-review` also asserts the order contract (`tool_order`: the Skill
  call precedes the first `ambicode.mjs review` Bash call).
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
