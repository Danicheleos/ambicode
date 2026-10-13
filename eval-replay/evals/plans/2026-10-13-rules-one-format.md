# One rule format for presets, init and /rules (proposal, 2026-10-13)

## Today (mapped 2026-10-13, spot-checked against the code)

| Entry | Format | Where it lands | Dedupe |
|---|---|---|---|
| Presets `policies/*.yaml` | PolicyPack: id, category, instruction, check, authority, appliesTo, activities | selected through `project.packs: [builtin/<id>]` | pack id and `pack/rule` id only |
| init (scout, web, manual) | `{source, rule}` free string, at most 10 | `.ambicode/config.yaml` `projects[].rules` | the instruction "deduplicated" only |
| /rules | PolicyPack plus `source:{quote, location}` per rule | `.ambicode/policies/<id>.yaml` via `policyFiles` | pack id, plus the model reading `policies/` |

Defects:
- **Init's rules use a separate channel.** `stage.ts:40-41` adds them as unlabelled bullets after the pack rules.
  - They have no id, authority, scope or activity.
  - They are the first lines cut at the 4 KB cap.
  - They are missing from review `ruleIds`.
  - `docs/rule-migration.md` says this channel does not exist.
- **Init writes invalid pack references.** It writes bare pack ids; the template shows `packs: [angular-http]`. `config/load.ts:65` requires `builtin/<id>`.
- **Nothing dedupes init's rules.** They are never compared with the presets, and /rules never reads them. The scout's conventions are also written twice: to `context/conventions.md` and to `rules`.
- **Rule selection ignores scope.** `appliesTo` is never applied, because `common.ts:135` passes `paths: []`. Every rule goes to every activity of its pack.

## Proposal

1. **One format: the pack.** Every rule, whatever its source, is a PolicyPack rule in a YAML file.
   - Presets stay in `policies/`.
   - Project rules live in `.ambicode/policies/<id>.yaml`, listed in `policyFiles`.
   - `projects[].rules` and its `Rule`/`RuleSource` schema are removed (config v5). The loader rejects a config that still has `rules`, with a message saying to run `/ambicode:rules`.
   - The second channel in `stage.ts:40-41` goes.
2. **One way in: draft, then apply.** Init stops writing rules. It hands its candidates (the scout's conventions, the web search, manual) to the existing /rules authoring path, `drafts.ts` and `rules apply`. Every source then passes the same validator and the same gate.
   - **Provenance** is `source:{quote, location}`:
     - a scout rule quotes the file it came from (`path:line`);
     - a web rule keeps its URL and is flagged `pack-quote-unchecked`, as https locations already are.
   - **Authority** follows the source:
     - a written project rule is `team`;
     - a scout inference is `observed`;
     - a web practice is `inherited`.
3. **No overlap, checked mechanically.**
   - The draft step's payload lists the enabled rules: the presets plus the existing project packs.
   - `drafts.ts` rejects a draft rule whose id, or whose normalised instruction, equals an enabled rule.
   - A draft that refines a preset rule uses the existing `replaces` (for a whole pack) or is dropped.
   - `context/conventions.md` keeps only descriptive facts. A convention that became a rule is cut from it, and a line points to the pack instead.
4. **The right place: scope on every rule.**
   - **Per-rule fields.** Add optional `activities` and `appliesTo` to each rule. They default to the pack's values.
   - **Real paths.** `policy.stage` passes the paths it already has (map candidates, brief anchors, diff files) instead of `[]`. A Python rule then never reaches a TypeScript change, and an architecture rule never reaches the task change step.
   - **Built-in rules get activities.** `common-quality`'s 16 rules are tagged, for example:
     - plan: need, fix-the-cause, cohesion, reuse, complexity, ownership, data-boundary;
     - task: naming, effects, comments, error-honesty, tests, dead-surface;
     - review: all.

   This is phase 2's rule diet. The aim is 1.5 KB or less per step, down from 4,038 B.
5. **Valid references.** The init text and the template use `builtin/<id>`. A pack declares the commands it needs, and init only enables a pack whose commands it found or declared. This removes the `pack-unknown-command` errors.

## Open decision

- **Telling Angular from Express.** Their packs share `**/*.ts`, so `appliesTo` cannot choose between them. Option: init selects a pack by a marker the pack declares (a dependency name in the manifest), measured from the repository, not from a table. Another option: leave the choice to init's judgement, as it is now.

## Tests (change by change)

- **Schema and loader:** a config with `rules` is rejected with the message, and per-rule `activities` and `appliesTo` resolve.
- **Stage:**
  - a plan stage carries only plan rules;
  - a `.py` rule is absent for `.ts` paths;
  - the old "Project rules:" assertion in `stage.test.ts:35` is replaced by a test that a project pack's rule is rendered with its id and authority.
- **Drafts:** a duplicate of a preset instruction is rejected, and a web rule gets `pack-quote-unchecked`.
- **Init:** `init-auto` writes packs, with no `rules` key in the config. That case's graders follow the new destination; this is a case version bump.
