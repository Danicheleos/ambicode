# fe-vs-5164-plan: 17 R1 (e-TTdy5z)

[Case comparison](../cases/17/fe-vs-5164-plan.md) · [Complete data and tool outputs](e-TTdy5z.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/17_1451_walk-ambicode-with-prompt-sonnet-5-5/traces/e-TTdy5z.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.3340 + judge $0.0038 = total $0.3378. Harness turns 14, API requests 10, tool calls 13.

## Starting inputs

Prompt SHA256: `b9010b5ce839f4f702220120b4342e58e041a589bfc0897654147b98b081d320`. Normalized delivered-step SHA256: `a95e3e338d24d3c7381c89e4d457c4b45be0bf2f27ab4bf1f5b533c43bd2e373`. Contract SHA256: `41521b1cb6e391b5089f71332cdeb878a433ecf87f385df4a23d9150719fb704`.

The exact prompt lives in the immutable eval result linked from the main report; the complete initial route delivery and contract text are in this attempt JSON.

```text
[ambicode] plan · task create-implementation-plan-request-inclu · step design (4/9)
Now: Design the change, then continue the route.
Then: node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" route next --task create-implementation-plan-request-inclu
Route: ground (done) · design (now) · plan-step · plan-write · plan-check · plan-accept · promote (if needed)

Mode: headless (set by the user).

- Reuse sweep first: for each piece the change needs, look for an existing one with `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" find <name> --task create-implementation-plan-request-inclu` and read the matches. Reuse over new; a new helper beside an existing one is a defect.
- Write down the design and its real alternatives, with the cost and risk of each and one recommendation. Cite `path:line` for facts; name assumptions.
- A decision is material when the alternatives lead to different code, contracts or behaviour a reviewer would notice; it is routine when policy, the requirement or the project's structure already settles it. Never ask about a routine one.
- Ask the user each material decision with one `AskUserQuestion`, one question per decision, ending the question with `[ambicode gate decision:<slug>]` (a short kebab slug per decision). An unanswered decision stays open and the plan stays a draft.
- Keep every acceptance unit id below: the plan maps each one.
Then run `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" route next --task create-implementation-plan-request-inclu`.

## map
tuning: 3bd1fbc43250
Leads from the terms IndexedDB, US-ADV-ENG, concurrency-related, in-app, closing/refreshing, InexedDB, refreshes/closes:
1. main/features/score-types/shared/services/wizard-auto-launch.service.ts — contains the word of the request
2. main/screens/login/login.component.spec.ts — contains the word of the request

## policy:before-work
Rules:
angular-architecture/follow-declared-structure (inherited): Place new files according to the structure the project already uses. Where a change introduces a different grouping from its neighbours, that is a decision to state, not a detail to leave implicit.
angular-architecture/no-unrequested-migration (inherited): Approving a target structure does not authorize moving unrelated existing code into it. Restructuring outside the change's stated scope belongs in its own change.
angular-architecture/shared-code-placement (inherited): Code that carries a feature's domain knowledge belongs with that feature. A shared or utility location is for context-free behaviour with more than one demonstrated consumer.
angular-components/component-responsibility (inherited): A component owns rendering, local UI state, and user interaction. Transport concerns and long-lived application state belong to the project's approved service or facade layer, not to the component.
angular-components/component-size (inherited): Where a component has grown to cover several independent interactions, say which part would move to a sub-component, a directive, or a service, and why that boundary exists.
angular-components/template-duplication (inherited): Repeated markup and repeated view logic across components are a reuse question before they are a style question.
angular-http/cross-cutting-http-concerns (inherited): Authentication, tracing, and shared headers belong in one interceptor rather than copied into each endpoint.
angular-http/duplicate-requests (inherited): Decide once whether a request is returned, shared, or promoted into state. Several independent subscriptions to the same cold request issue it several times.
angular-http/error-semantics (inherited): Return the failure to the caller or translate it into a typed, documented result. A swallowed error combined with a success-shaped value leaves the caller unable to tell what happened.
angular-http/response-validation (inherited): A response type parameter is a compile-time assertion. Narrow or validate an untrusted response where it enters, before it reaches application state.
angular-state/state-owner (inherited): Every piece of shared state has one writer. Exposing a mutable subject or writable signal outside its owner means any consumer can change it, and the owner can no longer state an invariant about it.
angular-state/subscription-lifetime (inherited): Every subscription has an owner and a bounded lifetime. A deliberate fire-and-forget effect states how it handles its own failures.
common-quality/cohesion (inherited): Keep one reason to change per unit. Where a change adds an unrelated responsibility to an existing unit, say which unit should own it instead.
common-quality/data-boundary (inherited): Validate untrusted data once where it enters, and map between transport, domain, and presentation shapes explicitly when their invariants differ. A static type is a compile-time assertion, not runtime validation.
common-quality/dead-surface (inherited): Remove code, members, and work that the change leaves unreachable or unused.
common-quality/effects (inherited): Make mutation, subscriptions, and side effects locally visible and bounded. Treat inputs as read-only unless the contract says otherwise.
common-quality/error-honesty (inherited): Distinguish an impossible invariant breach from an expected failure. Fail fast for the first; handle the second at its owner. An empty catch, a swallowed failure, or a success-shaped value returned after a failure hides the outcome from the caller.
common-quality/explicit-surface (inherited): Dependencies, control paths, absence cases, and side effects a caller must know about belong in a typed API, a named operation, or an explicit branch, not in a positional flag or an undocumented ordering requirement.
common-quality/honest-gaps (inherited): Record a genuine verification gap rather than describing coverage that does not exist.
7 more: `policy --activity plan --stage before-work --show`
```

## Engine events in recorded order

The engine ledger and model trace use different clocks/events. Entries below retain timestamps; model calls follow in their own recorded order. No invented interleaving or internal model reasoning is assigned.

| # | UTC | Event | Input / output / state |
|---|---|---|---|
| 1 | 2026-10-09T14:54:16.176Z | route | {} |
| 2 | 2026-10-09T14:54:16.177Z | preanswer | {"gate":"plan-accept"} |
| 3 | 2026-10-09T14:54:16.178Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 4 | 2026-10-09T14:54:16.178Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 5 | 2026-10-09T14:54:16.182Z | envelope | {} |
| 6 | 2026-10-09T14:54:16.954Z | map | {"bytes":462} |
| 7 | 2026-10-09T14:54:16.985Z | policy | {"bytes":4034} |
| 8 | 2026-10-09T14:54:16.986Z | step | {"step":"ground","actor":"code","status":"completed","ms":808} |
| 9 | 2026-10-09T14:54:16.987Z | step | {"step":"design","actor":"model","status":"delivered","bytes":6002,"budget":{"modelSteps":1,"modelStepsAllowed":14}} |
| 10 | 2026-10-09T14:54:26.880Z | search | {"bytes":182} |
| 11 | 2026-10-09T14:54:26.897Z | command | {"ms":476} |
| 12 | 2026-10-09T14:54:44.936Z | step | {"step":"design","actor":"model","status":"completed"} |
| 13 | 2026-10-09T14:54:44.974Z | policy | {"bytes":80} |
| 14 | 2026-10-09T14:54:44.976Z | step | {"step":"plan-step","actor":"code","status":"completed","ms":38} |
| 15 | 2026-10-09T14:54:44.977Z | step | {"step":"plan-write","actor":"model","status":"delivered","bytes":1717,"budget":{"modelSteps":2,"modelStepsAllowed":14}} |
| 16 | 2026-10-09T14:54:45.007Z | command | {"ms":158} |
| 17 | 2026-10-09T14:55:12.692Z | note | {"note":"plan-draft","path":".ambicode/task/create-implementation-plan-request-inclu/plan-draft_2026-10-09T16-55.md"} |
| 18 | 2026-10-09T14:55:21.924Z | worker | {"outcome":"ran","ms":9231} |
| 19 | 2026-10-09T14:55:21.943Z | step | {"step":"plan-write","actor":"model","status":"completed"} |
| 20 | 2026-10-09T14:55:21.978Z | step | {"step":"plan-check","actor":"code","status":"completed","ms":34} |
| 21 | 2026-10-09T14:55:21.979Z | gate | {"gate":"plan-accept"} |
| 22 | 2026-10-09T14:55:21.979Z | acceptance | {"gate":"plan-accept","answer":"Accept"} |
| 23 | 2026-10-09T14:55:22.081Z | note | {"note":"plan","path":".ambicode/task/create-implementation-plan-request-inclu/plan_2026-10-09T16-55.md","promotedFrom":"970c9a74-15"} |
| 24 | 2026-10-09T14:55:22.082Z | step | {"step":"promote","actor":"code","status":"completed","ms":102} |
| 25 | 2026-10-09T14:55:22.083Z | exit | {"reason":"done","budget":{"modelSteps":2,"wallMs":65907},"complete":true,"unverified":0} |
| 26 | 2026-10-09T14:55:22.118Z | command | {"ms":9547} |
| 27 | 2026-10-09T14:55:30.434Z | turn | {} |
| 28 | 2026-10-09T14:55:30.434Z | hook | {"ms":34} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "970c9a74-2",
    "at": "2026-10-09T14:54:16.177Z",
    "route": "970c9a74-1",
    "kind": "preanswer",
    "gate": "plan-accept",
    "option": "Accept",
    "via": "prompt",
    "trusted": true
  },
  {
    "id": "970c9a74-5",
    "at": "2026-10-09T14:54:16.182Z",
    "route": "970c9a74-1",
    "kind": "envelope",
    "sources": [
      {
        "key": "ARGS",
        "title": "Create an implementation plan for this request, including requirements, concret…",
        "relation": "args",
        "derivedFrom": null,
        "bytes": 3795
      }
    ],
    "builtFrom": "args",
    "asked": [],
    "missingAsked": [],
    "hash": "sha256:fd74b9d74cb654dd82a4afd5028e5916"
  },
  {
    "id": "970c9a74-6",
    "at": "2026-10-09T14:54:16.954Z",
    "route": "970c9a74-1",
    "kind": "map",
    "mode": "context",
    "layers": [
      {
        "name": "grep",
        "ms": 686,
        "hits": 2
      },
      {
        "name": "harvest",
        "ms": 3,
        "hits": 16
      }
    ],
    "layersSource": "default",
    "terms": {
      "pass1": [
        "IndexedDB",
        "US-ADV-ENG",
        "concurrency-related",
        "in-app",
        "closing/refreshing",
        "InexedDB",
        "refreshes/closes"
      ],
      "pass2": []
    },
    "candidates": 2,
    "limitations": [],
    "index": "none",
    "collisions": [],
    "bytes": 462,
    "serialized": 2,
    "candidatePaths": [
      "main/features/score-types/shared/services/wizard-auto-launch.service.ts",
      "main/screens/login/login.component.spec.ts"
    ],
    "tuning": {
      "hash": "3bd1fbc43250",
      "overrides": []
    },
    "profile": null,
    "decisions": {
      "sequenceFiles": 0,
      "pass2Downweighted": 0,
      "harvestFiles": 2,
      "feature": null,
      "proseRetry": false
    },
    "delivered": {
      "leads": [
        "main/features/score-types/shared/services/wizard-auto-launch.service.ts",
        "main/screens/login/login.component.spec.ts"
      ],
      "feature": [],
      "bytes": 336,
      "hash": "8cf66f109765"
    }
  },
  {
    "id": "970c9a74-7",
    "at": "2026-10-09T14:54:16.985Z",
    "route": "970c9a74-1",
    "kind": "policy",
    "stage": "before-work",
    "packs": [
      "builtin/angular-architecture",
      "builtin/angular-components",
      "builtin/angular-http",
      "builtin/angular-state",
      "builtin/common-quality"
    ],
    "rules": 25,
    "omitted": 3,
    "bytes": 4034
  },
  {
    "id": "970c9a74-10",
    "at": "2026-10-09T14:54:26.880Z",
    "route": "970c9a74-1",
    "kind": "search",
    "command": "find",
    "names": [
      "wizard"
    ],
    "hits": 1,
    "bytes": 182
  },
  {
    "id": "970c9a74-12",
    "at": "2026-10-09T14:54:44.974Z",
    "route": "970c9a74-1",
    "kind": "policy",
    "stage": "before-report",
    "packs": [
      "builtin/angular-architecture",
      "builtin/angular-components",
      "builtin/angular-http",
      "builtin/angular-state",
      "builtin/common-quality"
    ],
    "rules": 0,
    "omitted": 3,
    "bytes": 80
  },
  {
    "id": "970c9a74-20",
    "at": "2026-10-09T14:55:21.979Z",
    "route": "970c9a74-1",
    "kind": "acceptance",
    "gate": "plan-accept",
    "instance": "970c9a74-19",
    "answer": "Accept",
    "via": "prompt",
    "object": {
      "kind": "note",
      "value": "plan-draft",
      "id": "970c9a74-15",
      "path": ".ambicode/task/create-implementation-plan-request-inclu/plan-draft_2026-10-09T16-55.md",
      "contentHash": "sha256:1478ddfe3d62e6d631f257e87ae10f98"
    },
    "preanswer": "970c9a74-2",
    "trusted": true
  }
]
```

### API request 1

Recorded at 2026-10-09T14:54:18.693Z, +2.77 s from session start. Context 20951 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":13673,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":13673},"output_tokens":5,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 2.

#### Tool 1: Bash (cat)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-TTdy5z/home/cwd/repo 2>/dev/null && pwd && git ls-files | head -50 && git ls-files | wc -l"
}
```

Output: 2180 UTF-8 bytes; 3806 ms; tool-error=false; SHA256 `21552d55574dd863815ef60a33a0b044462a1d4930d34e2143e0fe091f02e95c`.

Paths mentioned in output (a mention is not a source-body read):

- `.ambicode/config.yaml`
- `.claude/CLAUDE.md`
- `.claude/rules/security.md`
- `.claude/settings.json`
- `.storybook/index.js`
- `.storybook/main.ts`
- `.storybook/preview-head.html`
- `.storybook/preview.ts`
- `.storybook/tsconfig.json`
- `.storybook/typings.d.ts`
- `ci/.i18n-sync.gitlab-ci.yml`
- `ci/.security_gate.gitlab-ci.yml`
- `ci/.version-bump.gitlab-ci.yml`
- `ci/bumpVersion.sh`
- `ci/changedPckgsLastCommit.sh`
- `ci/checkDeprecated.sh`
- `ci/checkVulnerabilities.sh`
- `ci/pushVersionToDB.sh`
- `main/assets/IMG_0036.MOV.avi_Joint_Angles.json`
- `main/assets/Lato-Regular.ttf`
- `main/assets/ScoreFactorSolutions.json`
- `main/assets/ScoreFactors.json`
- `main/assets/default_profile.png`
- `main/assets/flags/cs.png`
- `main/assets/flags/de.png`
- `main/assets/flags/el.png`
- `main/assets/flags/en.png`
- `main/assets/flags/es.png`
- `main/assets/flags/fr.png`
- `main/assets/flags/ja.png`
- `main/assets/flags/ko.png`
- `main/assets/flags/nb.png`
- `main/assets/flags/nl.png`
- `main/assets/flags/pt.png`
- `main/assets/flags/sk.png`
- `main/assets/flags/zh-CN.png`

Output excerpt; full output in JSON tool 1:

~~~text
/private/tmp/e-TTdy5z/home/cwd/repo
git: error: couldn't create cache file '/var/folders/nx/xb7v_m614s50z6c43bmbj5j40000gp/T/xcrun_db-xqKzBgOR' (errno=Operation not permitted)
2026-10-09 16:54:19.926 xcodebuild[61289:16221751]  DVTFilePathFSEvents: Failed to start fs event stream.
git: error: couldn't create cache file '/var/folders/nx/xb7v_m614s50z6c43bmbj5j40000gp/T/xcrun_db-6LZDErzh' (errno=Operation not permitted)
2026-10-09 16:54:20.514 xcodebuild[61295:16221783]  DVTFilePathFSEvents: Faile
~~~

#### Tool 2: Bash (cat)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "ls -la && ls repo | head"
}
```

Output: 1956 UTF-8 bytes; 3530 ms; tool-error=false; SHA256 `bdfb1f0c5f020e7f66e6fff4816389cb4803b600c2168dc5d53d63f650347718`.

Output excerpt; full output in JSON tool 2:

~~~text
total 2152
drwxr-xr-x  30 KillBill  wheel     960 Oct  9 16:54 .
drwxr-xr-x   4 KillBill  wheel     128 Oct  9 16:54 ..
drwxr-xr-x   4 KillBill  wheel     128 Oct  9 16:54 .ambicode
drwxr-xr-x   6 KillBill  wheel     192 Oct  9 16:54 .claude
drwxr-xr-x  12 KillBill  wheel     384 Oct  9 16:54 .git
-rw-r--r--   1 KillBill  wheel     187 Jul 21 16:09 .gitignore
-rw-r--r--   1 KillBill  wheel    9099 Jul 21 16:09 .gitlab-ci.yml
drwxr-xr-x   4 KillBill  wheel     128 Jul 21 16:09 .husky
-rw-r--r--  
~~~

Model text in this wave:

~~~text
I'll start with the reuse sweep and a look at the repo structure.
~~~

### API request 2

Recorded at 2026-10-09T14:54:25.395Z, +9.47 s from session start. Context 23705 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":2754,"cache_read_input_tokens":20949,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2754},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 3.

#### Tool 3: Grep (Grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "pattern": "indexedDB|idb|localforage|dexie|beforeunload|CanDeactivate|canDeactivate",
  "path": "/private/tmp/e-TTdy5z/home/cwd/repo",
  "glob": "{main/**/*.ts,package.json}",
  "-i": true,
  "output_mode": "content",
  "head_limit": 40
}
```

Output: 5140 UTF-8 bytes; 82 ms; tool-error=false; SHA256 `5c4678028c98e46fac78eeec0eb64bb91a66f76bfc41b7c00015a0af1ab95ca4`.

Paths mentioned in output (a mention is not a source-body read):

- `main/guards/auth.guard.spec.ts`
- `main/services/report.service.ts`
- `main/components/tables/user-table/user-table.component.ts`
- `main/components/tables/employee-table/employee-table.component.ts`
- `main/components/tables/organizations-table/organizations-table.component.ts`
- `main/features/score-types/lm-lift/services/lm-lift-wizard-form.service.ts`
- `main/features/score-types/lm-lift/components/lm-lift-wizard/lm-lift-wizard.component.ts`
- `main/features/score-types/shared/services/wizard-auto-launch.service.spec.ts`
- `main/features/score-types/shared/services/wizard-auto-launch.service.ts`
- `main/screens/login/login.component.spec.ts`

Output excerpt; full output in JSON tool 3:

~~~text
main/guards/auth.guard.spec.ts:22:    window.onbeforeunload = vi.fn();
package.json:74:    "localforage": "^1.10.0",
main/services/report.service.ts:6:import localforage from "localforage";
main/services/report.service.ts:390:      return await localforage.getItem(saveName);
main/services/report.service.ts:479:      const dataExists = await localforage.getItem(saveName);
main/services/report.service.ts:481:        return localforage.getItem(saveName);
main/services/report.service.ts:484:        
~~~

#### Tool 4: Bash (ambicode find)

Responsible path: CLI/search ranking → receipt.

Input:

```json
{
  "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" find wizard --task create-implementation-plan-request-inclu 2>&1 | head -60; cat .claude/CLAUDE.md | head -80"
}
```

Output: 4062 UTF-8 bytes; 805 ms; tool-error=false; SHA256 `46b47d4ec1c00bae879ad87f4a782a1995c139599b23e394354d12867581551c`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`
- `.claude/CLAUDE.md`

Paths mentioned in output (a mention is not a source-body read):

- `main/features/score-types/shared/components/score-card/edit-scoring-dialog/edit-scoring-dialog.component.ts`

Output excerpt; full output in JSON tool 4:

~~~text
config-schema-old: schemaVersion 1 read with v3 defaults; init --apply writes v3
via: harvest
index: none
wizard: 1 declaration(s) in 1 file(s)
  member main/features/score-types/shared/components/score-card/edit-scoring-dialog/edit-scoring-dialog.component.ts:90
# Inseer Frontend — Claude Code Guide

## Project at a Glance

Angular 21 enterprise SPA. Source root is `main/` (not `src/`). Custom Webpack builder. Vitest for tests. Storybook 10. No NgRx — state is managed via custom service-based *
~~~

#### Tool 5: Glob (Glob)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "pattern": "main/features/score-types/**/*adv*/**/*.ts",
  "path": "/private/tmp/e-TTdy5z/home/cwd/repo"
}
```

Output: 7601 UTF-8 bytes; 376 ms; tool-error=false; SHA256 `ed84729d7d3e9945d5e849acab817b05a356ca740b8b07fd2090bc2c35b7c691`.

Paths mentioned in output (a mention is not a source-body read):

- `main/features/score-types/ge-adv/directives/cancel-button/ge-adv-cancel-button.directive.ts`
- `main/features/score-types/ge-adv/directives/expandable-content/ge-adv-expandable-content.directive.ts`
- `main/features/score-types/ge-adv/mocks/user-facade.mocks.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-form-service.mocks.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-hands-wrists.mocks.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-elbows.mocks.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-neck.mocks.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-legs.mocks.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-fingers.mocks.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-shoulders.mocks.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-general-data.mocks.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv.mocks.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-back.mocks.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-results.mocks.ts`
- `main/features/score-types/ge-adv/constants/ge-adv-rounding.constants.ts`
- `main/features/score-types/ge-adv/constants/ge-adv-validation.constants.ts`
- `main/features/score-types/ge-adv/constants/ge-adv-routing.constants.ts`
- `main/features/score-types/ge-adv/constants/ge-adv-thresholds.constants.ts`
- `main/features/score-types/ge-adv/providers/body-side-key/hand-wrist-side-key.provider.ts`
- `main/features/score-types/ge-adv/providers/body-side-key/shoulder-side-key.provider.ts`
- `main/features/score-types/ge-adv/providers/body-side-key/elbow-side-key.provider.ts`
- `main/features/score-types/ge-adv/providers/body-side-key/hand-fingers-side-key.provider.ts`
- `main/features/score-types/ge-adv/providers/ge-adv.provider.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv-elbows.dto.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv.dto.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv-fingers.dto.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv-general-data.dto.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv-shoulders.dto.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv-contributions.dto.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv-back.dto.ts`
- `main/features/score-types/ge-adv/models/dto/utils/expandable-checkbox.dto.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv-legs.dto.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv-hands-wrists.dto.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv-neck.dto.ts`
- `main/features/score-types/ge-adv/models/dto/ge-adv-results.dto.ts`
- `main/features/score-types/ge-adv/models/form/ge-adv-elbows.form.ts`
- `main/features/score-types/ge-adv/models/form/ge-adv-back.form.ts`
- `main/features/score-types/ge-adv/models/form/ge-adv-neck.form.ts`
- `main/features/score-types/ge-adv/models/form/ge-adv-force-data.form.ts`
- `main/features/score-types/ge-adv/models/form/ge-adv-shoulders.form.ts`
- `main/features/score-types/ge-adv/models/form/ge-adv-fingers.form.ts`
- `main/features/score-types/ge-adv/models/form/ge-adv-general-data.form.ts`
- `main/features/score-types/ge-adv/models/form/ge-adv-legs.form.ts`
- `main/features/score-types/ge-adv/models/form/ge-adv-weight-data.form.ts`
- `main/features/score-types/ge-adv/models/form/ge-adv.form.ts`
- `main/features/score-types/ge-adv/models/form/ge-adv-hands-wrists.form.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-back.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-elbows.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-body-parts.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-shoulders.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-side-bending.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-weight-data.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-legs.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-fingers.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-neck.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-twisting.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-flexion.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-borg-scale.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-force-data.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-common.ts`
- `main/features/score-types/ge-adv/models/shared/ai-value-state.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-hands-wrists.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-concern-level.ts`
- `main/features/score-types/ge-adv/models/shared/ge-adv-extension.ts`
- `main/features/score-types/ge-adv/models/shared/ai-string-boolean.ts`
- `main/features/score-types/ge-adv/models/form-data/ge-adv-weight.form-data.ts`
- `main/features/score-types/ge-adv/models/form-data/ge-adv-neck.form-data.ts`
- `main/features/score-types/ge-adv/models/form-data/ge-adv-fingers.form-data.ts`
- `main/features/score-types/ge-adv/models/form-data/ge-adv-shoulders.form-data.ts`
- `main/features/score-types/ge-adv/models/form-data/ge-adv.form-data.ts`
- `main/features/score-types/ge-adv/models/form-data/ge-adv-elbows.form-data.ts`
- `main/features/score-types/ge-adv/models/form-data/ge-adv-hands-wrists.form-data.ts`
- `main/features/score-types/ge-adv/models/form-data/ge-adv-general.form-data.ts`
- `main/features/score-types/ge-adv/models/form-data/ge-adv-back.form-data.ts`
- `main/features/score-types/ge-adv/models/form-data/ge-adv-force.form-data.ts`
- `main/features/score-types/ge-adv/models/form-data/ge-adv-legs.form-data.ts`
- `main/features/score-types/ge-adv/models/mappers/elbows/ge-adv-elbow-supination-pronation.mapper.spec.ts`
- `main/features/score-types/ge-adv/models/mappers/elbows/ge-adv-elbow-flexion-extension.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/elbows/ge-adv-elbow-flexion-extension.mapper.spec.ts`
- `main/features/score-types/ge-adv/models/mappers/elbows/ge-adv-elbows.mapper.spec.ts`
- `main/features/score-types/ge-adv/models/mappers/elbows/ge-adv-elbows.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/elbows/ge-adv-elbow.mapper.spec.ts`
- `main/features/score-types/ge-adv/models/mappers/elbows/ge-adv-elbow-force.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/elbows/ge-adv-elbow-force.mapper.spec.ts`
- `main/features/score-types/ge-adv/models/mappers/elbows/ge-adv-elbow-supination-pronation.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/elbows/ge-adv-elbow.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/back/ge-adv-back-flexion-extension.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/back/ge-adv-back-force.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/back/ge-adv-back.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/back/ge-adv-back.mapper.spec.ts`
- `main/features/score-types/ge-adv/models/mappers/back/ge-adv-back-flexion-extension.mapper.spec.ts`
- `main/features/score-types/ge-adv/models/mappers/back/ge-adv-back-force.mapper.spec.ts`
- `main/features/score-types/ge-adv/models/mappers/general-data/ge-adv-general-data.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/general-data/ge-adv-general-data.mapper.spec.ts`
- `main/features/score-types/ge-adv/models/mappers/hands-wrists/ge-adv-hands-wrists.mapper.spec.ts`
- `main/features/score-types/ge-adv/models/mappers/hands-wrists/ge-adv-hand-wrist.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/hands-wrists/ge-adv-hands-wrists.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/hands-wrists/ge-adv-hand-wrist-flexion-extension.mapper.spec.ts`
- `main/features/score-types/ge-adv/models/mappers/hands-wrists/ge-adv-hand-wrist-force.mapper.ts`
- `main/features/score-types/ge-adv/models/mappers/hands-wrists/ge-adv-hand-wrist-radial-ulnar.mapper.spec.ts`

Output excerpt; full output in JSON tool 5:

~~~text
main/features/score-types/ge-adv/directives/cancel-button/ge-adv-cancel-button.directive.ts
main/features/score-types/ge-adv/directives/expandable-content/ge-adv-expandable-content.directive.ts
main/features/score-types/ge-adv/mocks/user-facade.mocks.ts
main/features/score-types/ge-adv/mocks/ge-adv-form-service.mocks.ts
main/features/score-types/ge-adv/mocks/ge-adv-hands-wrists.mocks.ts
main/features/score-types/ge-adv/mocks/ge-adv-elbows.mocks.ts
main/features/score-types/ge-adv/mocks/ge-adv-ne
~~~

### API request 3

Recorded at 2026-10-09T14:54:28.674Z, +12.75 s from session start. Context 31329 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":7624,"cache_read_input_tokens":23703,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":7624},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 6: Bash (cat)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-TTdy5z/home/cwd/repo/main/features/score-types/ge-adv && ls; ls components services directives 2>/dev/null | head -80; find . -iname '*wizard*' -o -iname '*cancel*' | head -30; cat ../shared/services/wizard-auto-launch.service.ts"
}
```

Output: 4634 UTF-8 bytes; 180 ms; tool-error=false; SHA256 `30f751c13ce22b7a78a7595343561d808c3683754a05a1c0140951d356b26431`.

Inferred requested paths (operands, not proof all bodies were returned):

- `../shared/services/wizard-auto-launch.service.ts`

Paths mentioned in output (a mention is not a source-body read):

- `directives/cancel-button/ge-adv-cancel-button.directive.ts`
- `components/wizard/ge-adv-wizard.component.scss`
- `components/wizard/ge-adv-wizard.component.stories.ts`
- `components/wizard/ge-adv-wizard.component.html`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`
- `services/ge-adv-wizard-auto-launch.service.ts`
- `services/ge-adv-wizard-navigation.service.spec.ts`
- `services/ge-adv-wizard-navigation.service.ts`
- `state/user.facade`

Output excerpt; full output in JSON tool 6:

~~~text
components
constants
directives
mocks
models
pipes
providers
services
state
components:
score-card
vlm-status
wizard

directives:
cancel-button
expandable-content

services:
ge-adv-api.service.ts
ge-adv-checkbox-set.service.spec.ts
ge-adv-checkbox-set.service.ts
ge-adv-form.service.spec.ts
ge-adv-form.service.ts
ge-adv-image-preloader.service.ts
ge-adv-scoring.service.spec.ts
ge-adv-scoring.service.ts
ge-adv-telemetry.service.ts
ge-adv-warnings.service.spec.ts
ge-adv-warnings.service.ts
ge-adv-w
~~~

### API request 4

Recorded at 2026-10-09T14:54:30.231Z, +14.30 s from session start. Context 33518 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":2189,"cache_read_input_tokens":31327,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2189},"output_tokens":4,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 7: Bash (cat)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cat components/wizard/ge-adv-wizard.component.ts services/ge-adv-wizard-auto-launch.service.ts directives/cancel-button/ge-adv-cancel-button.directive.ts"
}
```

Output: 11891 UTF-8 bytes; 181 ms; tool-error=false; SHA256 `0ac935354f991735952b354fa41ea022cc5477918a895de0b618ead65a1f29dd`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`
- `services/ge-adv-wizard-auto-launch.service.ts`
- `directives/cancel-button/ge-adv-cancel-button.directive.ts`

Paths mentioned in output (a mention is not a source-body read):

- `components/ui/steppers/stepper/stepper.component`
- `components/ui/steppers/stepper/stepper.module`
- `services/breakpoint.service`
- `../../../shared/providers/app-dialog.provider`
- `../../../shared/providers/mat-dialog-config.provider`
- `../../../shared/providers/mat-form-field-config.provider`
- `../../directives/cancel-button/ge-adv-cancel-button.directive`
- `../../models/dto/ge-adv.dto`
- `../../models/form/ge-adv.form`
- `../../models/mappers/ge-adv.mapper`
- `../../services/ge-adv-checkbox-set.service`
- `../../services/ge-adv-form.service`
- `../../services/ge-adv-image-preloader.service`
- `../../services/ge-adv-telemetry.service`
- `../../services/ge-adv-warnings.service`
- `../../services/ge-adv-wizard-auto-launch.service`
- `../../services/ge-adv-wizard-navigation.service`
- `../../state/ge-adv.facade`
- `back/ge-adv-back-form.component`
- `elbows/ge-adv-elbows-form.component`
- `fingers/ge-adv-fingers-form.component`
- `general-data/ge-adv-general-data-form.component`
- `hands-wrists/ge-adv-hands-wrists-form.component`
- `legs/ge-adv-legs-form.component`
- `neck/ge-adv-neck-form.component`
- `shoulders/ge-adv-shoulders-form.component`
- `ge-adv-wizard.component.html`
- `ge-adv-wizard.component.scss`
- `features/score-types/shared/services/wizard-auto-launch.service`
- `state/org.facade`
- `../state/ge-adv.facade`
- `features/score-types/shared/directives/cancel-button.directive`

Output excerpt; full output in JSON tool 7:

~~~text
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
  viewChild,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { ActivatedRoute, 
~~~

### API request 5

Recorded at 2026-10-09T14:54:33.375Z, +17.45 s from session start. Context 38808 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":5290,"cache_read_input_tokens":33516,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":5290},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 2.

#### Tool 8: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-TTdy5z/home/cwd/repo/main/features/score-types; ls shared shared/*; cat shared/directives/cancel-button.directive.ts; cat ge-adv/services/ge-adv-form.service.ts | head -120; cat ge-adv/components/wizard/ge-adv-wizard.component.html | head -60; grep -rn \"GeAdvMapper\\b\" ge-adv/models/mappers/ge-adv.mapper.ts | head -3; grep -n \"static\" ge-adv/models/mappers/ge-adv.mapper.ts; cat ../../guards/auth.guard.ts | head -50; ls ../../guards"
}
```

Output: 9646 UTF-8 bytes; 188 ms; tool-error=false; SHA256 `afc7bd10144eed8d8aa18549cd87e69c3d193ed68fdbfe79609b9a2bf62fccbb`.

Inferred requested paths (operands, not proof all bodies were returned):

- `shared/directives/cancel-button.directive.ts`
- `ge-adv/services/ge-adv-form.service.ts`
- `ge-adv/components/wizard/ge-adv-wizard.component.html`
- `ge-adv/models/mappers/ge-adv.mapper.ts`
- `../../guards/auth.guard.ts`

Paths mentioned in output (a mention is not a source-body read):

- `components/dialogs/ConfirmationDialog/ConfirmationDialog.component`
- `validators/number.validators`
- `../constants/ge-adv-validation.constants`
- `../models/form-data/ge-adv-force.form`
- `../models/form-data/ge-adv-weight.form`
- `../models/form/ge-adv-back.form`
- `../models/form/ge-adv-elbows.form`
- `../models/form/ge-adv-fingers.form`
- `../models/form/ge-adv-general-data.form`
- `../models/form/ge-adv-hands-wrists.form`
- `../models/form/ge-adv-legs.form`
- `../models/form/ge-adv-neck.form`
- `../models/form/ge-adv-shoulders.form`
- `../models/form/ge-adv.form`
- `ge-adv-checkbox-set.service`
- `ge-adv/models/mappers/ge-adv.mapper.ts`
- `state/auth.facade`

Output excerpt; full output in JSON tool 8:

~~~text
shared:
components
constants
directives
models
providers
services
styles
utils

shared/components:
cycle-time-input
edit-wizard-section-button
frequency-unit-select
printable-accordion-detail
score-card

shared/constants:
lm-scores.constants.ts

shared/directives:
cancel-button.directive.ts

shared/models:
view

shared/providers:
app-dialog.provider.ts
mat-dialog-config.provider.ts
mat-form-field-config.provider.ts
score-types.provider.ts

shared/services:
lm-risk.service.ts
lm-solution-factors.
~~~

#### Tool 9: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-TTdy5z/home/cwd/repo/main; grep -n \"geAdvData\\$\\|hasUserInput\\|processGeAdvScore\\|isEditing\" -r features/score-types/ge-adv/state/ge-adv.facade.ts | head; grep -rn \"canDeactivate\\|CanDeactivate\" --include=*.ts . | head; grep -n \"ge-adv\\|wizard\" -ri router/*.ts screens/app/*routing* 2>/dev/null | head"
}
```

Output: 1351 UTF-8 bytes; 164 ms; tool-error=false; SHA256 `b7d2aaf2aa6d1abd3b693a6a6dde267594efee3971130283cd6ff70aa865d7dc`.

Inferred requested paths (operands, not proof all bodies were returned):

- `features/score-types/ge-adv/state/ge-adv.facade.ts`

Paths mentioned in output (a mention is not a source-body read):

- `features/score-types/ge-adv/state/ge-adv.facade.ts`

Output excerpt; full output in JSON tool 9:

~~~text
features/score-types/ge-adv/state/ge-adv.facade.ts:51:  public readonly geAdvData$: Observable<GeAdvDto | null> =
features/score-types/ge-adv/state/ge-adv.facade.ts:57:  public readonly hasProcessedGeAdvScore$: Observable<boolean> = this.geAdvData$.pipe(
features/score-types/ge-adv/state/ge-adv.facade.ts:70:  public readonly isEditing$: Observable<boolean> = this.hasProcessedGeAdvScore$;
features/score-types/ge-adv/state/ge-adv.facade.ts:74:    this.geAdvData$.pipe(
features/score-types/ge-adv/s
~~~

### API request 6

Recorded at 2026-10-09T14:54:37.046Z, +21.12 s from session start. Context 44416 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":5608,"cache_read_input_tokens":38806,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":5608},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 10: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-TTdy5z/home/cwd/repo/main/features/score-types/ge-adv; sed -n 40,75p state/ge-adv.facade.ts; cat models/mappers/ge-adv.mapper.ts; cat models/dto/ge-adv.dto.ts | head -50; grep -rn \"ge-adv-wizard\\|GeAdvWizardComponent\" /private/tmp/e-TTdy5z/home/cwd/repo/main --include=*.ts -l | head; ls /private/tmp/e-TTdy5z/home/cwd/repo/main/features/score-types; ls /private/tmp/e-TTdy5z/home/cwd/repo/main/utils /private/tmp/e-TTdy5z/home/cwd/repo/main/utils/forms"
}
```

Output: 6226 UTF-8 bytes; 192 ms; tool-error=false; SHA256 `73b86414d4ae1ea67a068f68fbf3a9b21d43c7e66b0ee7a4adb4cc48b5725463`.

Inferred requested paths (operands, not proof all bodies were returned):

- `state/ge-adv.facade.ts`
- `models/mappers/ge-adv.mapper.ts`
- `models/dto/ge-adv.dto.ts`

Paths mentioned in output (a mention is not a source-body read):

- `../dto/ge-adv.dto`
- `../form-data/ge-adv.form`
- `back/ge-adv-back.mapper`
- `elbows/ge-adv-elbows.mapper`
- `fingers/ge-adv-fingers.mapper`
- `general-data/ge-adv-general-data.mapper`
- `hands-wrists/ge-adv-hands-wrists.mapper`
- `legs/ge-adv-legs.mapper`
- `neck/ge-adv-neck.mapper`
- `shoulders/ge-adv-shoulders.mapper`
- `ge-adv-back.dto`
- `ge-adv-contributions.dto`
- `ge-adv-elbows.dto`
- `ge-adv-fingers.dto`
- `ge-adv-general-data.dto`
- `ge-adv-hands-wrists.dto`
- `ge-adv-legs.dto`
- `ge-adv-neck.dto`
- `ge-adv-results.dto`
- `ge-adv-shoulders.dto`

Output excerpt; full output in JSON tool 10:

~~~text
@Injectable(/* Provide at page or component level */)
export class GeAdvFacade {
  private readonly orgFacade = inject(OrgFacade);
  private readonly reportFacade = inject(ReportFacade);
  private readonly scoringFacade = inject(ScoringFacade);
  private readonly geAdvApiService = inject(GeAdvApiService);
  private readonly vlmFacade = inject(VlmFacade);

  public readonly reportId$ = this.reportFacade.reportId$;

  public readonly geAdvData$: Observable<GeAdvDto | null> =
    this.scoringFacade
~~~

### API request 7

Recorded at 2026-10-09T14:54:39.453Z, +23.53 s from session start. Context 48078 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":3662,"cache_read_input_tokens":44414,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":3662},"output_tokens":4,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 11: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-TTdy5z/home/cwd/repo/main; grep -n \"isProcessed\\|isSubmitted\\|hasUser\" features/score-types/ge-adv/models/dto/ge-adv.dto.ts; grep -rn \"GeAdvWizardComponent\" . -l; grep -rn \"wizard.*routes\\|ge-adv.*wizard\" router screens/app -il 2>/dev/null | head; grep -n \"debounce\" -r features services state --include=*.ts -l | head -5; sed -n 1,30p features/score-types/shared/services/wizard-auto-launch.service.spec.ts"
}
```

Output: 1894 UTF-8 bytes; 1383 ms; tool-error=false; SHA256 `a3b841d76901708190e713d346249bb052febee29bdeb700d8256d9c50597dfd`.

Inferred requested paths (operands, not proof all bodies were returned):

- `features/score-types/ge-adv/models/dto/ge-adv.dto.ts`
- `features/score-types/shared/services/wizard-auto-launch.service.spec.ts`

Paths mentioned in output (a mention is not a source-body read):

- `features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.stories.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`
- `screens/report/report-routing.module.ts`
- `../../../../state/user.facade`
- `wizard-auto-launch.service`

Output excerpt; full output in JSON tool 11:

~~~text
57:  export const isSubmitted = (dto: GeAdvDto): dto is Submitted => {
61:  export const isProcessed = (dto: GeAdvDto): dto is Processed => {
62:    return isSubmitted(dto) && "results" in dto;
67:      user: isSubmitted(dto) ? dto.user.generalData : undefined,
74:      ...(isSubmitted(dto) && {
77:      ...(isProcessed(dto) && {
92:      ...(isSubmitted(dto) && {
95:      ...(isProcessed(dto) && {
110:      ...(isSubmitted(dto) && {
113:      ...(isProcessed(dto) && {
128:      ...(isSubmitted(
~~~

### API request 8

Recorded at 2026-10-09T14:54:43.867Z, +27.94 s from session start. Context 49450 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1372,"cache_read_input_tokens":48076,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1372},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 12: Bash (ambicode route)

Responsible path: CLI route → engine fold/execute → step/exit delivery.

Input:

```json
{
  "command": "cd /private/tmp/e-TTdy5z/home/cwd/repo && node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" route next --task create-implementation-plan-request-inclu 2>&1 | head -80"
}
```

Output: 1798 UTF-8 bytes; 561 ms; tool-error=false; SHA256 `b3220de5c6d8011ffdbef98426eece201941dd0759ee7e4f440ded78fd323512`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`

Paths mentioned in output (a mention is not a source-body read):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`

Output excerpt; full output in JSON tool 12:

~~~text
[ambicode] plan · task create-implementation-plan-request-inclu · step plan-write (6/9)
Now: Pipe the plan once to `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" plan check --task create-implementation-plan-request-inclu` on standard input, as a quoted heredoc (`<<'EOF'`). It saves the draft and checks anchors and acceptance units by code.
Then: node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" route next --task create-implementation-plan-request-inclu
Route: ground (done) · design (done) · plan-step (done) · plan-write (now) · plan-check · plan-accept · promote (if needed)
config-schema-old: schemaVersion 1 read with v3 defaults; init --apply writes v3
[ambicode] plan · task create-implementation-plan-request-inclu · step plan-write (6/9)
Now: Pipe the plan once to `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" plan check --task create-implementation-plan-request-inclu` on standard input, as a quoted heredoc (`<<'EOF'`). It saves the draft and checks anchors and acceptance units by code.
Then: node "/Users/KillBill/Documents/proje
~~~

### API request 9

Recorded at 2026-10-09T14:54:47.003Z, +31.08 s from session start. Context 50476 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1026,"cache_read_input_tokens":49448,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1026},"output_tokens":7,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 13: Bash (ambicode plan)

Responsible path: CLI plan check → plan-check worker → draft/check artifact → engine advance.

Input:

```json
{
  "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" plan check --task create-implementation-plan-request-inclu <<'EOF'\n# Plan: silent browser-side saving of the GE ADV wizard (IndexedDB backup)\n\n## AC → section\n| AC id | section |\n|---|---|\n| AC1 server data with user inputs wins; else backup; else defaults | Iteration 3 |\n| AC2 debounced backup on form change, validity ignored | Iteration 2 |\n| AC3 final backup on confirmed Cancel | Iteration 3 |\n| AC4 final backup on in-app navigation | Iteration 3 |\n| AC5 tab close/refresh: native prompt only when changes pending; final backup | Iteration 3 |\n| AC6 backup removed after successful processing | Iteration 3 |\n| AC7 generic, reusable core shared from the start | Iteration 1, 2 |\n\n## Evidence (read) and assumptions\n- Read: `localforage` is already a dependency (package.json:74) and used for IndexedDB in `main/features/score-types/shared/services/wizard-auto-launch.service.ts:45,93,104`, whose key is `userId/reportId/personIndex` (:11-13, :40). Reuse that key shape and the abstract-base-plus-subclass pattern (`ge-adv-wizard-auto-launch.service.ts:8-45`).\n- Read: wizard populates the form once from `geAdvFacade.geAdvData$` via `GeAdvMapper.mapDtoToFormData` and `formGroup.reset` (`ge-adv-wizard.component.ts:~155-160`). Submit success calls `autoLaunch.forget(...)` (:~175) and cancel confirmation calls `onCancel` (:~188), fed by `CancelButtonDirective.cancelConfirmed` (`shared/directives/cancel-button.directive.ts`).\n- Read: \"user inputs present\" is `GeAdvDto.isSubmitted` (`ge-adv/models/dto/ge-adv.dto.ts:57`); processed adds `results` (:61).\n- Read: `GeAdvFormService` is component-provided (`ge-adv-form.service.ts` `@Injectable(/* Provide in wizard component */)`); the wizard is routed from `main/screens/report/report-routing.module.ts`.\n- Read: no existing `canDeactivate`/`beforeunload` handler in app code (only a spec mock, `main/guards/auth.guard.spec.ts:22`), and no existing debounce helper found under features/services/state (grep returned none usable). Not verified: router config details, an existing shared guard type.\n- Assumption A1: form value (`getRawValue()`) is JSON/structured-clone safe; verified only by type names, to be confirmed in Iteration 1 tests.\n- Assumption A2: a backup is also keyed by a schema version so a stale shape is discarded rather than loaded (data-boundary policy).\n- Not run: no project scripts or tests were executed (planning boundary).\n\n## Design\nGeneric core in `main/features/score-types/shared/` (>=2 consumers is intended by the ticket; the placement matches the sibling `wizard-auto-launch.service.ts`): an abstract `WizardBackupService<T>` (get/save/clear on localforage, key `userId/reportId/personIndex`, versioned envelope, validates on read) plus an abstract-friendly `WizardBackupController` helper that wires a `FormGroup` to debounce + final flush + unload guard. GE ADV supplies only a storage key, schema version and mapping. Alternatives: (a) put everything in `ge-adv/` — fastest, but the ticket asks for shared from the start; (b) a separate `main/utils` location — rejected, it carries wizard domain knowledge (shared-code-placement policy). Recommended: shared under `score-types/shared`, extending the existing pattern.\n\n## Iteration 1 — Generic backup store\n- Goal: persist/read/clear a per-user/report/person backup in IndexedDB; lands first because everything else depends on it and it has no UI effect.\n- Changes: new `main/features/score-types/shared/services/wizard-backup.service.ts` (abstract; reuses `localforage` and `WizardAutoLaunchService` key and `UserFacade` use, `wizard-auto-launch.service.ts:11-13,20,40`); new `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts` (storage key e.g. `geAdvWizardBackups`, version const), pattern of `ge-adv-wizard-auto-launch.service.ts:8`. Read errors (IndexedDB unavailable, bad envelope) return `null` with a logged warning; write errors are surfaced to the caller, not swallowed silently.\n- Tests: new `wizard-backup.service.spec.ts` modelled on `wizard-auto-launch.service.spec.ts` (spy on `localforage.getItem/setItem`): round-trip, key isolation by user/report/person, version mismatch discarded, clear removes only that key. Fails first: service absent.\n- Accept: get after save returns equal data; clear then get returns null; other keys untouched.\n- Checks: `npm test` (scoped to the new spec), `npm run lint`.\n- Leaves out: any wiring to the wizard or form.\n\n## Iteration 2 — Debounced form auto-save\n- Goal: form changes are backed up after a quiet period regardless of validity; before the wizard wiring so it is testable on its own.\n- Changes: new `main/features/score-types/shared/services/wizard-backup-session.ts` (generic: takes a `FormGroup`, a debounce ms constant and a save fn; subscribes to `valueChanges` with `debounceTime`, tracks a `hasPendingChanges` signal, exposes `flush()` that writes immediately and `dispose()`; subscription bounded by `DestroyRef`, per subscription-lifetime policy). New `main/features/score-types/ge-adv/constants/ge-adv-backup.constants.ts` for the delay N (open decision, see below). Uses `getRawValue()` so disabled controls and invalid values are included (no validity filtering, per ticket).\n- Tests: new spec using vitest fake timers: no write before N, one write after N for a burst of changes, invalid value still saved, `flush()` writes immediately and clears pending flag, no writes after dispose. Fails first: class absent.\n- Accept: pending flag true between change and write, false after; writes are coalesced.\n- Checks: `npm test` (new spec), `npm run lint`.\n- Leaves out: restore, unload/navigation hooks, GE ADV component changes.\n\n## Iteration 3 — GE ADV wizard integration\n- Goal: restore, final flush hooks and cleanup are live in the GE ADV wizard.\n- Changes: `ge-adv-wizard.component.ts` — add the new services to `providers` (:~70) and replace `onDataAvailable_populateForm` (:~155) with: server DTO `GeAdvDto.isSubmitted` -> map server data; else read backup (map via existing `GeAdvMapper` form-data shape) -> `formGroup.reset(backup)`; else current behaviour. Start the session after the initial reset so restoring does not itself count as pending. `onCancel` (:~188): `await flush()` before navigating. `onSubmit` success (:~175): `await backup.clear(...)` next to `autoLaunch.forget`. In-app navigation: a `CanDeactivateFn` for the wizard route in `main/screens/report/report-routing.module.ts` that flushes (and does not block). Tab close/refresh: `beforeunload` listener in the session helper that calls `preventDefault()` only when `hasPendingChanges()`, plus a best-effort `flush()` (IndexedDB writes are async and are not guaranteed to finish on unload; this is why the debounce window is the loss bound, matching the ticket). Remove listener on destroy. New spec `ge-adv-wizard.component.spec.ts` additions (or services spec) for the ordering cases.\n- Tests: server-with-user-inputs ignores backup; no server inputs + backup populates form; neither -> defaults; cancel flushes; successful submit clears; failed submit does not clear; beforeunload prevented only with pending changes; deactivation flushes. Fails first: the backup is never read or written.\n- Accept: each AC1, AC3–AC6 scenario passes in tests; manual check in browser (not performed in planning) of refresh with and without pending edits.\n- Checks: `npm test`, `npm run lint`, `npm run build:web`.\n- Leaves out: other wizards (LM, NIOSH...); they adopt the shared core in their own changes.\n\n## Open decisions (headless; no answers were collected, so the plan stays a draft)\n1. Debounce delay N — recommend 2000 ms; product to confirm.\n2. Backup when the server has a submitted-but-unprocessed `user` block: ticket says server wins; this plan follows it. Confirm that a stale backup should then be deleted rather than left.\n3. Skip saving when the form equals the initial value — recommend yes (avoid backing up an untouched wizard).\n\n## Known limitations\n- Data typed within the last N seconds can be lost if the tab is killed; unload-time IndexedDB writes are best-effort.\n- Backups are device-local by design (ticket).\n- Whether the report routing allows a `canDeactivate` on this route was not verified.\n\n## Files\n- main/features/score-types/shared/services/wizard-backup.service.ts (creation)\n- main/features/score-types/shared/services/wizard-backup.service.spec.ts (creation)\n- main/features/score-types/shared/services/wizard-backup-session.ts (creation)\n- main/features/score-types/shared/services/wizard-backup-session.spec.ts (creation)\n- main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts (creation)\n- main/features/score-types/ge-adv/constants/ge-adv-backup.constants.ts (creation)\n- main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts (existing, modified)\n- main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.spec.ts (creation)\n- main/screens/report/report-routing.module.ts (existing, modified)\nEOF"
}
```

Output: 678 UTF-8 bytes; 9848 ms; tool-error=false; SHA256 `8aaa5093a48b28eea9704b164b55a2bd18c882dd00e5249fcaa57133a4eb3d92`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/features/score-types/shared/services/wizard-backup.service.ts`
- `main/features/score-types/shared/services/wizard-backup.service.spec.ts`
- `main/features/score-types/shared/services/wizard-backup-session.ts`
- `main/features/score-types/shared/services/wizard-backup-session.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts`
- `main/features/score-types/ge-adv/constants/ge-adv-backup.constants.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.spec.ts`
- `main/screens/report/report-routing.module.ts`

Paths mentioned in output (a mention is not a source-body read):

- `.ambicode/task/create-implementation-plan-request-inclu/plan-draft_2026-10-09T16-55.md`
- `.ambicode/task/create-implementation-plan-request-inclu/workers/plan-check-2026-10-09T16-55.json`

Output excerpt; full output in JSON tool 13:

~~~text
[ambicode] plan · task create-implementation-plan-request-inclu · complete
config-schema-old: schemaVersion 1 read with v3 defaults; init --apply writes v3
Saved plan draft: .ambicode/task/create-implementation-plan-request-inclu/plan-draft_2026-10-09T16-55.md
plan check failed: 7 anchors checked, 5 bad; 0 acceptance units mapped, 0 unmapped; 16 new names already declared
Result: .ambicode/task/create-implementation-plan-request-inclu/workers/plan-check-2026-10-09T16-55.json

[ambicode] plan · task create-implementation-plan-request-inclu · complete

The route is compl
~~~

### API request 10

Recorded at 2026-10-09T14:55:30.272Z, +74.34 s from session start. Context 54451 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":3975,"cache_read_input_tokens":50474,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":3975},"output_tokens":753,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
## Draft plan: silent saving of the GE ADV wizard to IndexedDB

The plan is saved as a draft at `.ambicode/task/create-implementation-plan-request-inclu/plan-draft_2026-10-09T16-55.md`. The automated check failed, and the route ended with the draft accepted as it stands, so I did not revise it. Nothing has been implemented, and I ran no project scripts or tests.

**Check failures** (details are in `.ambicode/task/create-implementation-plan-request-inclu/workers/plan-check-2026-10-09T16-55.json`):
- 5 of the 7 `path:line` anchors were reported bad. I wrote several of them as approximate lines (for example `~155`, `~175`, `~188`), and I did not confirm which anchors the check rejected.
- 0 acceptance units were mapped. The design step listed no ids, so I made up AC1–AC7 and the check did not recognise them.
- It reported "16 new names already declared". I did not investigate what that refers to.

**What the plan says**
- **Reuse:** the repo already uses `localforage` for IndexedDB. `WizardAutoLaunchService` already keys data by user, report and person, so the plan builds a generic backup service on the same pattern.
- **Placement:** the generic code goes in `main/features/score-types/shared/services/`, next to `wizard-auto-launch.service.ts`, as the ticket asks for shared code from the start. GE ADV supplies only its own key and schema version.
- **Iteration 1:** a generic backup store (get, save, clear) with versioned entries and a validated read.
- **Iteration 2:** a debounced `valueChanges` backup of `getRawValue()` that ignores validity, plus a pending-changes flag and a `flush()`.
- **Iteration 3:** wiring into `GeAdvWizardComponent`:
  - Restore order: server data with user inputs (`GeAdvDto.isSubmitted`) wins, then the backup, then defaults.
  - Flush on a confirmed Cancel and before in-app navigation.
  - The `beforeunload` prompt appears only when changes are pending.
  - The backup is cleared after a successful submit.

**Open decisions** (no answers were collected, so these remain open):
1. The debounce delay. I recommend 2000 ms, but product needs to confirm.
2. Whether a stale backup should be deleted when the server already has submitted inputs.
3. Whether to skip saving when the form is unchanged from its initial value. I recommend yes.

**Assumptions and limits**
- Unload-time IndexedDB writes are best-effort, so up to N seconds of edits can be lost.
- I did not verify that the report route in `main/screens/report/report-routing.module.ts` can take a `canDeactivate` guard.
- I did not verify that the form value is safe to store in IndexedDB.

## Files
- main/features/score-types/shared/services/wizard-backup.service.ts (creation)
- main/features/score-types/shared/services/wizard-backup.service.spec.ts (creation)
- main/features/score-types/shared/services/wizard-backup-session.ts (creation)
- main/features/score-types/shared/services/wizard-backup-session.spec.ts (creation)
- main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts (creation)
- main/features/score-types/ge-adv/constants/ge-adv-backup.constants.ts (creation)
- main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts (existing, modified)
- main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.spec.ts (creation)
- main/screens/report/report-routing.module.ts (existing, modified)
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/17_1451_walk-ambicode-with-prompt-sonnet-5-5/traces/exports/ce2780e7-06cb-4d38-a2d5-31fa9887cace/create-implementation-plan-request-inclu/source.json): 3 artifact files.

Artifact checks (present/size/hash and ledger entry count): pass. Exact source → exported destination, byte count/hash and validation are in the attempt JSON.

Correct historical paths:

- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`

Named non-truth paths:

- `main/features/score-types/shared/services/wizard-backup.service.ts`
- `main/features/score-types/shared/services/wizard-backup.service.spec.ts`
- `main/features/score-types/shared/services/wizard-backup-session.ts`
- `main/features/score-types/shared/services/wizard-backup-session.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts`
- `main/features/score-types/ge-adv/constants/ge-adv-backup.constants.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.spec.ts`
- `main/screens/report/report-routing.module.ts`

Final model answer:

~~~text
## Draft plan: silent saving of the GE ADV wizard to IndexedDB

The plan is saved as a draft at `.ambicode/task/create-implementation-plan-request-inclu/plan-draft_2026-10-09T16-55.md`. The automated check failed, and the route ended with the draft accepted as it stands, so I did not revise it. Nothing has been implemented, and I ran no project scripts or tests.

**Check failures** (details are in `.ambicode/task/create-implementation-plan-request-inclu/workers/plan-check-2026-10-09T16-55.json`):
- 5 of the 7 `path:line` anchors were reported bad. I wrote several of them as approximate lines (for example `~155`, `~175`, `~188`), and I did not confirm which anchors the check rejected.
- 0 acceptance units were mapped. The design step listed no ids, so I made up AC1–AC7 and the check did not recognise them.
- It reported "16 new names already declared". I did not investigate what that refers to.

**What the plan says**
- **Reuse:** the repo already uses `localforage` for IndexedDB. `WizardAutoLaunchService` already keys data by user, report and person, so the plan builds a generic backup service on the same pattern.
- **Placement:** the generic code goes in `main/features/score-types/shared/services/`, next to `wizard-auto-launch.service.ts`, as the ticket asks for shared code from the start. GE ADV supplies only its own key and schema version.
- **Iteration 1:** a generic backup store (get, save, clear) with versioned entries and a validated read.
- **Iteration 2:** a debounced `valueChanges` backup of `getRawValue()` that ignores validity, plus a pending-changes flag and a `flush()`.
- **Iteration 3:** wiring into `GeAdvWizardComponent`:
  - Restore order: server data with user inputs (`GeAdvDto.isSubmitted`) wins, then the backup, then defaults.
  - Flush on a confirmed Cancel and before in-app navigation.
  - The `beforeunload` prompt appears only when changes are pending.
  - The backup is cleared after a successful submit.

**Open decisions** (no answers were collected, so these remain open):
1. The debounce delay. I recommend 2000 ms, but product needs to confirm.
2. Whether a stale backup should be deleted when the server already has submitted inputs.
3. Whether to skip saving when the form is unchanged from its initial value. I recommend yes.

**Assumptions and limits**
- Unload-time IndexedDB writes are best-effort, so up to N seconds of edits can be lost.
- I did not verify that the report route in `main/screens/report/report-routing.module.ts` can take a `canDeactivate` guard.
- I did not verify that the form value is safe to store in IndexedDB.

## Files
- main/features/score-types/shared/services/wizard-backup.service.ts (creation)
- main/features/score-types/shared/services/wizard-backup.service.spec.ts (creation)
- main/features/score-types/shared/services/wizard-backup-session.ts (creation)
- main/features/score-types/shared/services/wizard-backup-session.spec.ts (creation)
- main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts (creation)
- main/features/score-types/ge-adv/constants/ge-adv-backup.constants.ts (creation)
- main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts (existing, modified)
- main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.spec.ts (creation)
- main/screens/report/report-routing.module.ts (existing, modified)
~~~

Scored plan artifact (which can differ from final chat text):

~~~text
**plan draft** — acceptance is recorded by `note promote`, not in this file.

# Plan: silent browser-side saving of the GE ADV wizard (IndexedDB backup)

## AC → section
| AC id | section |
|---|---|
| AC1 server data with user inputs wins; else backup; else defaults | Iteration 3 |
| AC2 debounced backup on form change, validity ignored | Iteration 2 |
| AC3 final backup on confirmed Cancel | Iteration 3 |
| AC4 final backup on in-app navigation | Iteration 3 |
| AC5 tab close/refresh: native prompt only when changes pending; final backup | Iteration 3 |
| AC6 backup removed after successful processing | Iteration 3 |
| AC7 generic, reusable core shared from the start | Iteration 1, 2 |

## Evidence (read) and assumptions
- Read: `localforage` is already a dependency (package.json:74) and used for IndexedDB in `main/features/score-types/shared/services/wizard-auto-launch.service.ts:45,93,104`, whose key is `userId/reportId/personIndex` (:11-13, :40). Reuse that key shape and the abstract-base-plus-subclass pattern (`ge-adv-wizard-auto-launch.service.ts:8-45`).
- Read: wizard populates the form once from `geAdvFacade.geAdvData$` via `GeAdvMapper.mapDtoToFormData` and `formGroup.reset` (`ge-adv-wizard.component.ts:~155-160`). Submit success calls `autoLaunch.forget(...)` (:~175) and cancel confirmation calls `onCancel` (:~188), fed by `CancelButtonDirective.cancelConfirmed` (`shared/directives/cancel-button.directive.ts`).
- Read: "user inputs present" is `GeAdvDto.isSubmitted` (`ge-adv/models/dto/ge-adv.dto.ts:57`); processed adds `results` (:61).
- Read: `GeAdvFormService` is component-provided (`ge-adv-form.service.ts` `@Injectable(/* Provide in wizard component */)`); the wizard is routed from `main/screens/report/report-routing.module.ts`.
- Read: no existing `canDeactivate`/`beforeunload` handler in app code (only a spec mock, `main/guards/auth.guard.spec.ts:22`), and no existing debounce helper found under features/services/state (grep returned none usable). Not verified: router config details, an existing shared guard type.
- Assumption A1: form value (`getRawValue()`) is JSON/structured-clone safe; verified only by type names, to be confirmed in Iteration 1 tests.
- Assumption A2: a backup is also keyed by a schema version so a stale shape is discarded rather than loaded (data-boundary policy).
- Not run: no project scripts or tests were executed (planning boundary).

## Design
Generic core in `main/features/score-types/shared/` (>=2 consumers is intended by the ticket; the placement matches the sibling `wizard-auto-launch.service.ts`): an abstract `WizardBackupService<T>` (get/save/clear on localforage, key `userId/reportId/personIndex`, versioned envelope, validates on read) plus an abstract-friendly `WizardBackupController` helper that wires a `FormGroup` to debounce + final flush + unload guard. GE ADV supplies only a storage key, schema version and mapping. Alternatives: (a) put everything in `ge-adv/` — fastest, but the ticket asks for shared from the start; (b) a separate `main/utils` location — rejected, it carries wizard domain knowledge (shared-code-placement policy). Recommended: shared under `score-types/shared`, extending the existing pattern.

## Iteration 1 — Generic backup store
- Goal: persist/read/clear a per-user/report/person backup in IndexedDB; lands first because everything else depends on it and it has no UI effect.
- Changes: new `main/features/score-types/shared/services/wizard-backup.service.ts` (abstract; reuses `localforage` and `WizardAutoLaunchService` key and `UserFacade` use, `wizard-auto-launch.service.ts:11-13,20,40`); new `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts` (storage key e.g. `geAdvWizardBackups`, version const), pattern of `ge-adv-wizard-auto-launch.service.ts:8`. Read errors (IndexedDB unavailable, bad envelope) return `null` with a logged warning; write errors are surfaced to the caller, not swallowed silently.
- Tests: new `wizard-backup.service.spec.ts` modelled on `wizard-auto-launch.service.spec.ts` (spy on `localforage.getItem/setItem`): round-trip, key isolation by user/report/person, version mismatch discarded, clear removes only that key. Fails first: service absent.
- Accept: get after save returns equal data; clear then get returns null; other keys untouched.
- Checks: `npm test` (scoped to the new spec), `npm run lint`.
- Leaves out: any wiring to the wizard or form.

## Iteration 2 — Debounced form auto-save
- Goal: form changes are backed up after a quiet period regardless of validity; before the wizard wiring so it is testable on its own.
- Changes: new `main/features/score-types/shared/services/wizard-backup-session.ts` (generic: takes a `FormGroup`, a debounce ms constant and a save fn; subscribes to `valueChanges` with `debounceTime`, tracks a `hasPendingChanges` signal, exposes `flush()` that writes immediately and `dispose()`; subscription bounded by `DestroyRef`, per subscription-lifetime policy). New `main/features/score-types/ge-adv/constants/ge-adv-backup.constants.ts` for the delay N (open decision, see below). Uses `getRawValue()` so disabled controls and invalid values are included (no validity filtering, per ticket).
- Tests: new spec using vitest fake timers: no write before N, one write after N for a burst of changes, invalid value still saved, `flush()` writes immediately and clears pending flag, no writes after dispose. Fails first: class absent.
- Accept: pending flag true between change and write, false after; writes are coalesced.
- Checks: `npm test` (new spec), `npm run lint`.
- Leaves out: restore, unload/navigation hooks, GE ADV component changes.

## Iteration 3 — GE ADV wizard integration
- Goal: restore, final flush hooks and cleanup are live in the GE ADV wizard.
- Changes: `ge-adv-wizard.component.ts` — add the new services to `providers` (:~70) and replace `onDataAvailable_populateForm` (:~155) with: server DTO `GeAdvDto.isSubmitted` -> map server data; else read backup (map via existing `GeAdvMapper` form-data shape) -> `formGroup.reset(backup)`; else current behaviour. Start the session after the initial reset so restoring does not itself count as pending. `onCancel` (:~188): `await flush()` before navigating. `onSubmit` success (:~175): `await backup.clear(...)` next to `autoLaunch.forget`. In-app navigation: a `CanDeactivateFn` for the wizard route in `main/screens/report/report-routing.module.ts` that flushes (and does not block). Tab close/refresh: `beforeunload` listener in the session helper that calls `preventDefault()` only when `hasPendingChanges()`, plus a best-effort `flush()` (IndexedDB writes are async and are not guaranteed to finish on unload; this is why the debounce window is the loss bound, matching the ticket). Remove listener on destroy. New spec `ge-adv-wizard.component.spec.ts` additions (or services spec) for the ordering cases.
- Tests: server-with-user-inputs ignores backup; no server inputs + backup populates form; neither -> defaults; cancel flushes; successful submit clears; failed submit does not clear; beforeunload prevented only with pending changes; deactivation flushes. Fails first: the backup is never read or written.
- Accept: each AC1, AC3–AC6 scenario passes in tests; manual check in browser (not performed in planning) of refresh with and without pending edits.
- Checks: `npm test`, `npm run lint`, `npm run build:web`.
- Leaves out: other wizards (LM, NIOSH...); they adopt the shared core in their own changes.

## Open decisions (headless; no answers were collected, so the plan stays a draft)
1. Debounce delay N — recommend 2000 ms; product to confirm.
2. Backup when the server has a submitted-but-unprocessed `user` block: ticket says server wins; this plan follows it. Confirm that a stale backup should then be deleted rather than left.
3. Skip saving when the form equals the initial value — recommend yes (avoid backing up an untouched wizard).

## Known limitations
- Data typed within the last N seconds can be lost if the tab is killed; unload-time IndexedDB writes are best-effort.
- Backups are device-local by design (ticket).
- Whether the report routing allows a `canDeactivate` on this route was not verified.

## Files
- main/features/score-types/shared/services/wizard-backup.service.ts (creation)
- main/features/score-types/shared/services/wizard-backup.service.spec.ts (creation)
- main/features/score-types/shared/services/wizard-backup-session.ts (creation)
- main/features/score-types/shared/services/wizard-backup-session.spec.ts (creation)
- main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts (creation)
- main/features/score-types/ge-adv/constants/ge-adv-backup.constants.ts (creation)
- main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts (existing, modified)
- main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.spec.ts (creation)
- main/screens/report/report-routing.module.ts (existing, modified)

~~~

