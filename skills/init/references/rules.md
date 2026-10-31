# Candidate rules become draft packs

Init writes no rule into `config.yaml`. A candidate is drafted into `.ambicode/policies/drafts/<id>.yaml`, one pack per scope, in the format of `skills/rules/references/pack-format.md`. The `rules` route checks it and applies it only on the user's answer.

| Candidate from | `authority` | `source.location` |
|---|---|---|
| A rule a project guideline document states (README, CONTRIBUTING, docs) | `team` | `path:line` of that document |
| A convention the scout inferred from code | `observed` | `path:line` of the code it saw |
| A web practice (`WebSearch`) | `inherited` | the page URL; the check flags it `pack-quote-unchecked` |
| The user's own answer | `team` | `user answer at init` (no file: ask for the document or drop it) |

Never draft from a file Claude Code loads into every session itself: `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `.claude/rules/*`, nested `CLAUDE.md`, and any file they `@import`. The model already reads them; a draft would be a second copy. `policy check --drafts` rejects a quote located in one.

Each rule needs `source.quote`, 20 or more characters copied verbatim from that location. A rule you cannot quote is dropped, not paraphrased.

Compare each candidate with the rules in force (`config.yaml`'s `packs` and `policyFiles`, built-in copies included) and with your other drafts. The same requirement in other words is not a new rule: skip it, or merge it into the draft that has it, and say which rule absorbed it. The check rejects an id or instruction (case, spacing and final punctuation ignored) equal to one in force and warns `pack-rule-similar` for a close wording. A convention that became a rule is not repeated in `context/conventions.md`.

```yaml
schemaVersion: 1
id: observed-conventions
authority: observed
appliesTo: ["src/**"]
activities: [plan, task, review]
source: { location: "scout inference" }
rules:
  - id: config-read-once
    category: architecture
    instruction: Read configuration in one module and pass the values down.
    check: { kind: reviewer, explanation: Judged from the diff. }
    source: { quote: "config = load_config(environment)", location: "src/main:9" }
```

Choose `activities` by what the rule decides. A rule about where code goes or who owns it (layers, boundaries, reuse, state ownership) steers the plan too: `[plan, task, review]`. A rule about how code is written (naming, style, error text) is `[task, review]`. A rule may narrow its pack with its own `activities`; omit it to take the pack's.
