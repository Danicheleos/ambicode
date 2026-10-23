# Candidate rules become draft packs

Init writes no rule into `config.yaml`. A candidate is drafted into `.ambicode/policies/drafts/<id>.yaml`, one pack per scope, in the format of `skills/rules/references/pack-format.md`. The `rules` route checks it and applies it only on the user's answer.

| Candidate from | `authority` | `source.location` |
|---|---|---|
| A rule a project document states (README, CONTRIBUTING, CLAUDE.md) | `team` | `path:line` of that document |
| A convention the scout inferred from code | `observed` | `path:line` of the code it saw |
| A web practice (`WebSearch`) | `inherited` | the page URL; the check flags it `pack-quote-unchecked` |
| The user's own answer | `team` | `user answer at init` (no file: ask for the document or drop it) |

Each rule needs `source.quote`, 20 or more characters copied verbatim from that location. A rule you cannot quote is dropped, not paraphrased.

Draft a rule a project document states even when a built-in pack covers it: the team's rule outranks a built-in template. Skip only a candidate identical to a rule in force: the check rejects a rule whose id or instruction (case, spacing and final punctuation ignored) equals one, and `config.yaml`'s `packs` and `policyFiles` (built-in copies included) show what is in force. A convention that became a rule is not repeated in `context/conventions.md`.

```yaml
schemaVersion: 1
id: observed-conventions
authority: observed
appliesTo: ["src/**"]
activities: [review, task]
source: { location: "scout inference" }
rules:
  - id: config-read-once
    category: architecture
    instruction: Read configuration in one module and pass the values down.
    check: { kind: reviewer, explanation: Judged from the diff. }
    source: { quote: "config = load_config(environment)", location: "src/main:9" }
```

A rule may narrow its pack with `activities` (plan, task, review); omit it to take the pack's.
