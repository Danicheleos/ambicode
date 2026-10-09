# be-vs-5071-investigate: notation R2 (e-NtMlxq)

[Case comparison](../cases/notation/be-vs-5071-investigate.md) · [Complete data and tool outputs](e-NtMlxq.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/15_1241_curated-ambicode-with-prompt-sonnet-5-5/traces/e-NtMlxq.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.2475 + judge $0.0137 = total $0.2613. Harness turns 9, API requests 9, tool calls 8.

## Starting inputs

Prompt SHA256: `0ea4b9671c78ee45df96c08df290576ade1c76c96d6c565fe903714d9c93b19b`. Normalized delivered-step SHA256: `e88124217403e6d95da76b3b92344b68b488165babaffa7962a75600faf70491`. Contract SHA256: `edc68aaa9243b44ec0f5da41d77f8612643562db8efcd533ec8d73870b25b73e`.

The exact prompt lives in the immutable eval result linked from the main report; the complete initial route delivery and contract text are in this attempt JSON.

```text
[ambicode] investigate · task ENG-12 · step read (5/5)
Now: Read the code the question is about -> answer it.
Then: answer the user; your answer is saved as the investigation note when you stop
Route: ground✓ [read]

Mode: headless (set by the user).

- @map lists leads, not answers: open those that fit.
- one `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" read --task ENG-12 <path[:a-b]>…` call with every file and span.
- claim => cite `path:line` · assumption => mark it.
- premise not in the code => say so after a short search; answer from what exists.
- files question => answer the whole request as written: each existing file implementing it edits (its types, schema, DTO, mocks, routes and tests) + any file its requirements may need, naming that assumption. !files that only explain the code · !files only your own extras need · !similar features the request does not name.
Diagnostics (reproduce, print a value) => only `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" check --task ENG-12 <projectId>/<checkId> --only <spec> --phase red`, after ?the user · declined => !run; inconclusive.
!edit anything.

## map
tuning: 3bd1fbc43250
Leads from the terms adv, Organization, request, code, Enable, Disable, role, path, mark, snapshot, commands, explicit; then OrganizationController, addOrg, validateNewSubDomainName, updateWhiteLabelingSettings, getOrganizations, getOrganization:
1. src/controllers/OrganizationController.ts:37 — filename matched "Organization"
2. src/api/Organization.ts:22 — filename matched "Organization"
3. src/api/Auth.ts:5 — contains "Organization"
4. src/controllers/AuthController.ts:2 — contains "Organization"
5. src/controllers/ReportController.ts:2 — contains "adv"
6. src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts:14 — sits under a directory matching "adv"
7. src/api/middleware/permissions/permissions.middleware.ts:3 — contains "Organization"
8. src/api/validators/OrganizationValidators.ts:8 — filename matched "Organization"
```

## Engine events in recorded order

The engine ledger and model trace use different clocks/events. Entries below retain timestamps; model calls follow in their own recorded order. No invented interleaving or internal model reasoning is assigned.

| # | UTC | Event | Input / output / state |
|---|---|---|---|
| 1 | 2026-10-09T12:42:03.754Z | route | {} |
| 2 | 2026-10-09T12:42:03.755Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 3 | 2026-10-09T12:42:03.756Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 4 | 2026-10-09T12:42:03.761Z | envelope | {} |
| 5 | 2026-10-09T12:42:04.288Z | map | {"bytes":5837} |
| 6 | 2026-10-09T12:42:04.326Z | policy | {"bytes":86} |
| 7 | 2026-10-09T12:42:04.351Z | policy | {"bytes":88} |
| 8 | 2026-10-09T12:42:04.352Z | step | {"step":"ground","actor":"code","status":"completed","ms":596} |
| 9 | 2026-10-09T12:42:04.353Z | step | {"step":"scope","actor":"human","status":"skipped"} |
| 10 | 2026-10-09T12:42:04.354Z | step | {"step":"read","actor":"model","status":"delivered","bytes":2083,"budget":{"modelSteps":1,"modelStepsAllowed":6}} |
| 11 | 2026-10-09T12:42:07.561Z | search | {"bytes":262} |
| 12 | 2026-10-09T12:42:07.601Z | command | {"ms":307} |
| 13 | 2026-10-09T12:42:10.119Z | search | {"bytes":23950} |
| 14 | 2026-10-09T12:42:10.140Z | command | {"ms":171} |
| 15 | 2026-10-09T12:42:42.275Z | turn | {} |
| 16 | 2026-10-09T12:42:42.277Z | hook | {"ms":147} |
| 17 | 2026-10-09T12:42:42.308Z | note | {"note":"investigation","path":".ambicode/task/ENG-12/investigation_2026-10-09T14-42.md"} |
| 18 | 2026-10-09T12:42:42.338Z | exit | {"reason":"done","budget":{"modelSteps":1,"wallMs":38584},"complete":true,"unverified":0} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "5d8333d4-4",
    "at": "2026-10-09T12:42:03.761Z",
    "route": "5d8333d4-1",
    "kind": "envelope",
    "sources": [
      {
        "key": "ARGS",
        "title": "Investigate which files this request would need to touch. Read the relevant cod…",
        "relation": "args",
        "derivedFrom": null,
        "bytes": 797
      }
    ],
    "builtFrom": "args",
    "asked": [],
    "missingAsked": [],
    "hash": "sha256:fde311ae10f25e0c2d63de1c97a4b07d"
  },
  {
    "id": "5d8333d4-5",
    "at": "2026-10-09T12:42:04.288Z",
    "route": "5d8333d4-1",
    "kind": "map",
    "mode": "prompt",
    "layers": [
      {
        "name": "shortlist",
        "ms": 243,
        "hits": 20
      },
      {
        "name": "harvest",
        "ms": 6,
        "hits": 69
      },
      {
        "name": "shortlist",
        "ms": 149,
        "hits": 20
      }
    ],
    "layersSource": "default",
    "terms": {
      "pass1": [
        "adv",
        "Organization",
        "request",
        "code",
        "Enable",
        "Disable",
        "role",
        "path",
        "mark",
        "snapshot",
        "commands",
        "explicit"
      ],
      "pass2": [
        "adv",
        "Organization",
        "request",
        "code",
        "Enable",
        "Disable",
        "OrganizationController",
        "addOrg",
        "validateNewSubDomainName",
        "updateWhiteLabelingSettings",
        "getOrganizations",
        "getOrganization"
      ]
    },
    "candidates": 33,
    "limitations": [
      "Co-change contributed nothing: 1 commit(s) in this repository touch the files the terms matched.",
      "67 matching file(s) are not listed: they fall outside projects[].shortlist in .ambicode/config.yaml (tests, styles, markup and data by default).",
      "227 further candidate(s) scored but are not listed; raise --limit to see them.",
      "62 matching file(s) are not listed: they fall outside projects[].shortlist in .ambicode/config.yaml (tests, styles, markup and data by default).",
      "215 further candidate(s) scored but are not listed; raise --limit to see them."
    ],
    "index": "none",
    "collisions": [],
    "bytes": 5837,
    "serialized": 16,
    "candidatePaths": [
      "src/controllers/OrganizationController.ts",
      "src/api/Organization.ts",
      "src/api/Auth.ts",
      "src/controllers/AuthController.ts",
      "src/controllers/ReportController.ts",
      "src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts",
      "src/api/middleware/permissions/permissions.middleware.ts",
      "src/api/validators/OrganizationValidators.ts",
      "src/models/Auth.ts",
      "src/features/ai-custom-solutions/services/ai-custom-solutions-translation.service.ts",
      "src/api/middleware/verify-report-org.middleware.ts",
      "src/features/score-types/ge-adv/ge-adv.controller.ts",
      "src/features/vlm/services/vlm.service.ts",
      "src/utils/ai-translations-helper.ts",
      "src/api/middleware/permissions/restrictions.middleware.ts",
      "src/features/score-types/ge-adv/validators/ge-adv-back.validators.ts",
      "src/features/score-types/ge-adv/validators/ge-adv-elbows.validators.ts",
      "src/features/score-types/ge-adv/validators/ge-adv-fingers.validators.ts",
      "src/features/score-types/ge-adv/validators/ge-adv-force.validators.ts",
      "src/features/score-types/ge-adv/validators/ge-adv-general-data.validators.ts"
    ],
    "tuning": {
      "hash": "3bd1fbc43250",
      "overrides": []
    },
    "profile": null,
    "decisions": {
      "sequenceFiles": 0,
      "pass2Downweighted": 6,
      "harvestFiles": 8,
      "feature": null,
      "proseRetry": false
    },
    "delivered": {
      "leads": [
        "src/controllers/OrganizationController.ts",
        "src/api/Organization.ts",
        "src/api/Auth.ts",
        "src/controllers/AuthController.ts",
        "src/controllers/ReportController.ts",
        "src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts",
        "src/api/middleware/permissions/permissions.middleware.ts",
        "src/api/validators/OrganizationValidators.ts"
      ],
      "feature": [],
      "bytes": 881,
      "hash": "a2effd48264f"
    }
  },
  {
    "id": "5d8333d4-6",
    "at": "2026-10-09T12:42:04.326Z",
    "route": "5d8333d4-1",
    "kind": "policy",
    "stage": "before-work",
    "packs": [
      "builtin/common-quality"
    ],
    "rules": 0,
    "omitted": 15,
    "bytes": 86
  },
  {
    "id": "5d8333d4-7",
    "at": "2026-10-09T12:42:04.351Z",
    "route": "5d8333d4-1",
    "kind": "policy",
    "stage": "before-report",
    "packs": [
      "builtin/common-quality"
    ],
    "rules": 0,
    "omitted": 15,
    "bytes": 88
  },
  {
    "id": "5d8333d4-11",
    "at": "2026-10-09T12:42:07.561Z",
    "route": "5d8333d4-1",
    "kind": "search",
    "command": "read",
    "names": [],
    "hits": 0,
    "bytes": 262,
    "truncated": 0
  },
  {
    "id": "5d8333d4-12",
    "at": "2026-10-09T12:42:10.119Z",
    "route": "5d8333d4-1",
    "kind": "search",
    "command": "read",
    "names": [
      "src/controllers/OrganizationController.ts:1-189",
      "src/api/Organization.ts:1-200",
      "src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts:1-57",
      "src/api/validators/OrganizationValidators.ts:1-166"
    ],
    "hits": 4,
    "bytes": 23950,
    "truncated": 3
  }
]
```

### API request 1

Recorded at 2026-10-09T12:42:06.767Z, +3.31 s from session start. Context 18655 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":11377,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":11377},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 1: Bash (ambicode read)

Responsible path: CLI runRead → readMany → search ledger receipt.

Input:

```json
{
  "command": "cd /private/tmp/e-NtMlxq/home/cwd/repo 2>/dev/null && pwd; node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task ENG-12 repo/src/controllers/OrganizationController.ts repo/src/api/Organization.ts repo/src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts repo/src/api/validators/OrganizationValidators.ts",
  "description": "Read the lead files"
}
```

Output: 298 UTF-8 bytes; 849 ms; tool-error=false; SHA256 `919aef8f4899ec8c6b085922e94649461480ae1cf4ba18c76a6483bb0c40f49a`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`
- `src/controllers/OrganizationController.ts`
- `src/api/Organization.ts`
- `src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts`
- `src/api/validators/OrganizationValidators.ts`

Paths mentioned in output (a mention is not a source-body read):

- `src/controllers/OrganizationController.ts`
- `src/api/Organization.ts`
- `src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts`
- `src/api/validators/OrganizationValidators.ts`

Output excerpt; full output in JSON tool 1:

~~~text
== repo/src/controllers/OrganizationController.ts: not found ==
== repo/src/api/Organization.ts: not found ==
== repo/src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts: not found ==
== repo/src/api/validators/OrganizationValidators.ts: not found ==
/private/tmp/e-NtMlxq/home/cwd/repo
== repo/src/controllers/OrganizationController.ts: not found ==
== repo/src/api/Organization.ts: not found ==
== repo/src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts: not found ==
== repo/src/api/validators/OrganizationValidators.ts: not found ==
~~~

### API request 2

Recorded at 2026-10-09T12:42:08.613Z, +5.16 s from session start. Context 19134 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":479,"cache_read_input_tokens":18653,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":479},"output_tokens":37,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 2: Bash (ambicode read)

Responsible path: CLI runRead → readMany → search ledger receipt.

Input:

```json
{
  "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" read --task ENG-12 src/controllers/OrganizationController.ts src/api/Organization.ts src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts src/api/validators/OrganizationValidators.ts",
  "description": "Read the lead files from repo root"
}
```

Output: 23950 UTF-8 bytes; 626 ms; tool-error=false; SHA256 `a46b1b9986bf89419a57030a224a6a6f289eeb1ad68f1ebde5ea3f7d8021c5f8`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`
- `src/controllers/OrganizationController.ts`
- `src/api/Organization.ts`
- `src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts`
- `src/api/validators/OrganizationValidators.ts`

Reader header spans:

```json
[
  {
    "path": "src/controllers/OrganizationController.ts",
    "requestedFrom": 1,
    "requestedTo": 1074,
    "totalLines": 1074
  },
  {
    "path": "src/api/Organization.ts",
    "requestedFrom": 1,
    "requestedTo": 330,
    "totalLines": 330
  },
  {
    "path": "src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts",
    "requestedFrom": 1,
    "requestedTo": 57,
    "totalLines": 57
  },
  {
    "path": "src/api/validators/OrganizationValidators.ts",
    "requestedFrom": 1,
    "requestedTo": 312,
    "totalLines": 312
  }
]
```

Headers describe requested/clamped spans. A budget-cut footer overrides actual served end; consult full output for the continuation.

Paths mentioned in output (a mention is not a source-body read):

- `src/controllers/OrganizationController.ts`
- `../features/hard-delete/models/deletion-status.model.js`
- `../features/hard-delete/services/hard-delete.service.js`
- `../features/joint-detail/services/joint-detail-ml.service.js`
- `../libs/okta/index.js`
- `../loaders/logger.js`
- `../models/Organization.js`
- `../models/OrgUnit.js`
- `../models/Translations.js`
- `../services/amplitude.service.js`
- `../utils/aws-helper.js`
- `../utils/PermissionHelper.js`
- `../utils/RestrictionsHelper.js`
- `../utils/TranslationsHelper.js`
- `../utils/ValidationHelper.js`
- `ReportController.js`
- `src/api/Organization.ts`
- `../controllers/OrganizationController.js`
- `../features/request-log/request-log.middleware.js`
- `middleware/middleware.js`
- `middleware/permissions/permissions.middleware.js`
- `middleware/permissions/restrictions.middleware.js`
- `validators/OrganizationValidators.js`
- `src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts`
- `../dto/ge-adv.dto.js`
- `ge-adv-back.schema.js`
- `ge-adv-elbows.schema.js`
- `ge-adv-fingers.schema.js`
- `ge-adv-general-data.schema.js`
- `ge-adv-hands-wrists.schema.js`
- `ge-adv-legs.schema.js`
- `ge-adv-neck.schema.js`
- `ge-adv-results.schema.js`
- `ge-adv-shoulders.schema.js`
- `src/api/validators/OrganizationValidators.ts`
- `../../utils/ValidationHelper.js`
- `../middleware/middleware.js`
- `../../models/Organization.js`

Output excerpt; full output in JSON tool 2:

~~~text
== src/controllers/OrganizationController.ts (lines 1-1074 of 1074) ==
== src/api/Organization.ts (lines 1-330 of 330) ==
== src/features/score-types/ge-adv/models/schemas/ge-adv.schema.ts (lines 1-57 of 57) ==
== src/api/validators/OrganizationValidators.ts (lines 1-312 of 312) ==
== src/controllers/OrganizationController.ts (lines 1-1074 of 1074) ==
1	import express from "express";
2	
3	import { DeletionState } from "../features/hard-delete/models/deletion-status.model.js";
4	import { HardDeleteService } from "../features/hard-delete/services/hard-delete.service.js";
5	import { JointDetailMlService } from "../features/joint-detail/services/joint-detail-ml.service.js";
6	import {
7	  createOktaOrganization,
8	  deleteOktaConnectionById,
9	  deleteOktaOrganization,
10	  ge
~~~

Model text in this wave:

~~~text
Paths are probably relative to the repo; retry without the prefix.
~~~

### API request 3

Recorded at 2026-10-09T12:42:11.758Z, +8.30 s from session start. Context 29624 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":10490,"cache_read_input_tokens":19132,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":10490},"output_tokens":8,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 3: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "grep -rnE \"isVLMScoringEnabled|isHalCreationEnabled|enableEST\" src test tests --include=*.ts -l 2>/dev/null | head -40; echo ---; grep -rnE \"isVLMScoringEnabled|isHalCreationEnabled\" src/models/Organization.ts src/controllers/OrganizationController.ts; echo ---; grep -rniE \"geadv|ge-adv|ge_adv\" src --include=*.ts -l | grep -viE \"features/score-types/ge-adv/(models|dto)\" | head -40; echo ---; grep -nE \"ToolTypes|ADV\" src/models/Organization.ts",
  "description": "Locate org feature flags and GE ADV usages"
}
```

Output: 1465 UTF-8 bytes; 207 ms; tool-error=false; SHA256 `dd36a30c9070969ce256a359610ac78af724ef4a6da3f177511c48d0e70484d6`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/models/Organization.ts`
- `src/controllers/OrganizationController.ts`

Paths mentioned in output (a mention is not a source-body read):

- `src/models/Organization.ts`
- `src/controllers/OrganizationController.ts`

Output excerpt; full output in JSON tool 3:

~~~text
(eval):1: no matches found: --include=*.ts
---
src/models/Organization.ts:15:  isHalCreationEnabled: boolean;
src/models/Organization.ts:35:  isVLMScoringEnabled?: boolean;
src/models/Organization.ts:250:  isHalCreationEnabled: { type: Boolean, default: false },
src/models/Organization.ts:251:  isVLMScoringEnabled: { type: Boolean, default: false },
src/models/Organization.ts:603:  isVLMScoringEnabled?: boolean;
src/models/Organization.ts:608:  isHalCreationEnabled: boolean;
src/models/Organizat
~~~

### API request 4

Recorded at 2026-10-09T12:42:16.101Z, +12.64 s from session start. Context 30691 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1067,"cache_read_input_tokens":29622,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1067},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 4: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "grep -rnE \"isVLMScoringEnabled|isHalCreationEnabled\" . --include='*.ts' --include='*.json' --include='*.yaml' --include='*.yml' --exclude-dir=node_modules --exclude-dir=dist | grep -vE \"^./src/(models/Organization|controllers/OrganizationController)\" | head -40; echo ---; grep -rliE \"geadv|ge-adv|ge_adv\" . --include='*.ts' --exclude-dir=node_modules --exclude-dir=dist | grep -vE \"ge-adv/(models|dto)\" | head -40; echo ---; sed -n 565,640p src/models/Organization.ts; sed -n 240,275p src/controllers/OrganizationController.ts; sed -n 395,470p src/controllers/OrganizationController.ts",
  "description": "Search flags and GE ADV; read model and update code"
}
```

Output: 9554 UTF-8 bytes; 393 ms; tool-error=false; SHA256 `4d9de0f7801dd2d4fce594fe46fa53e8950fe5bca6b72108030b3c8a4f92670a`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/models/Organization.ts`
- `src/controllers/OrganizationController.ts`

Paths mentioned in output (a mention is not a source-body read):

- `src/api/validators/OrganizationValidators.ts`
- `src/controllers/ReportController.ts`
- `src/controllers/ReportController.spec.ts`
- `src/features/score-types/ge-adv/mocks/ge-adv.mocks.ts`
- `src/features/score-types/ge-adv/ge-adv.controller.spec.ts`
- `src/features/score-types/ge-adv/ge-adv.router.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-back.validators.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-posture.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-fingers.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-elbows.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-shared.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-hands-wrists.validators.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-neck.validators.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-shoulders.validators.ts`
- `src/features/score-types/ge-adv/validators/utils/checkbox-like.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-force.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-hands-wrists.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-legs.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-force.validators.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-elbows.validators.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-shoulders.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv.validators.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-general-data.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-shared.validators.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-neck.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-general-data.validators.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-back.validators.spec.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-posture.validators.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-legs.validators.ts`
- `src/features/score-types/ge-adv/validators/ge-adv-fingers.validators.ts`
- `src/features/score-types/ge-adv/ge-adv.controller.ts`
- `src/features/score-types/ge-adv/services/ge-adv-backup.service.spec.ts`
- `src/features/score-types/ge-adv/services/ge-adv-backup.service.ts`
- `src/features/score-types/ge-adv/services/ge-adv-ml.service.ts`
- `src/features/score-types/ge-adv/services/ge-adv-ml.service.spec.ts`
- `src/models/Scoring.ts`
- `src/models/Organization.ts`
- `src/api/Report.ts`

Output excerpt; full output in JSON tool 4:

~~~text
./src/api/validators/OrganizationValidators.ts:93:    body("isHalCreationEnabled").optional().isBoolean(),
./src/controllers/ReportController.ts:1444:        Organization.findById(organizationId, "isHalCreationEnabled").lean(),
./src/controllers/ReportController.ts:1448:      if (!org?.isHalCreationEnabled) {
./src/controllers/ReportController.spec.ts:508:            lean: () => Promise.resolve({ isHalCreationEnabled: true }),
---
./src/features/score-types/ge-adv/mocks/ge-adv.mocks.ts
./src/fea
~~~

### API request 5

Recorded at 2026-10-09T12:42:17.833Z, +14.38 s from session start. Context 35350 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":4659,"cache_read_input_tokens":30689,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":4659},"output_tokens":10,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 5: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "grep -niE \"geadv|ge-adv\" src/models/Organization.ts src/api/Report.ts src/controllers/ReportController.ts src/models/Scoring.ts src/features/score-types/ge-adv/ge-adv.router.ts; echo ---; sed -n 1,80p src/features/score-types/ge-adv/ge-adv.router.ts; echo ---; grep -n \"est\\b\\|enableEST\" src/models/Organization.ts src/controllers/ReportController.ts | head -30; ls src/api/middleware/permissions; grep -rn \"enableEST\" src --include='*.ts' -l",
  "description": "Inspect geAdv usage and EST analog"
}
```

Output: 4961 UTF-8 bytes; 240 ms; tool-error=false; SHA256 `34de3c69a660f1d434119fcc366a9e0b2bac66f25f572b905b6baa8714d6afd5`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/models/Organization.ts`
- `src/api/Report.ts`
- `src/controllers/ReportController.ts`
- `src/models/Scoring.ts`
- `src/features/score-types/ge-adv/ge-adv.router.ts`

Paths mentioned in output (a mention is not a source-body read):

- `src/models/Organization.ts`
- `src/api/Report.ts`
- `../features/score-types/ge-adv/ge-adv.router.js`
- `src/controllers/ReportController.ts`
- `src/models/Scoring.ts`
- `../features/score-types/ge-adv/models/dto/ge-adv.dto.js`
- `../features/score-types/ge-adv/models/schemas/ge-adv.schema.js`
- `src/features/score-types/ge-adv/ge-adv.router.ts`
- `ge-adv.controller.js`
- `validators/ge-adv.validators.js`
- `../../../api/middleware/middleware.js`
- `../../request-log/request-log.middleware.js`
- `../features/score-types/est/services/est-niosh.service.js`
- `../templates/reports/template-reports-manifest.js`
- `src/api/validators/OrganizationValidators.ts`
- `src/controllers/OrganizationController.spec.ts`
- `src/controllers/OrganizationController.ts`

Output excerpt; full output in JSON tool 5:

~~~text
src/models/Organization.ts:322:    geAdv: { type: Boolean, default: true },
src/models/Organization.ts:584:  geAdv: boolean;
src/api/Report.ts:10:import { GeAdvRouter } from "../features/score-types/ge-adv/ge-adv.router.js";
src/api/Report.ts:414:ReportRouter.use("/ge-adv", GeAdvRouter);
src/controllers/ReportController.ts:2433:          [`${scoringCollectionKey}.geAdvData.results`]: 1,
src/models/Scoring.ts:15:import { GeAdvDto } from "../features/score-types/ge-adv/models/dto/ge-adv.dto.js";
s
~~~

### API request 6

Recorded at 2026-10-09T12:42:20.850Z, +17.39 s from session start. Context 37853 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":2503,"cache_read_input_tokens":35348,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2503},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 6: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "sed -n 10,40p src/models/Organization.ts; sed -n 310,330p src/models/Organization.ts; grep -n \"RESTRICTION_NAMES\" -A12 src/models/Organization.ts | sed -n 1,40p; cat src/api/middleware/permissions/restrictions.middleware.ts | head -50; sed -n 1,60p src/features/score-types/ge-adv/ge-adv.controller.ts; grep -n \"enableEST\\|isVLM\" src/controllers/OrganizationController.spec.ts | head",
  "description": "Inspect model, restrictions middleware, GE ADV controller"
}
```

Output: 6243 UTF-8 bytes; 241 ms; tool-error=false; SHA256 `643c78bfbda2c6dfe3d9ccef3bff264ab958bb1f1d7aed90779baae41220a060`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/models/Organization.ts`
- `src/api/middleware/permissions/restrictions.middleware.ts`
- `src/features/score-types/ge-adv/ge-adv.controller.ts`
- `src/controllers/OrganizationController.spec.ts`

Paths mentioned in output (a mention is not a source-body read):

- `../../../loaders/logger.js`
- `../../../models/Organization.js`
- `../../../utils/RestrictionsHelper.js`
- `../../../models/Scoring.js`
- `models/dto/ge-adv.dto.js`
- `services/ge-adv-backup.service.js`
- `services/ge-adv-ml.service.js`

Output excerpt; full output in JSON tool 6:

~~~text
  translatedName?: string | null;
  isActive: boolean;
  awsSizeMB: number;
  externalClientApiKeyId: string;
  isExternal: boolean;
  isHalCreationEnabled: boolean;
  enableEST: boolean;
  birpSettings?: BirpOrganizationSettings;
  deletionProtected?: boolean;
  deletionStatus?: DeletionStatus;
  providerName: string;
  created: Date;
  spaceUsed: number;
  type: string;
  blurSetting: BlurType;
  removeAdminBlur: boolean;
  solutionsHidden: boolean;
  aiCustomSolutionsEnabled: boolean;
  inact
~~~

### API request 7

Recorded at 2026-10-09T12:42:23.417Z, +19.96 s from session start. Context 40925 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":3072,"cache_read_input_tokens":37851,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":3072},"output_tokens":4,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 7: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "grep -rn \"toolTypes\" src --include='*.ts' | grep -v \"spec.ts\" | head -20; sed -n 20,60p src/api/middleware/permissions/permissions.middleware.ts | head -5",
  "description": "Find toolTypes usage"
}
```

Output: 1850 UTF-8 bytes; 207 ms; tool-error=false; SHA256 `f51481fa49c70f89671a836885b1687b0d77afd986bc9913efedab4b3be3f631`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/api/middleware/permissions/permissions.middleware.ts`

Paths mentioned in output (a mention is not a source-body read):

- `src/models/Organization.ts`
- `src/api/Organization.ts`
- `src/api/validators/OrganizationValidators.ts`
- `src/controllers/OrganizationController.ts`
- `src/services/amplitude.service.ts`

Output excerpt; full output in JSON tool 7:

~~~text
src/models/Organization.ts:43:  toolTypes: ToolTypes;
src/models/Organization.ts:82:  "toolTypes" | "whiteLabelingSettings" | "birpSettings" | "aiCustomSolutionsEnabled"
src/models/Organization.ts:310:  toolTypes: {
src/api/Organization.ts:296:  "/toolTypes",
src/api/validators/OrganizationValidators.ts:232:    body("toolTypes").exists().isObject().withMessage("toolTypes object is missing"),
src/api/validators/OrganizationValidators.ts:233:    body("toolTypes.niosh")
src/api/validators/Organizat
~~~

### API request 8

Recorded at 2026-10-09T12:42:25.667Z, +22.21 s from session start. Context 42006 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1081,"cache_read_input_tokens":40923,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1081},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 8: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "sed -n 285,312p src/api/Organization.ts; sed -n 225,290p src/api/validators/OrganizationValidators.ts; sed -n 835,880p src/controllers/OrganizationController.ts; grep -n \"toolTypes\" src/controllers/OrganizationController.spec.ts src/api/*.spec.ts 2>/dev/null | head -5",
  "description": "Read toolTypes route, validators, controller"
}
```

Output: 4602 UTF-8 bytes; 218 ms; tool-error=false; SHA256 `1b4db6368f57c2e2bb8581a10381c2d67951e34341ea6c73951b8c677b523717`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/api/Organization.ts`
- `src/api/validators/OrganizationValidators.ts`
- `src/controllers/OrganizationController.ts`
- `src/controllers/OrganizationController.spec.ts`

Output excerpt; full output in JSON tool 8:

~~~text
            .join(", ")
      );
      return res.status(400).json({ errors: errors.array() });
    }
    const scoreTypeRequired = req.body["scoreTypeRequired"];
    const orgId = req.params.organizationId;
    OrganizationController.updateScoreTypeRequired(res, next, scoreTypeRequired, orgId);
  }
);

OrganizationRouter.post(
  "/toolTypes",
  validateRequest(...OrganizationValidators.updateToolTypesValidators),
  logRequest,
  OrganizationController.updateToolTypes
);

OrganizationRouter.post
~~~

### API request 9

Recorded at 2026-10-09T12:42:32.756Z, +29.30 s from session start. Context 44121 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":2115,"cache_read_input_tokens":42004,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2115},"output_tokens":8,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
US-ADV-ENG-12 needs a Dev-gated organization-level GE ADV flag in the backend. The files below are existing ones the change would edit, plus one optional new test file. I did not edit anything. The `OrganizationController.ts:190-1074` span, the `Organization.ts` route file from line 201, and the `OrganizationValidators.ts` span after line 167 were cut off by the read budget. I read the relevant parts of the controller and validators with `sed`, and I did not read the rest of the route file.

## What exists today

- **A `geAdv` tool-type flag already exists but is not switchable.**
  - It is `ToolTypes.geAdv` at `src/models/Organization.ts:584`.
  - It is defaulted to `true` in the schema at `src/models/Organization.ts:322`.
  - The only write path is `POST /:organizationId/toolTypes` (`src/api/Organization.ts:295-300`).
    - That route has no `checkDevPerm`, so it is not Dev-only.
    - The controller `updateToolTypes` (`src/controllers/OrganizationController.ts:841-864`) only checks `hasAdminAccess`.
    - It replaces the whole `toolTypes` object, so a partial body would wipe the other keys.
  - `updateToolTypesValidators` (`src/api/validators/OrganizationValidators.ts:230-268`) validates `niosh`, `libertyMutualPushPull`, `libertyMutualCarry`, `libertyMutualLift`, `rula`, `reba`, `inseerCompositeScore`, `handActivityTLV` and `est`. It has no `geAdv` rule.
- **Dev-only organization flags go through `PUT /:organizationId`.**
  - That route is `checkDevPerm` plus `updateOrganizationValidators` (`src/api/Organization.ts:50-56`).
  - `updateOrganization` builds `setFields` from the body, including `enableEST`, `isVLMScoringEnabled` and `isHalCreationEnabled` (`OrganizationController.ts:413-421`).
  - `addOrg` creates organizations with the same fields (`OrganizationController.ts:61-76`).
  - The validators for both are shared (`OrganizationValidators.ts:87-112`).
  - The list endpoint maps flags into `OrganizationStats` (`OrganizationController.ts:251-271`).
  - `OrganizationStats` and `ReportsByOrganizationSchema` are in `src/models/Organization.ts:~590-632`.
- **GE ADV endpoints do not check the organization.**
  - `GeAdvRouter` (`src/features/score-types/ge-adv/ge-adv.router.ts:11-23`) has only `validateRequest` and `logRequest`.
  - It is mounted at `src/api/Report.ts:414`.
  - `GeAdvController.processScore` (`ge-adv.controller.ts:11-`) never looks at the organization.
  - So even if the flag were switchable, nothing enforces it.
- **There is a gating precedent.** `ReportController.ts:1444-1448` loads the organization and returns early when `isHalCreationEnabled` is false. `checkRestriction` (`src/api/middleware/permissions/restrictions.middleware.ts`) is a middleware that loads the organization and bypasses for Dev users. It is keyed to `OrganizationRestrictions`, not to `toolTypes`.

## Assumptions

- **Where the flag lives (decision for you).** I assumed GE ADV is switched through the existing `toolTypes.geAdv` field rather than a new top-level boolean like `enableEST`. This is the smaller change. The alternative is a new `isGeAdvEnabled` field, which would add `Organization.ts` model edits in several places.
- **Dev-only.** I assumed it must be Dev-only, and that Admin should not be able to change it through the `toolTypes` route. That requires `checkDevPerm`, and I did not check whether the existing frontend relies on Admin calling that route.
- **Enforcement.** I assumed "only organizations entitled have access" means the GE ADV routes should reject a disabled organization.
- **Superseded files.** If the flag lives in `toolTypes`, `src/api/Organization.ts` and `OrganizationController.ts` still need edits for Dev gating and partial updates. If instead the flag goes on `PUT /`, the validator and controller edits move to the `PUT` path.

## Files and roles

**Existing, to edit**
- `src/models/Organization.ts`: the `geAdv` type and schema default already exist. It needs a change only if the new-flag option is chosen, in which case it needs `IOrganization`, schema, `OrganizationStats` and `ReportsByOrganizationSchema` edits. The default may also need review, since `true` means all existing organizations are entitled.
- `src/api/validators/OrganizationValidators.ts`: add `toolTypes.geAdv` optional-boolean validation. If the new-flag option is chosen, add the flag to `addOrganizationValidators`.
- `src/controllers/OrganizationController.ts`: make `updateToolTypes` merge keys (for example `toolTypes.geAdv`) instead of replacing the whole object. Surface the flag in `getOrganizations`, and in `addOrg` and `updateOrganization` if the new-flag option is chosen.
- `src/api/Organization.ts`: add a Dev-only route or a Dev check for the `geAdv` change.
- `src/features/score-types/ge-adv/ge-adv.router.ts`: add an enable-check middleware to `processScore` and `deleteScore`.
- `src/controllers/OrganizationController.spec.ts`: add tests for the toggle. It already covers `enableEST` and `isVLMScoringEnabled` fixtures (lines 130-195).
- `src/features/score-types/ge-adv/ge-adv.controller.spec.ts`: add or adjust tests for the disabled-organization case.

**Proposed new**
- `src/api/middleware/permissions/ge-adv-enabled.middleware.ts`: a middleware that loads the organization, returns 403 when `toolTypes.geAdv` is false, and bypasses for Dev users, following the `restrictions.middleware.ts` pattern. Enforcement could instead live inline in the controller, so this file is optional.

**Deletions:** none.

## Files
- src/models/Organization.ts
- src/api/validators/OrganizationValidators.ts
- src/controllers/OrganizationController.ts
- src/controllers/OrganizationController.spec.ts
- src/api/Organization.ts
- src/features/score-types/ge-adv/ge-adv.router.ts
- src/features/score-types/ge-adv/ge-adv.controller.spec.ts
- src/api/middleware/permissions/ge-adv-enabled.middleware.ts
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/15_1241_curated-ambicode-with-prompt-sonnet-5-5/traces/exports/69bd3673-55af-4ea5-a2a3-b1ae0260a481/ENG-12/source.json): 2 artifact files.

Artifact checks (present/size/hash and ledger entry count): pass. Exact source → exported destination, byte count/hash and validation are in the attempt JSON.

Correct historical paths:

- `src/models/Organization.ts`
- `src/api/validators/OrganizationValidators.ts`
- `src/controllers/OrganizationController.ts`
- `src/controllers/OrganizationController.spec.ts`

Named non-truth paths:

- `src/api/Organization.ts`
- `src/features/score-types/ge-adv/ge-adv.router.ts`
- `src/features/score-types/ge-adv/ge-adv.controller.spec.ts`
- `src/api/middleware/permissions/ge-adv-enabled.middleware.ts`

Final model answer:

~~~text
US-ADV-ENG-12 needs a Dev-gated organization-level GE ADV flag in the backend. The files below are existing ones the change would edit, plus one optional new test file. I did not edit anything. The `OrganizationController.ts:190-1074` span, the `Organization.ts` route file from line 201, and the `OrganizationValidators.ts` span after line 167 were cut off by the read budget. I read the relevant parts of the controller and validators with `sed`, and I did not read the rest of the route file.

## What exists today

- **A `geAdv` tool-type flag already exists but is not switchable.**
  - It is `ToolTypes.geAdv` at `src/models/Organization.ts:584`.
  - It is defaulted to `true` in the schema at `src/models/Organization.ts:322`.
  - The only write path is `POST /:organizationId/toolTypes` (`src/api/Organization.ts:295-300`).
    - That route has no `checkDevPerm`, so it is not Dev-only.
    - The controller `updateToolTypes` (`src/controllers/OrganizationController.ts:841-864`) only checks `hasAdminAccess`.
    - It replaces the whole `toolTypes` object, so a partial body would wipe the other keys.
  - `updateToolTypesValidators` (`src/api/validators/OrganizationValidators.ts:230-268`) validates `niosh`, `libertyMutualPushPull`, `libertyMutualCarry`, `libertyMutualLift`, `rula`, `reba`, `inseerCompositeScore`, `handActivityTLV` and `est`. It has no `geAdv` rule.
- **Dev-only organization flags go through `PUT /:organizationId`.**
  - That route is `checkDevPerm` plus `updateOrganizationValidators` (`src/api/Organization.ts:50-56`).
  - `updateOrganization` builds `setFields` from the body, including `enableEST`, `isVLMScoringEnabled` and `isHalCreationEnabled` (`OrganizationController.ts:413-421`).
  - `addOrg` creates organizations with the same fields (`OrganizationController.ts:61-76`).
  - The validators for both are shared (`OrganizationValidators.ts:87-112`).
  - The list endpoint maps flags into `OrganizationStats` (`OrganizationController.ts:251-271`).
  - `OrganizationStats` and `ReportsByOrganizationSchema` are in `src/models/Organization.ts:~590-632`.
- **GE ADV endpoints do not check the organization.**
  - `GeAdvRouter` (`src/features/score-types/ge-adv/ge-adv.router.ts:11-23`) has only `validateRequest` and `logRequest`.
  - It is mounted at `src/api/Report.ts:414`.
  - `GeAdvController.processScore` (`ge-adv.controller.ts:11-`) never looks at the organization.
  - So even if the flag were switchable, nothing enforces it.
- **There is a gating precedent.** `ReportController.ts:1444-1448` loads the organization and returns early when `isHalCreationEnabled` is false. `checkRestriction` (`src/api/middleware/permissions/restrictions.middleware.ts`) is a middleware that loads the organization and bypasses for Dev users. It is keyed to `OrganizationRestrictions`, not to `toolTypes`.

## Assumptions

- **Where the flag lives (decision for you).** I assumed GE ADV is switched through the existing `toolTypes.geAdv` field rather than a new top-level boolean like `enableEST`. This is the smaller change. The alternative is a new `isGeAdvEnabled` field, which would add `Organization.ts` model edits in several places.
- **Dev-only.** I assumed it must be Dev-only, and that Admin should not be able to change it through the `toolTypes` route. That requires `checkDevPerm`, and I did not check whether the existing frontend relies on Admin calling that route.
- **Enforcement.** I assumed "only organizations entitled have access" means the GE ADV routes should reject a disabled organization.
- **Superseded files.** If the flag lives in `toolTypes`, `src/api/Organization.ts` and `OrganizationController.ts` still need edits for Dev gating and partial updates. If instead the flag goes on `PUT /`, the validator and controller edits move to the `PUT` path.

## Files and roles

**Existing, to edit**
- `src/models/Organization.ts`: the `geAdv` type and schema default already exist. It needs a change only if the new-flag option is chosen, in which case it needs `IOrganization`, schema, `OrganizationStats` and `ReportsByOrganizationSchema` edits. The default may also need review, since `true` means all existing organizations are entitled.
- `src/api/validators/OrganizationValidators.ts`: add `toolTypes.geAdv` optional-boolean validation. If the new-flag option is chosen, add the flag to `addOrganizationValidators`.
- `src/controllers/OrganizationController.ts`: make `updateToolTypes` merge keys (for example `toolTypes.geAdv`) instead of replacing the whole object. Surface the flag in `getOrganizations`, and in `addOrg` and `updateOrganization` if the new-flag option is chosen.
- `src/api/Organization.ts`: add a Dev-only route or a Dev check for the `geAdv` change.
- `src/features/score-types/ge-adv/ge-adv.router.ts`: add an enable-check middleware to `processScore` and `deleteScore`.
- `src/controllers/OrganizationController.spec.ts`: add tests for the toggle. It already covers `enableEST` and `isVLMScoringEnabled` fixtures (lines 130-195).
- `src/features/score-types/ge-adv/ge-adv.controller.spec.ts`: add or adjust tests for the disabled-organization case.

**Proposed new**
- `src/api/middleware/permissions/ge-adv-enabled.middleware.ts`: a middleware that loads the organization, returns 403 when `toolTypes.geAdv` is false, and bypasses for Dev users, following the `restrictions.middleware.ts` pattern. Enforcement could instead live inline in the controller, so this file is optional.

**Deletions:** none.

## Files
- src/models/Organization.ts
- src/api/validators/OrganizationValidators.ts
- src/controllers/OrganizationController.ts
- src/controllers/OrganizationController.spec.ts
- src/api/Organization.ts
- src/features/score-types/ge-adv/ge-adv.router.ts
- src/features/score-types/ge-adv/ge-adv.controller.spec.ts
- src/api/middleware/permissions/ge-adv-enabled.middleware.ts
~~~


