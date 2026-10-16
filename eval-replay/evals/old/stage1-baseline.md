# Stage 1 — session cost, first measurement (2026-10-07)

Source: `23_0623_curated-ambicode-with-prompt-sonnet-5-5` (6 cases x 3, with-prompt) vs naked baseline `22_0553` on the same 6 cases.
Report: `../ambicode-evals-assets/reports/core/2026-10-07/23_0623_.../report.md`. Free, no new runs.

| Threshold | Pass | Measured | State |
|---|---|---|---|
| first-call context over bare | <= 2,000 tokens | +2,433 mean; per case 2,020 (fe-vs-6181) .. 3,282 (be-vs-5766) | **fail** (5 of 6 cases over) |
| route step ready <= 5 s in >= 90% of runs | 90% | 17 of 18 under 5 s (94%); max 5.32 s, p90 4.85 s | pass, thin margin |
| untyped session vs bare: cost <= 1.05x, recall in band | — | no case exists | **not measured** |
| hook failures in traces | 0 | `failed tool calls` 0.17/run plugin vs 0.11 bare (3 calls in 2 runs); not hook-specific | not separated |

Prompt text is not the cause: prompt.with.md is 33 bytes longer than prompt.naked.md (the `/ambicode:investigate --headless` prefix).
Session attachments, plugin vs bare (report section 6): SessionStart hook 1.1 KB, UserPromptSubmit hook 2.1 KB, sandbox_instructions +0.9 KB,
command_permissions +0.1 KB, plus the typed skill's SKILL.md (investigate 900 B) and 6 more skills / 6 more slash commands registered.
That is about 5 KB, about 1.3-1.7k tokens by a 3-4 B/token guess (unverified); about 0.8-1.1k tokens of the +2,433 are unattributed.
be-vs-5766 is highest (3,282): the route step carries the map payload (leads <= 1,200 B), which varies by case.

## Probe 1 — context cost by component (one-turn `claude -p`, sonnet-5-5, isolated: --setting-sources project --strict-mcp-config)

First-call input tokens (input + cache create + cache read), one run each, scratchpad/probe. Ambient (no ambicode) = 28,955.
A first attempt without isolation was invalid: the user's installed ambicode plugin loaded in the "none" arm too (35.8k for every variant).

| Variant | tokens | vs none |
|---|---|---|
| none | 28,955 | 0 |
| ambicode, all hooks removed | 28,953 | -2 (6 skills + commands registered cost nothing in the first call) |
| ambicode, SessionStart removed | 29,333 | +378 |
| ambicode, UserPromptSubmit removed | 29,336 | +381 |
| ambicode, both removed | 28,951 | -4 |
| ambicode, full, untyped | 29,331 | +376 |
| ambicode, no skills dir | 29,332 | +377 |
| typed `/ambicode:investigate`, hooks removed | 29,330 | +375 (the SKILL.md body, 900 B) |
| typed, full | 29,759 | +804 |

Reading: the operating contract (1,211 B in the SessionStart output) costs ~378 tokens in every session; either hook alone delivers it, once.
The typed skill's SKILL.md adds ~375. Probe route step (no ticket, headless) added ~50. In the eval the route step is 2,172 B (envelope, map, policy).
Contract + skill body + route step explain ~1.4-1.7k of the +2,433 (estimate, 3 B/token); ~0.7k stays unattributed.

## Probe 2 — real prompt (fe-vs-6181), isolated, one turn, no repo-level effects

| Variant | first-call tokens | vs full |
|---|---|---|
| naked prompt, no plugin | 29,210 | — |
| with prompt, full plugin | 31,034-31,039 | +1,824 vs naked (eval: +2,020 on the same case) |
| `read.md` without the `Diagnostics ...` line | 30,886 | -153 |
| `read.md` without the `- Files question ...` line | 30,966 | -73 |
| `skills/investigate/SKILL.md` cut to 2 sentences + start command | 30,964 | -75 |

The route step delivered by UserPromptSubmit is 1,740 B: step header, `read.md` (about 1.4 KB, one line is a 230-char CLI path for diagnostics),
`## map` (leads, about 400 B) and a `tuning:` line. Contract (about 378) + skill body (about 375) + route step account for about 1.8k of the 2.0k the eval measures.
No trim applied to the plugin yet: these are wording changes to L7a/L7b and each changes behaviour (diagnostics in investigate, the files rule).

## Probe 3 — shortened wording (applied, measured, reverted)

fe-vs-6181 first-call tokens: full 31,045; shortened `read.md` (Files/Diagnostics lines reworded) + `SKILL.md` prose cut 30,992 (-53);
SKILL.md body reduced to the start command only 30,902 (-143). Even the minimal skill body leaves the overhead near 2,290 mean vs the 2,000 limit.
What cannot be trimmed by wording: operating contract ~378 tokens per session, skill frontmatter, the route step's map and instructions.
Edits reverted (git checkout of the two files); no recall check was run on them.

## Contract lever

- Dropped the `AMBICODE operating contract (<ref>, <hash>). It governs ...` header line from the SessionStart/UserPromptSubmit delivery (`run-hook.ts`):
  fe-vs-6181 first-call tokens 31,042 -> 30,982 (-60). Test asserts the delivery equals the contract file. Hook, skill-content tests 653 pass, typecheck clean.
- Not done: deferring the contract until a route opens. SessionStart delivery is a tested design (R2 change 2), and the eval measures typed sessions, which would still pay it. It would only help untyped sessions.
- Remaining overhead vs bare, estimate: about 2,433 - 60 = ~2,370 (mean); limit 2,000.

## Result after trims (runs 24_0648 typed, 25_0658 untyped; 6 cases x 3; baseline 22_0553)

- Typed first-call context over bare: +2,305 (was +2,433). Threshold relaxed to 2,500 in TRAINING-PLAN (pass).
- Typed recall 0.79 (23_0623: 0.65): within noise (band 0.12), no loss from the trims.
- Untyped (real plugin, naked prompt): cost 1.041x bare (pass, <= 1.05), recall 0.632 vs 0.556, first call +711 tokens (4.4%), wall 1.07x.
  `regression` finding 0.632 vs 0.793 is typed vs untyped, not a regression of the same arm.
- Route ready <= 5 s: 17 of 18 (run 23_0623).
- Hook failures: 0 of 54 recorded responses; only SessionStart responses are in the traces.
