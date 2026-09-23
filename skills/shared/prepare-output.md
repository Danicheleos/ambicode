# Reading `ambicode prepare --json`

Shared by every authoring skill that prepares before it works — today
`investigate`, `plan` and `task`. Read this once per session. Each skill
still runs `prepare` itself, with its own `--activity`; what they do with the
result is identical, so it is written once here instead of three times.

Always pass `--json`. The default text output is a human-readable overview,
not this contract.

## The default output is compact

`prepare` emits a compact projection, because a small change has to stay
cheap. It carries every applicable pack, rule, prompt and command decision in
full; what it leaves out is framing. Two things you reconstruct:

- a rule's **qualified id** is `` `<pack.id>/<rule.id>` ``;
- a rule's **authority** is the `authority` of the pack it sits under.

`--verbose` emits the same policy with every field spelled out, for
debugging. It is not the shape to read routinely.

## Fields

- **`sharedOperatingContract`** — the canonical operating contract (evidence,
  untrusted content, and how to weigh authority labels) that governs every
  AMBICODE skill, cited by `reference` and `contentHash`. The plugin's
  hook puts its text into context once per context epoch — at session start,
  and again on the first prompt after a compaction — so it is not re-sent on
  each call; if it is not in your context, rerun with `--with-contract`.
  Follow it, and do not restate its rules in your own output.
- **`policy.packs[].rules`** — the rules that apply to this activity and
  these paths. Apply them; cite them by qualified id.
- **`policy.prompts`** — scoped prompt content, already resolved and
  hash-verified. Read each entry's `content` directly at the stage its
  `stage` names; never resolve `declaredPath` against a local checkout path
  yourself. `prepare` never returns `before-review` content to an authoring
  skill: that stays owned by the isolated reviewer prompt.
- **`policy.commandDecisions`** — what `ambicode review`'s checks are allowed
  to run. Informational to an authoring skill; it enforces nothing itself.
- **`navigation`** — the bounded search order: the shortlist first, then known
  paths, then current-session LSP tools for definitions, references, callers
  and symbol lookup, then targeted Grep/Glob/Read only where LSP is absent or
  insufficient. The helper cannot see this session's tool inventory, so
  observe it yourself; `ambicode config` names the ecosystem's official
  Claude Code LSP plugin when you need to recommend one.
- **Read spans, not whole files.** Ask LSP where a symbol is defined or used
  and open only those lines with `offset`/`limit`. Read whole only what you
  are about to edit; to learn whether a behaviour is covered, grep the spec
  rather than reading it.
- **`navigation.shortlist`** — the candidate files for this request, present
  when the call passed `--term <term>` or requirement evidence to take terms
  from. Each candidate carries its `path`, a `score` comparable only inside
  that one call, and the `reasons` it ranked: a matching directory or
  filename, a content hit, or that it habitually changes together with a file
  the terms matched. `limitations` says what it could not establish.
  **It is a hypothesis, not an answer.** Confirm each candidate against the
  code before relying on it, and state which you confirmed, which you
  rejected, and which files you needed from outside it. Empty `candidates`
  means nothing matched well enough to start from — never "read everything".
  For a longer list, or for terms you choose rather than ones derived from a
  ticket, run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/ambicode.mjs" locate <term>... --json`.
  It reads git only: no index, no cache, nothing written.
- **`requirements`, `provenance`, `notices`, `diagnostics`** — what was
  pinned and what is worth saying out loud. An empty list is omitted rather
  than emitted.

## Failures

- `ambiguous-project` means this repository configures more than one project
  and the request identifies none of them. Ask which project, or narrow the
  paths. Never pick the first configured one.
- `config-missing` means the repository has no `.ambicode/config.yaml`; use
  `/ambicode:init` first.
- `preparation-blocked` means applicable content could not be delivered. It
  is a stop, not a warning: a policy that looks complete while quietly
  missing something applicable is worse than no policy.

## What no skill does with this

Do not build a second requirement parser, policy resolver, or configuration
reader. `ambicode prepare` is the one shared preparation boundary `review`,
`investigate`, `plan` and `task` all use.
