# Graders: what to measure, how to write one, how to change one

Written 2026-11-07 after the suite-real work showed most graders unreliable (bare arm scoring 0 from a smaller
grader set, regex rounds that never matched, llm judges blind to the real defect). This is the guide every case
author follows. The mechanism it describes is in `evals/scripts/cases.mjs`, `real-cases.mjs`, `chain-cases.mjs`,
`run.mjs` and `diff-graders.mjs`; the harness evaluator itself ships with the `claude` CLI (`claude plugin eval`).

## 1. What a grader measures

- **Behaviour and policy adherence as the ticket and the delivered policies state them.** Never the name or location
  of a reference artefact, never "the plugin wrote file X". A plugin-only bookkeeping grader (route-done,
  report-sections, green-check-recorded) measures nothing the user cares about and inflates the plugin arm; keep at
  most one such grader per case and give it weight 1.
- **Exception, investigate cases**: the investigate route edits nothing, so its answer is the final message in both arms;
  an investigate case is graded by an `llm` grader on `last_message`, and its exact facts (cites, names) by `regex`
  graders on `last_message`, because that message is its only artefact in both arms (user 2026-11-08, RULES
  "Investigate is graded on its one answer, no judge").
- **Exact facts by `regex`/`diff`**: a migration head, a renamed field gone from every file, a required import, a
  syntactic policy (no `as any`, typed instead of `any`), a file that must or must not exist. One fact per grader.
  Match on added diff lines (`diff` grader, `in:` scoped to a path) or on a workspace file, not on the chat.
- **Behaviour by an `llm` grader focused on one workspace file** (the diff, `report.md`, `plan.md`), with a rubric
  that names the behaviour from the ticket and asks for a cited reason. Not on the last message: the last message is
  the model's own account.
- **Not measured**: verification bookkeeping (unrun checks, test or lint runs; evals null the checks in both arms),
  wording of the final message, counts of tool calls, anything that depends on the route's internal step ids.

## 2. The two arms must see the same graders

- Bare runs only the graders marked shared in `cases.mjs` (`:119`); in `real-cases.mjs` (`:127`) bare gets every
  non-diff grader except the plugin-only `route-done` and `plan-picked-up`. Plugin-only graders exist only for
  plugin-only artefacts and must carry weight 1 at most. A case whose plugin arm has 11 graders and bare 10 is comparable; one
  with 15 vs 1 is not (suite-real 5945/5915 today: 2 vs 1, almost all weight on one llm vote).
- Before a case is used for a comparison, print both grader lists side by side and the scored weight of each arm.
  If the weights differ by more than the plugin-only bookkeeping grader, fix the case before any paid run.
- A bare score of 1.0 on a real case means the case does not discriminate: replace the case, not the grader (RULES
  "Bare must not score 1.0 on a real case"). The bar is a project rule of 2026-11-07: bare below 0.8-0.9 on every
  kept case, because the graders are distrusted.

## 3. Writing a regex or diff grader

- Write the pattern against a real artefact first: an archived diff or file where the fact is present, and one
  where it is absent. Both must be in the repo or the archive before the grader lands; name them in the grader's
  `name`. If no negative artefact exists, make one by hand from the positive one (remove the fact).
- Match structure, not prose: a symbol, a call, a key, a decorator, an import. A regex on a sentence of the model's
  text fails on the first rewording and is the kind that cost two days in 2026-11 (four rounds, 90 variants, never
  green).
- Scope a `diff` grader with `in:` (a path regex; `diff-graders.mjs:33,36`) so a hit elsewhere cannot satisfy it.
  A regex grader has no `in:`: it reads one file, rendered as `target: {source: file, path}`. With `contains`,
  `perFile` passes when one in-scope file alone holds the pattern (`diff-graders.mjs:39,43`); "the fact must hold in
  every matching file" (a removed field) is `match: not_contains` with `perFile` (`real-cases.test.mjs:309`).
- `not_contains` graders need an `in:` scope and a positive sibling, or an empty diff passes them for free.
- Weight 1 unless the ticket's acceptance criterion says the fact is the whole point; then weight 2 and say why in
  `name`.
- Never use `count:N`, `last_message` targets, or trace matches outside init; they pin the mechanism.

## 4. Writing an llm grader

- `focus`: one file (`{source: file, path: ...}`). The rubric gives: the ticket's requirement in its own words, what
  a pass looks like in code terms, what a fail looks like, and "answer with the path:line that decides it".
- Three votes majority is the harness default; five for the review regrade (`review-regrade.mjs:16`). Do not raise
  votes to fix a flaky rubric: tighten the rubric to a checkable fact or move the fact to a `diff` grader.
- The judge is blind to the plan and the report unless the rubric hands them over; keep it blind.
- An llm grader that fails on both arms for the same code is noise: read the two artefacts, decide which arm is
  right by the ticket, and rewrite the rubric before trusting it again. Record the decision in LOG with the stamps.
- Fail-closed: a judge error counts as fail. A case whose score rests on one llm vote therefore needs a second,
  independent grader on the same requirement (a `diff` fact), or its spread will swamp the arm difference.

## 5. Cases: fixed sets, no fitting

- A fixed list per skill, at most 10, chosen once (plan 1 of 2026-11-07); after that no case is added, rewritten or
  re-seeded to match a run. A case-setup error is reported and the user decides.
- Names: `<skill>-<repo>-<ticket>`; existing frozen names (e.g. `task-real-fe-vs-6545-reba-submit`) stay as they are. Prompts in a plain user's words; policies absurd but checkable; reuse traps.
- No bench word, project name or ticket phrase leaks into a skill text, prompt, example or policy.
- Keep per case: the ticket text, the truth (graders), the bare runs that set the baseline (stamps in STATE), and
  the judge protocol file. Final workspaces are deleted by the harness; keep the diff the run stored so a regrade at
  $0 stays possible.

## 6. Changing a grader

- Only when the grader is shown wrong against the ticket (not against a run): quote the ticket line, the artefact
  line and the grader, and log it. Then regrade the archived results of both arms at $0 (`--regrade` re-scores the stored result through
  `regradeStamp` -> `scoreCase`, `run.mjs:278-288`, llm graders untouched; `with-only` marking happens only in the
  live path, `run.mjs:312`). `review-regrade.mjs` is review-only (it matches review findings to known issues); no
  regrade exists for other llm graders. Do this before any paid run.
- Frozen cases (suite-real FE 5945, 6545, 5915: bare ran) are not edited; an unfounded fail there is noise and the
  verdict comes from the blind judge or reading.
- Never run `npm run evals:generate` against a tree you cannot lose: a full run (`cases.mjs:156-164`) deletes and
  re-renders only the suite directories of the cases it renders; `init`, `task-chain` and the other suites stay.

## 7. When graders cannot decide: the blind judge

- One fresh haiku reader per run: ticket, whole diff, base code by `git show`/grep, frozen policies; no plan, no
  report, no grader. Output: requirements met / partly / missed with path:line, blockers with path:line, merge
  yes/no. The master verifies each blocker by one read before it counts.
- Two runs per arm minimum; a blocker that one judge gives and the other does not on the same code is noise and is
  settled by the master's read, not by averaging.
- The judge protocol file (`evals/local/judge/PROTOCOL.md`, written by the gate-methodology plan; until then the judge briefs in
  `evals/local/judge/` are the record) is the only prompt used; its text does not change
  between the two arms or between runs of one gate.

## 8. Checklist before a case or grader lands

1. The fact comes from the ticket or a delivered policy; the grader names which.
2. A regex/diff grader keeps the positive and negative artefacts §3 names and passes/fails on them at $0. An llm grader has
   no $0 judge path: its right and wrong shapes go into the rubric as PASS/FAIL example clauses (as
   `nothing-sends-the-summary`), and the next live run is the check.
3. Both arms' grader lists and scored weights printed and equal up to one bookkeeping grader.
4. Bare x1 on the case scored below the bar; the stamp is recorded.
5. No bench-specific word in any skill text (grep).
6. LOG line with the case name, the stamps and the lists.
