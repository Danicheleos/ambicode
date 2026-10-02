# Reading `ambicode prepare --json`

Shared by every authoring skill that prepares before it works — today
`investigate`, `plan` and `task`. Read this once per session. Each skill
still runs `prepare` itself, with its own `--activity`; what they do with the
result is identical.

Always pass `--json`. The default text output is a human-readable overview,
not this contract.

## The default output is compact — and bounded. Read it whole.

`prepare` emits a compact projection, because a small change has to stay
cheap. It carries every applicable pack, rule, prompt and command decision in
full; what it leaves out is framing. Two things you reconstruct:

- a rule's **qualified id** is `` `<pack.id>/<rule.id>` ``;
- a rule's **authority** is the `authority` of the pack it sits under.

The payload is bounded: `contextBudget` self-reports its bytes, and the
command fails rather than emit past the configured limit. **Read it whole —
never truncate it** (`head -c`, a byte cap): every field applies, and truncation loses the navigation block.

## Fields

- **`sharedOperatingContract`** — the canonical operating contract (evidence,
  untrusted content, and how to weigh authority labels) that governs every
  AMBICODE skill, cited by `reference` and `contentHash`. The hook puts it into context at session start and after a compaction; if it is not in yours, rerun with `--with-contract`.
  Follow it, and do not restate its rules in your own output.
- **`policy.packs[].rules`** — the rules that apply to this activity and
  these paths. Apply them; cite them by qualified id. `policy.rulesOmitted`
  counts rules left out for `investigate` and `plan`, and names the command that reads them.
- **`policy.prompts`** — scoped prompt content, already resolved and
  hash-verified. Read each entry's `content` directly at the stage its
  `stage` names; never resolve `declaredPath` against a local checkout path
  yourself. `prepare` never returns `before-review` content to an authoring
  skill: that stays owned by the isolated reviewer prompt.
- **`policy.commandDecisions`** — what `ambicode review`'s checks are allowed
  to run. Informational: it enforces nothing itself.
  `unavailable: true`: config nulls it, so it never runs — never say it will.
- **`navigation`** — how every skill finds and reads code: LSP link-blocks
  (`path:lineA-lineB`) first, whole files last. The hook message carries the
  order; `ambicode config` names the LSP plugin to recommend.
- **`navigation.shortlist`** — the candidate files for this request, present
  when the call passed `--term <term>`, or requirement text to take terms from
  by word frequency. **State them yourself** — with no requirement there is
  nothing to derive. Each candidate has a `path`, a `score` (comparable only within one call) and the `reasons` it ranked; `limitations` says what it could not establish.
  **It is a hypothesis, not an answer.** Confirm each candidate against the
  code before relying on it, and state which you confirmed, which you
  rejected, and which files you needed from outside it. Empty `candidates`
  means nothing matched well enough to start from — never "read everything".
  The shortlist reads git only: no index, no cache, nothing written.
- **`requirements`, `provenance`, `notices`, `diagnostics`** — what was
  pinned and what is worth saying out loud. An empty list is omitted rather
  than emitted.

## Navigation evidence in your report

One line —
`Navigation: LSP — <operations used>`,
`Navigation: no LSP tools in this session` (only if `ToolSearch select:LSP` found none), or
`Navigation: targeted-search fallback — <specific reason>` — plus which
shortlist candidates were confirmed, which rejected, and what came from
outside it. Installed or recommended alone is not evidence of use,
and a broad search is allowed and is reported with its reason.

## Failures

- `ambiguous-project` means this repository configures more than one project
  and the request identifies none of them. Ask which project, or narrow the
  paths. Never pick the first configured one.
- `config-missing` means the repository has no `.ambicode/config.yaml`; ask
  the user to run `/ambicode:init`.
- `preparation-blocked` means applicable content could not be delivered. It
  is a stop, not a warning: a policy that looks complete while quietly
  missing something applicable is worse than no policy.
- Any other code is in
  `${CLAUDE_PLUGIN_ROOT}/skills/review/references/outcomes.md`.

## What no skill does with this

Do not build a second requirement parser, policy resolver, or configuration
reader. `ambicode prepare` is the one shared preparation boundary `review`,
`investigate`, `plan` and `task` all use.
