# fe-vs-6406-investigate: notation R3 (e-WU4jXY)

[Case comparison](../cases/notation/fe-vs-6406-investigate.md) · [Complete data and tool outputs](e-WU4jXY.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/16_1304_curated-ambicode-with-prompt-sonnet-5-5/traces/e-WU4jXY.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.1194 + judge $0.0045 = total $0.1238. Harness turns 5, API requests 5, tool calls 4.

## Starting inputs

Prompt SHA256: `698bd507fa6553e1ee26e13ac0a8ff7dde86ce56a6b70636706cd4496c16132a`. Normalized delivered-step SHA256: `a73b7d0d3754f2229930adac01bcad13223d3d269632259001271826d953de26`. Contract SHA256: `edc68aaa9243b44ec0f5da41d77f8612643562db8efcd533ec8d73870b25b73e`.

The exact prompt lives in the immutable eval result linked from the main report; the complete initial route delivery and contract text are in this attempt JSON.

```text
[ambicode] investigate · task investigate-files-request-need-touch · step read (5/5)
Now: Read the code the question is about -> answer it.
Then: answer the user; your answer is saved as the investigation note when you stop
Route: ground✓ [read]

Mode: headless (set by the user).

- @map lists leads, not answers: open those that fit.
- one `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" read --task investigate-files-request-need-touch <path[:a-b]>…` call with every file and span.
- claim => cite `path:line` · assumption => mark it.
- premise not in the code => say so after a short search; answer from what exists.
- files question => answer the whole request as written: each existing file implementing it edits (its types, schema, DTO, mocks, routes and tests) + any file its requirements may need, naming that assumption. !files that only explain the code · !files only your own extras need · !similar features the request does not name.
Diagnostics (reproduce, print a value) => only `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" check --task investigate-files-request-need-touch <projectId>/<checkId> --only <spec> --phase red`, after ?the user · declined => !run; inconclusive.
!edit anything.

## map
tuning: 3bd1fbc43250
Leads from the terms app-location-select, AssessmentForm (+16 more):
1. main/components/inputs/assessment-form/assessment-form.service.ts:47 — sits under a directory matching "assessment-form", a path spelling of "AssessmentForm"
2. main/components/inputs/assessment-form/assessment-form.component.ts:43 — sits under a directory matching "assessment-form", a path spelling of "AssessmentForm"
3. main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.ts:41 — sits under a directory matching "assessment-form", a path spelling of "AssessmentForm"
4. main/components/inputs/assessment-form/sections/subject-section/subject-section.component.ts:51
5. main/components/inputs/assessment-form/sections/task-section/task-section.component.ts:41
6. main/components/inputs/assessment-form/models/assessment-form.model.ts:13
7. main/components/inputs/assessment-form/sections/video-section/video-section.component.ts:30
8. main/components/inputs/location-select/location-select.component.ts:4
Same feature (main/components/inputs/assessment-form/): assessment-form.component.spec.ts
Declared more than once: isVideoTruncated, form, valid, value, updateStart, updateEnd.
```

## Engine events in recorded order

The engine ledger and model trace use different clocks/events. Entries below retain timestamps; model calls follow in their own recorded order. No invented interleaving or internal model reasoning is assigned.

| # | UTC | Event | Input / output / state |
|---|---|---|---|
| 1 | 2026-10-09T13:07:50.549Z | route | {} |
| 2 | 2026-10-09T13:07:50.550Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 3 | 2026-10-09T13:07:50.550Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 4 | 2026-10-09T13:07:50.554Z | envelope | {} |
| 5 | 2026-10-09T13:07:52.421Z | map | {"bytes":5894} |
| 6 | 2026-10-09T13:07:52.450Z | policy | {"bytes":86} |
| 7 | 2026-10-09T13:07:52.473Z | policy | {"bytes":88} |
| 8 | 2026-10-09T13:07:52.473Z | step | {"step":"ground","actor":"code","status":"completed","ms":1923} |
| 9 | 2026-10-09T13:07:52.474Z | step | {"step":"scope","actor":"human","status":"skipped"} |
| 10 | 2026-10-09T13:07:52.475Z | step | {"step":"read","actor":"model","status":"delivered","bytes":2535,"budget":{"modelSteps":1,"modelStepsAllowed":6}} |
| 11 | 2026-10-09T13:08:00.155Z | search | {"bytes":17071} |
| 12 | 2026-10-09T13:08:00.173Z | command | {"ms":145} |
| 13 | 2026-10-09T13:08:11.504Z | turn | {} |
| 14 | 2026-10-09T13:08:11.504Z | hook | {"ms":91} |
| 15 | 2026-10-09T13:08:11.521Z | note | {"note":"investigation","path":".ambicode/task/investigate-files-request-need-touch/investigation_2026-10-09T15-08.md"} |
| 16 | 2026-10-09T13:08:11.540Z | exit | {"reason":"done","budget":{"modelSteps":1,"wallMs":20991},"complete":true,"unverified":0} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "683d094e-4",
    "at": "2026-10-09T13:07:50.554Z",
    "route": "683d094e-1",
    "kind": "envelope",
    "sources": [
      {
        "key": "ARGS",
        "title": "Investigate which files this request would need to touch. Read the relevant cod…",
        "relation": "args",
        "derivedFrom": null,
        "bytes": 639
      }
    ],
    "builtFrom": "args",
    "asked": [],
    "missingAsked": [],
    "hash": "sha256:839b07480c221356bb4fd095883ef4e2"
  },
  {
    "id": "683d094e-5",
    "at": "2026-10-09T13:07:52.421Z",
    "route": "683d094e-1",
    "kind": "map",
    "mode": "prompt",
    "layers": [
      {
        "name": "shortlist",
        "ms": 994,
        "hits": 20
      },
      {
        "name": "harvest",
        "ms": 5,
        "hits": 83
      },
      {
        "name": "shortlist",
        "ms": 726,
        "hits": 20
      }
    ],
    "layersSource": "default",
    "terms": {
      "pass1": [
        "app-location-select",
        "AssessmentForm",
        "Select",
        "request",
        "code",
        "select",
        "component",
        "role",
        "path",
        "mark",
        "snapshot",
        "commands"
      ],
      "pass2": [
        "app-location-select",
        "AssessmentForm",
        "Select",
        "request",
        "code",
        "select",
        "AssessmentFormService",
        "forms",
        "employeeService",
        "orgFacade",
        "locationsFacade",
        "userFacade"
      ]
    },
    "candidates": 27,
    "limitations": [
      "\"Select\" appears in 1314 files; only the first 200 were ranked.",
      "\"code\" appears in 217 files; only the first 200 were ranked.",
      "\"component\" appears in 1119 files; only the first 200 were ranked.",
      "\"component\" matched 2149 of the project's 3531 files, which is not a shortlist, so it was ignored.",
      "\"path\" appears in 402 files; only the first 200 were ranked.",
      "Co-change contributed nothing: 1 commit(s) in this repository touch the files the terms matched.",
      "454 matching file(s) are not listed: they fall outside projects[].shortlist in .ambicode/config.yaml (tests, styles, markup and data by default).",
      "310 further candidate(s) scored but are not listed; raise --limit to see them.",
      "\"forms\" appears in 501 files; only the first 200 were ranked.",
      "326 matching file(s) are not listed: they fall outside projects[].shortlist in .ambicode/config.yaml (tests, styles, markup and data by default).",
      "434 further candidate(s) scored but are not listed; raise --limit to see them."
    ],
    "index": "none",
    "collisions": [
      "isVideoTruncated",
      "form",
      "valid",
      "value",
      "updateStart",
      "updateEnd",
      "formService",
      "videoUrl",
      "videoError",
      "UnitSystem",
      "MeasureType"
    ],
    "bytes": 5894,
    "serialized": 3,
    "feature": {
      "root": "main/components/inputs/assessment-form",
      "paths": 1
    },
    "candidatePaths": [
      "main/components/inputs/assessment-form/assessment-form.service.ts",
      "main/components/inputs/assessment-form/assessment-form.component.ts",
      "main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.ts",
      "main/components/inputs/assessment-form/sections/subject-section/subject-section.component.ts",
      "main/components/inputs/assessment-form/sections/task-section/task-section.component.ts",
      "main/components/inputs/assessment-form/models/assessment-form.model.ts",
      "main/components/inputs/assessment-form/sections/video-section/video-section.component.ts",
      "main/components/inputs/location-select/location-select.component.ts",
      "main/components/inputs/location-select/directives/select-location-button.directive.ts",
      "main/components/inputs/employee-select/employee-select.component.ts",
      "main/components/inputs/chips-selector-input/chips-selector-input.component.ts",
      "main/components/dialogs/LocationSelectDialog/LocationSelectDialog.component.ts",
      "main/components/inputs/employee-select/employee-select.module.ts",
      "scripts/sync-markdown.openai.mjs",
      "main/screens/report/report.component.ts",
      "main/interceptors/global-error-handler.ts",
      "main/screens/app/nav-header/components/profile-dropdown/select-modal/select-modal.component.ts",
      "main/screens/forgotPassword/forgotPassword.component.ts",
      "main/components/inputs/employee-select/directives/create-employee-button.directive.ts",
      "main/components/inputs/employee-select/mocks/mock-create-employee-button.directive.ts"
    ],
    "tuning": {
      "hash": "3bd1fbc43250",
      "overrides": []
    },
    "profile": null,
    "decisions": {
      "sequenceFiles": 0,
      "pass2Downweighted": 7,
      "harvestFiles": 8,
      "feature": "folder",
      "proseRetry": false
    },
    "delivered": {
      "leads": [
        "main/components/inputs/assessment-form/assessment-form.service.ts",
        "main/components/inputs/assessment-form/assessment-form.component.ts",
        "main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.ts",
        "main/components/inputs/assessment-form/sections/subject-section/subject-section.component.ts",
        "main/components/inputs/assessment-form/sections/task-section/task-section.component.ts",
        "main/components/inputs/assessment-form/models/assessment-form.model.ts",
        "main/components/inputs/assessment-form/sections/video-section/video-section.component.ts",
        "main/components/inputs/location-select/location-select.component.ts"
      ],
      "feature": [
        "main/components/inputs/assessment-form/assessment-form.component.spec.ts"
      ],
      "bytes": 1243,
      "hash": "ce9eaa89d27d"
    }
  },
  {
    "id": "683d094e-6",
    "at": "2026-10-09T13:07:52.450Z",
    "route": "683d094e-1",
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
    "id": "683d094e-7",
    "at": "2026-10-09T13:07:52.473Z",
    "route": "683d094e-1",
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
    "id": "683d094e-11",
    "at": "2026-10-09T13:08:00.155Z",
    "route": "683d094e-1",
    "kind": "search",
    "command": "read",
    "names": [
      "main/components/inputs/location-select/location-select.component.html:1-67",
      "main/components/inputs/location-select/location-select.component.ts:1-272",
      "main/components/inputs/location-select/location-select.component.scss:1-24",
      "main/screens/org-admin/registered-users/registered-users.component.html:1-59",
      "main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html:1-55"
    ],
    "hits": 5,
    "bytes": 17071,
    "truncated": 0
  }
]
```

### API request 1

Recorded at 2026-10-09T13:07:54.726Z, +4.45 s from session start. Context 18702 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":11424,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":11424},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 1: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-WU4jXY/home/cwd/repo 2>/dev/null && pwd; ls main/components/inputs/location-select; grep -rn \"app-location-select\" --include=* . -l --exclude-dir=node_modules | head -20"
}
```

Output: 280 UTF-8 bytes; 267 ms; tool-error=false; SHA256 `06bda963cd27f02fbc8567f4bc6a2d127b4b8c476a46c85dcfe6e1e0b6fb2cf6`.

Output excerpt; full output in JSON tool 1:

~~~text
/private/tmp/e-WU4jXY/home/cwd/repo
directives
location-select.component.html
location-select.component.scss
location-select.component.spec.ts
location-select.component.stories.ts
location-select.component.ts
location-select.module.ts
mocks
(eval):1: no matches found: --include=*
~~~

### API request 2

Recorded at 2026-10-09T13:07:56.758Z, +6.48 s from session start. Context 19035 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":333,"cache_read_input_tokens":18700,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":333},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 2: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "grep -rln \"app-location-select\" . --exclude-dir=node_modules --exclude-dir=.git | head -20; echo ---; grep -rn \"Select\" main/components/inputs/assessment-form --include=*.html | head -20"
}
```

Output: 1238 UTF-8 bytes; 1079 ms; tool-error=false; SHA256 `062af1556e1726bb07381e6e35d49c5bc512a65eecc07a1fc23514dea4b78855`.

Paths mentioned in output (a mention is not a source-body read):

- `.ambicode/task/investigate-files-request-need-touch/ledger.jsonl`
- `.ambicode/task/investigate-files-request-need-touch/steps/payload-683d094e-1-map.txt`
- `main/features/score-types/est/components/wizard/general-data/demographics/est-demographics.component.html`
- `main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.html`
- `main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.scss`
- `main/screens/org-admin/registered-users/registered-users.component.html`
- `main/components/tables/user-table/edit-user-dialog/edit-user-dialog.component.html`
- `main/components/dialogs/new-users-dialog/new-users-dialog.component.html`
- `main/components/dialogs/OrgUnitDialog/OrgUnitDialog.component.html`
- `main/components/dialogs/employee-dialog/employee-dialog.component.html`
- `main/components/dialogs/share-report-modal/share-report-modal.component.html`
- `main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html`
- `main/components/inputs/location-select/location-select.component.ts`
- `main/components/inputs/location-select/location-select.component.stories.ts`

Output excerpt; full output in JSON tool 2:

~~~text
./.ambicode/task/investigate-files-request-need-touch/ledger.jsonl
./.ambicode/task/investigate-files-request-need-touch/steps/payload-683d094e-1-map.txt
./main/features/score-types/est/components/wizard/general-data/demographics/est-demographics.component.html
./main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.html
./main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.scss
./main/screens/org-admin/registe
~~~

### API request 3

Recorded at 2026-10-09T13:07:59.719Z, +9.44 s from session start. Context 19659 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":624,"cache_read_input_tokens":19033,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":624},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 3: Bash (bash)

Responsible path: CLI runRead → readMany → search ledger receipt.

Input:

```json
{
  "command": "cd /private/tmp/e-WU4jXY/home/cwd/repo; N=\"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\"; node \"$N\" read --task investigate-files-request-need-touch main/components/inputs/location-select/location-select.component.html main/components/inputs/location-select/location-select.component.ts main/components/inputs/location-select/location-select.component.scss main/screens/org-admin/registered-users/registered-users.component.html main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html"
}
```

Output: 17071 UTF-8 bytes; 463 ms; tool-error=false; SHA256 `f9bf2788362e2b0b904089b98f3f2b0cd95ff04ba22d738e27469d7ed82501de`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`
- `main/components/inputs/location-select/location-select.component.html`
- `main/components/inputs/location-select/location-select.component.ts`
- `main/components/inputs/location-select/location-select.component.scss`
- `main/screens/org-admin/registered-users/registered-users.component.html`
- `main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html`

Reader header spans:

```json
[
  {
    "path": "main/components/inputs/location-select/location-select.component.html",
    "requestedFrom": 1,
    "requestedTo": 67,
    "totalLines": 67
  },
  {
    "path": "main/components/inputs/location-select/location-select.component.ts",
    "requestedFrom": 1,
    "requestedTo": 272,
    "totalLines": 272
  },
  {
    "path": "main/components/inputs/location-select/location-select.component.scss",
    "requestedFrom": 1,
    "requestedTo": 24,
    "totalLines": 24
  },
  {
    "path": "main/screens/org-admin/registered-users/registered-users.component.html",
    "requestedFrom": 1,
    "requestedTo": 59,
    "totalLines": 59
  },
  {
    "path": "main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html",
    "requestedFrom": 1,
    "requestedTo": 55,
    "totalLines": 55
  }
]
```

Headers describe requested/clamped spans. A budget-cut footer overrides actual served end; consult full output for the continuation.

Paths mentioned in output (a mention is not a source-body read):

- `main/components/inputs/location-select/location-select.component.html`
- `main/components/inputs/location-select/location-select.component.ts`
- `components/inputs/readonly-input/readonly-input.component`
- `state/org-structure.facade`
- `directives/select-location-button.directive`
- `location-select.component.scss`
- `main/components/inputs/location-select/location-select.component.scss`
- `main/screens/org-admin/registered-users/registered-users.component.html`
- `main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html`

Output excerpt; full output in JSON tool 3:

~~~text
== main/components/inputs/location-select/location-select.component.html (lines 1-67 of 67) ==
== main/components/inputs/location-select/location-select.component.ts (lines 1-272 of 272) ==
== main/components/inputs/location-select/location-select.component.scss (lines 1-24 of 24) ==
== main/screens/org-admin/registered-users/registered-users.component.html (lines 1-59 of 59) ==
== main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html (lines 1-55 of 55) ==
== main/components/inputs/location-select/location-select.component.html (lines 1-67 of 67) ==
1	<mat-form-field
2	  [appearance]="appearance()"
3	  [floatLabel]="floatLabel()"
4	  subscriptSizing="dynamic"
5	>
6	  <ng-container ngProjectAs="mat-label">
7	    @if (label()) {
8	      <mat-label>
9	        {{ label() }}
10	      </mat-label>
11	    }
12	  </ng-container>
13	
14	  <app-readonly-input
15	    [formControl]="control"
16	    [displayFn]="locationDisplayFn"
17	    [tooltipText]="locatio
~~~

### API request 4

Recorded at 2026-10-09T13:08:01.881Z, +11.60 s from session start. Context 27210 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":7551,"cache_read_input_tokens":19657,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":7551},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 4: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-WU4jXY/home/cwd/repo; ls main/screens/org-admin/registered-users; cat main/screens/org-admin/registered-users/*.scss; grep -rn \"useDropdownButton\" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.ambicode | grep -v \"location-select.component.ts\""
}
```

Output: 1336 UTF-8 bytes; 1172 ms; tool-error=false; SHA256 `11a52556cfa3c0cb3f20c45baac29132a3d85d0fcef98c76124b12e3f3e65da6`.

Paths mentioned in output (a mention is not a source-body read):

- `main/screens/org-admin/registered-users/registered-users.component.html`
- `main/components/inputs/location-select/location-select.component.html`
- `main/components/inputs/location-select/location-select.component.spec.ts`

Output excerpt; full output in JSON tool 4:

~~~text
registered-users.component.html
registered-users.component.scss
registered-users.component.ts
$mobileMaxWidth: 839px;
$filterLabelGap: 8px;

:host {
  display: block;
  max-height: 100%;
}

.pad {
  padding-top: 10px;
}

.filter-label {
  font-weight: 500;
  white-space: nowrap;
}

.filter-label--spacer {
  display: none;
  visibility: hidden;
  margin-right: $filterLabelGap;

  @media screen and (max-width: $mobileMaxWidth) {
    display: inline-block;
  }
}

.location-filter {
  ::ng-deep .mat
~~~

### API request 5

Recorded at 2026-10-09T13:08:11.260Z, +20.98 s from session start. Context 28056 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":846,"cache_read_input_tokens":27208,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":846},"output_tokens":728,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
Replacing the arrow with the "Select" button on the Admin – Registered Users tab needs edits to two files, with an optional third (my assumption).

The tab is rendered by `RegisteredUsersComponent`. That is the only place in the repo that passes `useDropdownButton`. The change is to stop passing it, so the component falls back to its existing "Select" text button, which is what AssessmentForm shows.

## Evidence
- **Where the arrow comes from:** `location-select.component.html:28-46` renders an icon button with `expand_more` when `useDropdownButton()` is true. Otherwise (`:47-65`) it renders the `mat-button` with `{{ buttonText() }}`.
- **Default:** `location-select.component.ts:70-72` defaults `useDropdownButton` to `false`. `buttonText` defaults to the `shared.location_select.button_text` translation (`:56-58`). I did not look up that translation's text, so I'm assuming it reads "Select".
- **Registered Users:** `registered-users.component.html:6-16` is the only place that sets `[useDropdownButton]="true"` (line 13). I confirmed this with a repo-wide grep. The only other hit is the component's own spec, `location-select.component.spec.ts:158`.
- **AssessmentForm:** `assessment-details-section.component.html:53` uses `<app-location-select class="location" formControlName="orgUnit" />` with no flag, so it shows the text button.
- **Field width:** `registered-users.component.scss:26-31` sets `.location-filter ::ng-deep .mat-mdc-form-field` to `width: 252px`. A text button needs more room than an icon button, so this value probably has to grow. That is the "increase width if needed" part of the ticket. I haven't measured the rendered result, so the new value is an assumption.

## Files and their roles
**Existing, to edit:**
- `main/screens/org-admin/registered-users/registered-users.component.html`: remove `[useDropdownButton]="true"` at line 13.
- `main/screens/org-admin/registered-users/registered-users.component.scss`: widen the `.location-filter` field at lines 26-31.

**Optional (assumption):**
- `main/components/inputs/location-select/location-select.component.scss`: only if the shared layout needs a tweak so the button fits. It already has `flex-wrap: nowrap`, `min-width: 0` and a non-shrinking suffix (lines 9-24), so I expect the field-width change alone to be enough.

**Not touched:**
- `location-select.component.html`, `location-select.component.ts`, the spec, the stories, and the other `app-location-select` consumers. The dropdown mode is still tested in the spec (`location-select.component.spec.ts:158`), and removing the input would be out of scope.
- No files are created or deleted.

## Files
- main/screens/org-admin/registered-users/registered-users.component.html
- main/screens/org-admin/registered-users/registered-users.component.scss
- main/components/inputs/location-select/location-select.component.scss
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/16_1304_curated-ambicode-with-prompt-sonnet-5-5/traces/exports/b94c7540-59a2-40a9-b1ca-2f2cbb06936c/investigate-files-request-need-touch/source.json): 2 artifact files.

Artifact checks (present/size/hash and ledger entry count): pass. Exact source → exported destination, byte count/hash and validation are in the attempt JSON.

Correct historical paths:

- `main/screens/org-admin/registered-users/registered-users.component.html`
- `main/screens/org-admin/registered-users/registered-users.component.scss`

Named non-truth paths:

- `main/components/inputs/location-select/location-select.component.scss`

Final model answer:

~~~text
Replacing the arrow with the "Select" button on the Admin – Registered Users tab needs edits to two files, with an optional third (my assumption).

The tab is rendered by `RegisteredUsersComponent`. That is the only place in the repo that passes `useDropdownButton`. The change is to stop passing it, so the component falls back to its existing "Select" text button, which is what AssessmentForm shows.

## Evidence
- **Where the arrow comes from:** `location-select.component.html:28-46` renders an icon button with `expand_more` when `useDropdownButton()` is true. Otherwise (`:47-65`) it renders the `mat-button` with `{{ buttonText() }}`.
- **Default:** `location-select.component.ts:70-72` defaults `useDropdownButton` to `false`. `buttonText` defaults to the `shared.location_select.button_text` translation (`:56-58`). I did not look up that translation's text, so I'm assuming it reads "Select".
- **Registered Users:** `registered-users.component.html:6-16` is the only place that sets `[useDropdownButton]="true"` (line 13). I confirmed this with a repo-wide grep. The only other hit is the component's own spec, `location-select.component.spec.ts:158`.
- **AssessmentForm:** `assessment-details-section.component.html:53` uses `<app-location-select class="location" formControlName="orgUnit" />` with no flag, so it shows the text button.
- **Field width:** `registered-users.component.scss:26-31` sets `.location-filter ::ng-deep .mat-mdc-form-field` to `width: 252px`. A text button needs more room than an icon button, so this value probably has to grow. That is the "increase width if needed" part of the ticket. I haven't measured the rendered result, so the new value is an assumption.

## Files and their roles
**Existing, to edit:**
- `main/screens/org-admin/registered-users/registered-users.component.html`: remove `[useDropdownButton]="true"` at line 13.
- `main/screens/org-admin/registered-users/registered-users.component.scss`: widen the `.location-filter` field at lines 26-31.

**Optional (assumption):**
- `main/components/inputs/location-select/location-select.component.scss`: only if the shared layout needs a tweak so the button fits. It already has `flex-wrap: nowrap`, `min-width: 0` and a non-shrinking suffix (lines 9-24), so I expect the field-width change alone to be enough.

**Not touched:**
- `location-select.component.html`, `location-select.component.ts`, the spec, the stories, and the other `app-location-select` consumers. The dropdown mode is still tested in the spec (`location-select.component.spec.ts:158`), and removing the input would be out of scope.
- No files are created or deleted.

## Files
- main/screens/org-admin/registered-users/registered-users.component.html
- main/screens/org-admin/registered-users/registered-users.component.scss
- main/components/inputs/location-select/location-select.component.scss
~~~


