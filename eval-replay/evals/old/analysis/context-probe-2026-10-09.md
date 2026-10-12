# Context probe, S5 (2026-10-09)

Method:
- One `claude -p` per arm and case. CC 2.1.292, Sonnet 5.5, effort low, `--setting-sources project --strict-mcp-config`.
- Each session is killed at its first assistant message. First-call tokens = input + cache create + cache read.
- Each run starts in the case's freshly scaffolded directory. The plugin is a copy of the built repository with `hooks/hooks.json` edited.
- Arms:
  - `naked`: `prompt.naked.md`, no plugin.
  - `noHooks`: plugin, no hooks, typed prompt.
  - `noUPS`: no UserPromptSubmit hook.
  - `full`: the whole plugin.
- 22 calls, about $1.5 (estimate from the usage fields).

```
case        naked   noHooks         noUPS         full           full-naked   prompt.with
be-vs-5071  30,714  31,363 (+649)   +265          +917           +1,831       1,091 B
fe-vs-5967  30,807  31,548 (+741)   +260          +1,012         +2,013       1,312 B
be-vs-4606  32,679  35,287 (+2,608) +249          +1,124         +3,981       6,410 B
be-vs-4835  32,597  35,123 (+2,526) +262          +849           +3,637       6,265 B
fe-vs-6141  32,659  35,251 (+2,592) +254          +1,026         +3,872       6,338 B
```

The columns are steps from the previous arm:
- `noHooks − naked`: the typed skill.
- `noUPS − noHooks`: the SessionStart contract.
- `full − noUPS`: the UserPromptSubmit route step.

## The outliers are the typed skill repeating the ticket

- **Two copies of the arguments.** Claude Code puts the arguments of a typed skill into the session twice: once in the command message, and once in the expanded SKILL.md. `investigate/SKILL.md` names `"$ARGUMENTS"` in its fallback start command.
- **Removing `$ARGUMENTS` alone changes nothing.** CC 2.1.292 then appends `ARGUMENTS: <args>` to the body:
  ```
  be-vs-4606 noHooks, fallback "<the request>"              35,310   (35,287 with $ARGUMENTS)
  ```
- **Any substituted placeholder stops the append.** CC's substitution sets a flag when any placeholder (`$ARGUMENTS`, `$ARGUMENTS[N]`, `$N`, named) is substituted. It appends only when nothing was substituted. With `$0` (the first argument word) in the fallback sentence:
  ```
  be-vs-4606 noHooks, fallback names `$0`                   33,073   (-2,214; skill now +394 over naked)
  ```
- **The cost grows with the ticket:** about 1,900 tokens extra on the 6 KB tickets, a few hundred on the short ones.
- **The plan skill pays twice.** `plan/SKILL.md` names `$ARGUMENTS` twice, once in prose and once in the command, so it carries the ticket two more times.

## The rest

- The SessionStart contract costs about 255 tokens per session.
- The route step costs 850–1,120 tokens: the step text, the map and the policy.
- The eval measures more than this probe (+2,824 mean) because the eval sandbox adds about 880 B of `sandbox_instructions` with the plugin's paths.

## Applied

Applied 2026-10-09 to investigate, plan and task (review left: its arguments are short options). The fallback names `"<request>"` and the body fills only `$0`. Measured on the repository files: be-vs-4606 full 36,660 → 34,428; be-vs-5071 32,545 → 32,276.
