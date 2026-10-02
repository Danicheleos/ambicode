# The code-reading flow with LSP: what runs, what was proven, what is open

Report 4, written 2026-10-02 after iteration 4 of [skill-gap-plan.md](skill-gap-plan.md).
Scope: how `investigate`, `plan` and `task` find and read code, and whether
the model actually uses LSP for it. Wording and reasoning tuning, the
plugin-versus-naked comparison and `evals:decide` are out of scope here.

All evidence below comes from headless `claude -p` runs on Sonnet 5.5 against
a rebuilt BE benchmark scaffold, no prompt mention of LSP, $0.10–0.36 each.
Most cases are **n = 1**. They show mechanics, not rates. Ticket ids are
omitted on purpose; the benchmark is under NDA.

## 1. The flow

```
entry                       what runs (code, not the model)                  what the model does
─────                       ───────────────────────────────                  ───────────────────
/ambicode:X "question"      UserPromptSubmit hook → prepare + READING_ORDER  reads the message
X <ticket key or URL>       skill-load hook says "fetch the ticket"          fetches via Atlassian MCP
                            PostToolUse hook on the fetch → prepare on the   reads the message
                            ticket text + READING_ORDER
model picks the Skill tool  PostToolUse(Skill) hook → prepare + READING_ORDER (same)
```

`prepare` returns the shortlist (paths and reasons, no code) and the policy
gated by activity: `investigate` none, `plan` all but `code-style`, `task` all.
`READING_ORDER` (`src/code-intelligence/navigation.ts`) is the single source
for how to read code. The hook puts it at the top of its message.

**Reading order, as agreed:**
1. `ToolSearch select:LSP` (deferred), then `workspaceSymbol` / `documentSymbol`
   turn the ticket terms and the shortlist into **link-blocks**
   (`path:lineA-lineB` or `path:lineA`). Absolute paths; retry a failed call once.
2. LSP finds nothing: stop, ask the user for the scope. No Grep, no Bash
   search, no note.
3. Read link-blocks with offset/limit. A related type, method or call that
   cannot be placed: `goToDefinition` / `findReferences` / `workspaceSymbol`
   on it, read the new link-blocks, repeat. Before writing something new,
   `workspaceSymbol` for an existing one.
4. LSP returned only paths: `Grep -n` that file for lines and structure,
   then Read chunks.
5. Whole-file Read is the last resort: steps 1–4 failed and the file is under
   300 lines. (The 300 is an unmeasured choice.)

## 2. What was proven

Same ticket investigation, no LSP mention, only the delivery of the policy
changed:

```
policy delivered as                      LSP calls   Bash cat before LSP   Navigation line
one hint field inside the JSON payload   0           yes                   wrong ("LSP not loaded")
text in the shared reference file        1 (late)    yes                   missing
step in the skill body                   2–6         no                    accurate   (2 of 2 runs)
reading order in the hook message        5–6         no                    accurate   (1 run, then edge cases below)
```

- The model loads and uses `LSP` only when the instruction is in text it is
  certain to read. A reference file it may skip does not count. The hook
  message is the one place that is always read and shared by all skills.
- The old evidence wording, "No LSP tools in this session is complete", let
  the model skip the load. It now reads: `"No LSP tools" counts only if
  ToolSearch select:LSP found none.`

Edge cases, one run each:

| Case | Outcome |
|---|---|
| Terms match nothing | Three `workspaceSymbol` calls, none found; the agent stopped, asked where the code lives, ran no grep, saved no note. **Before** the slash-command fix it grepped and saved a note. |
| Method in a 2,880-line file | `documentSymbol`, then Read of lines 280–400 and 399–499. No whole-file read. |
| LSP tool disabled | Said `ToolSearch select:LSP` found none, fell back to stated grep plus Read, did not stop to ask. |
| `plan`, bare question | LSP used. The payload is over the 9,800-character inline window, so the message reached the agent as a file with a preview; the reading order was in it. |
| `plan`, ticket via Rovo | One `workspaceSymbol`, then `grep -rn` for consumers instead of `findReferences`. |
| `task`, small edit | `workspaceSymbol` for an existing helper before writing a new function. |

## 3. Gaps

**G1. A typed slash command bypasses the Skill hook (found, fixed).**
Claude Code expands `/ambicode:investigate …` into the conversation without a
`Skill` tool call, so `PostToolUse(Skill)` never fires. Everything the
2026-09-30 hook work assumed ("the hook runs `prepare` when the skill loads")
held only for the model choosing the Skill tool, which is how the evals run.
Fix: `UserPromptSubmit` runs the same preparation for a prompt that starts
`/ambicode:(investigate|plan|task)`, covered by a test. **Open:** the field name
and prompt form in an interactive VS Code session are unverified; only headless
`-p` was run. A prompt that is not exactly that shape also gets no hook:
leading text before the command, another namespace spelling, or natural
language that the model routes some other way. Test these interactively.

**G2. The binding can stop a ticket run before it starts (not fixed).**
`requirements.mcpServer: atlassian` does not equal the connected server
`claude.ai Atlassian Rovo`. In 1 of 2 identical runs the agent stopped to ask
which to use; in the other it went on. It is an inconsistency in the
requirements step, independent of LSP. The tool-name regex was written to
tolerate the `plugin_atlassian_atlassian` and `claude_ai_Atlassian_Rovo`
segments, but the colon form of the binding (`plugin:atlassian:atlassian`) is
not tested against it.

**G3. `findReferences` is blind without dependencies.** The scaffold copy has
no `node_modules`, so the TS server cannot resolve imports, and
`findReferences` often returns only the definition. The agent then greps for
callers and says why. A real project with installed dependencies should do
better; **not measured.** Test on a repository with dependencies before
judging LSP's value.

**G4. Link-blocks are read less strictly than the rule says.** Small files
(15–43 lines) were read whole after `documentSymbol`. That is within the
300-line limit but not the "read link-blocks" step. Large files were read in
blocks. Whether the rule holds on a 100–300 line file is untested.

**G5. A Grep before the first LSP call still happens sometimes.** Two or three
runs show one early grep. The wording "search code with LSP before any Grep"
is in the order; compliance is not total.

**G6. `plan` and `task` payloads exceed the inline window.** 13.7 KB and
16.3 KB on the BE scaffold; they arrive as a file behind a preview. The
reading order is at the top and was seen, but any change that moves it down
would lose it. Cutting the rules from those payloads, not the order, is the
real fix and is not started.

**G7. `review` does not use any of this.** It builds a diff snapshot in the
CLI and has no `prepare`. Using `findReferences` on changed symbols to find
callers outside the diff is a proposal, untested.

**G8. Not measured.** Recall or cost against the naked model with LSP in
the loop. `evals:walk` cannot load `typescript-lsp` (the sandbox loads only
the plugin under test), so LSP use can only be checked in ordinary sessions
or headless runs like these. A short contrast (8–12 runs) is the next
measurement, after G1 and G3 are settled.

## 4. Side effects of the change

- `skills/investigate/SKILL.md` is 6,344 bytes (ceiling 7,100); step 4 is a
  pointer plus the empty-result rule.
- `skills/shared/prepare-output.md` is 4,738 bytes (ceiling 5,550); its
  navigation bullet is three lines.
- One existing test changed on purpose: the hook-header cap of 260
  characters now excludes the reading-order block, and a new assertion checks
  the block is present. The check that the whole message stays under 9,800
  characters still covers it.
- `evidenceRequirement` and `readGuidance` are rewritten and stay under their
  100-character caps. `prepare.test.ts` pins the new evidence wording.
- Test count 799 (`npm run verify`: 798 pass, 1 skipped, 0 fail).

## 5. Next, in order

1. Verify G1 in an interactive session, typing the command three ways:
   exact, with a leading sentence, via natural language.
2. G3: one run on a scaffold with dependencies installed.
3. Decide G2 with the owner of the MCP binding.
4. Short plugin-versus-naked contrast, 8–12 runs, once 1 and 2 are done.
5. Link-blocks per candidate in the `prepare` payload (cheaper than asking the
   model to ask LSP for them), then the Haiku term transformer, only if the
   contrast shows value.
