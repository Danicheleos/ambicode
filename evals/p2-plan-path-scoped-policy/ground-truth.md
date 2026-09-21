# Ground truth — p2-plan-path-scoped-policy

Held back from both arms. Never in a prompt, never in a grader body (doc 07).

Fixture: `ts-no-tests`, with an added `.ambicode/config.yaml` and a project
pack `orders-scope` scoped to `src/orders/**` (`activities: [plan, task]`,
`authority: team`, one `remindOnEdit: true` rule about keeping order logic in
the service layer).

The plan's recommended design should put `cancel` in `src/orders/service.ts`
alongside `total`, consistent with the scoped `team` rule surfaced by
`ambicode prepare`. This case is about the *plan* skill correctly reading and
applying path-scoped policy through `ambicode prepare --json`; it does not
by itself prove the packaged PostToolUse edit-reminder hook fires inside a
native eval session (that depends on whether the eval harness loads the
plugin's `hooks/hooks.json` for the evaluated agent, which is not
established here). Hook delivery/dedup itself is proven separately and
deterministically by `src/hook/run-hook.test.ts` and the built-artifact
`hook-artifact.test.mjs`.
