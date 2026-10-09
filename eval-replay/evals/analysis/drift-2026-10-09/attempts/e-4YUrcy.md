# fe-vs-6406-investigate: notation R2 (e-4YUrcy)

[Case comparison](../cases/notation/fe-vs-6406-investigate.md) · [Complete data and tool outputs](e-4YUrcy.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/16_1304_curated-ambicode-with-prompt-sonnet-5-5/traces/e-4YUrcy.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.1059 + judge $0.0039 = total $0.1099. Harness turns 6, API requests 5, tool calls 5.

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
| 1 | 2026-10-09T13:07:47.065Z | route | {} |
| 2 | 2026-10-09T13:07:47.066Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 3 | 2026-10-09T13:07:47.066Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 4 | 2026-10-09T13:07:47.071Z | envelope | {} |
| 5 | 2026-10-09T13:07:49.222Z | map | {"bytes":5894} |
| 6 | 2026-10-09T13:07:49.253Z | policy | {"bytes":86} |
| 7 | 2026-10-09T13:07:49.283Z | policy | {"bytes":88} |
| 8 | 2026-10-09T13:07:49.284Z | step | {"step":"ground","actor":"code","status":"completed","ms":2217} |
| 9 | 2026-10-09T13:07:49.284Z | step | {"step":"scope","actor":"human","status":"skipped"} |
| 10 | 2026-10-09T13:07:49.286Z | step | {"step":"read","actor":"model","status":"delivered","bytes":2535,"budget":{"modelSteps":1,"modelStepsAllowed":6}} |
| 11 | 2026-10-09T13:08:06.979Z | turn | {} |
| 12 | 2026-10-09T13:08:06.980Z | hook | {"ms":94} |
| 13 | 2026-10-09T13:08:06.997Z | note | {"note":"investigation","path":".ambicode/task/investigate-files-request-need-touch/investigation_2026-10-09T15-08.md"} |
| 14 | 2026-10-09T13:08:07.017Z | exit | {"reason":"done","budget":{"modelSteps":1,"wallMs":19952},"complete":true,"unverified":0} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "363a207a-4",
    "at": "2026-10-09T13:07:47.071Z",
    "route": "363a207a-1",
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
    "hash": "sha256:657929cf6af89e63341783f5d6753735"
  },
  {
    "id": "363a207a-5",
    "at": "2026-10-09T13:07:49.222Z",
    "route": "363a207a-1",
    "kind": "map",
    "mode": "prompt",
    "layers": [
      {
        "name": "shortlist",
        "ms": 1223,
        "hits": 20
      },
      {
        "name": "harvest",
        "ms": 5,
        "hits": 83
      },
      {
        "name": "shortlist",
        "ms": 747,
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
    "id": "363a207a-6",
    "at": "2026-10-09T13:07:49.253Z",
    "route": "363a207a-1",
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
    "id": "363a207a-7",
    "at": "2026-10-09T13:07:49.283Z",
    "route": "363a207a-1",
    "kind": "policy",
    "stage": "before-report",
    "packs": [
      "builtin/common-quality"
    ],
    "rules": 0,
    "omitted": 15,
    "bytes": 88
  }
]
```

### API request 1

Recorded at 2026-10-09T13:07:51.882Z, +5.25 s from session start. Context 18698 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":11420,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":11420},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 1: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-4YUrcy/home/cwd/repo 2>/dev/null && pwd; grep -rn \"app-location-select\" --include=*.ts --include=*.html . --exclude-dir=node_modules | head -30"
}
```

Output: 78 UTF-8 bytes; 388 ms; tool-error=false; SHA256 `818ca90a9009645c6e7a69c6ec232ce332d30a3798836cdf4c8c3ae4c92036e7`.

Output excerpt; full output in JSON tool 1:

~~~text
/private/tmp/e-4YUrcy/home/cwd/repo
(eval):1: no matches found: --include=*.ts
~~~

### API request 2

Recorded at 2026-10-09T13:07:53.788Z, +7.16 s from session start. Context 18961 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":263,"cache_read_input_tokens":18696,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":263},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 2.

#### Tool 2: Grep (Grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "pattern": "app-location-select",
  "path": "/private/tmp/e-4YUrcy/home/cwd/repo",
  "glob": "!node_modules",
  "output_mode": "content"
}
```

Output: 1515 UTF-8 bytes; 129 ms; tool-error=false; SHA256 `7f3c8f8a45a6ce79d2c8798c949d267213c9bb74bfe54f382b4a705f12537809`.

Paths mentioned in output (a mention is not a source-body read):

- `main/components/inputs/location-select/location-select.component.stories.ts`
- `main/components/inputs/location-select/location-select.component.ts`
- `main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html`
- `main/components/dialogs/share-report-modal/share-report-modal.component.html`
- `main/components/dialogs/employee-dialog/employee-dialog.component.html`
- `main/components/dialogs/OrgUnitDialog/OrgUnitDialog.component.html`
- `main/components/dialogs/new-users-dialog/new-users-dialog.component.html`
- `main/components/tables/user-table/edit-user-dialog/edit-user-dialog.component.html`
- `main/screens/org-admin/registered-users/registered-users.component.html`
- `main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.scss`
- `main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.html`
- `main/features/score-types/est/components/wizard/general-data/demographics/est-demographics.component.html`

Output excerpt; full output in JSON tool 2:

~~~text
main/components/inputs/location-select/location-select.component.stories.ts:25:    <app-location-select
main/components/inputs/location-select/location-select.component.ts:44:  selector: "app-location-select",
main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html:53:    <app-location-select class="location" formControlName="orgUnit" />
main/components/dialogs/share-report-modal/share-report-modal.component.html:65:            <app-lo
~~~

#### Tool 3: Glob (Glob)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "pattern": "**/location-select/**",
  "path": "/private/tmp/e-4YUrcy/home/cwd/repo"
}
```

Output: 755 UTF-8 bytes; 90 ms; tool-error=false; SHA256 `4151c7ac5b0a08029db2b46ac5ca948cc7ef3a73a8394015f936e98681a82c25`.

Paths mentioned in output (a mention is not a source-body read):

- `main/components/inputs/location-select/directives/select-location-button.directive.spec.ts`
- `main/components/inputs/location-select/directives/select-location-button.directive.ts`
- `main/components/inputs/location-select/mocks/mock-select-location-button.directive.ts`
- `main/components/inputs/location-select/mocks/mock-selected-location.ts`
- `main/components/inputs/location-select/location-select.module.ts`
- `main/components/inputs/location-select/location-select.component.ts`
- `main/components/inputs/location-select/location-select.component.scss`
- `main/components/inputs/location-select/location-select.component.stories.ts`
- `main/components/inputs/location-select/location-select.component.html`
- `main/components/inputs/location-select/location-select.component.spec.ts`

Output excerpt; full output in JSON tool 3:

~~~text
main/components/inputs/location-select/directives/select-location-button.directive.spec.ts
main/components/inputs/location-select/directives/select-location-button.directive.ts
main/components/inputs/location-select/mocks/mock-select-location-button.directive.ts
main/components/inputs/location-select/mocks/mock-selected-location.ts
main/components/inputs/location-select/location-select.module.ts
main/components/inputs/location-select/location-select.component.ts
main/components/inputs/location-s
~~~

### API request 3

Recorded at 2026-10-09T13:07:56.520Z, +9.89 s from session start. Context 20057 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1096,"cache_read_input_tokens":18959,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1096},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 4: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-4YUrcy/home/cwd/repo/main && cat screens/org-admin/registered-users/registered-users.component.html | head -40; ls screens/org-admin/registered-users; cat screens/org-admin/registered-users/*.scss | head -60; cat components/inputs/location-select/location-select.component.html components/inputs/location-select/location-select.component.scss; sed -n 1,120p components/inputs/location-select/location-select.component.ts; sed -n 40,70p components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html; grep -n \"location\" -B2 -A8 components/inputs/assessment-form/sections/assessment-details-section/*.scss"
}
```

Output: 9927 UTF-8 bytes; 231 ms; tool-error=false; SHA256 `2d9fc536502903c6919bd2d4197d5fdcc85a130345fc4c4ee054210adcb4d0f7`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/screens/org-admin/registered-users/registered-users.component.html`
- `main/components/inputs/location-select/location-select.component.html`
- `components/inputs/location-select/location-select.component.scss`
- `main/components/inputs/location-select/location-select.component.ts`
- `components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html`

Paths mentioned in output (a mention is not a source-body read):

- `components/inputs/readonly-input/readonly-input.component`
- `state/org-structure.facade`
- `directives/select-location-button.directive`
- `main/components/inputs/location-select/location-select.component.html`
- `location-select.component.scss`

Output excerpt; full output in JSON tool 4:

~~~text
<div fxLayout="row wrap" class="pad" fxLayoutAlign="space-between center">
  <div fxLayout="row" fxLayoutAlign="start center" fxLayoutGap="8px">
    <span class="filter-label">
      {{ "screens.org_admin.filter_label" | translate }}
    </span>
    <app-location-select
      class="location-filter"
      [label]="'common.location' | translate"
      [orgId]="orgId()"
      [showHierarchyLevelPrefix]="true"
      hierarchyLevelSeparator=": "
      hierarchyTooltipPosition="above"
      [useDropd
~~~

### API request 4

Recorded at 2026-10-09T13:07:58.676Z, +12.05 s from session start. Context 24650 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":4593,"cache_read_input_tokens":20055,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":4593},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 5: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "grep -rln \"useDropdownButton\\|location-filter\\|expand_more\" . | head; ls screens/org-admin; grep -n \"\\\"button_text\\\"\" -r ../ --include=en.json 2>/dev/null | head -3"
}
```

Output: 748 UTF-8 bytes; 2180 ms; tool-error=false; SHA256 `3220bf5fb427b9d7b25d6affef893ca5d071ffc45109e987ec223b9d864827c2`.

Paths mentioned in output (a mention is not a source-body read):

- `main/screens/org-admin/registered-users/registered-users.component.scss`
- `main/screens/org-admin/registered-users/registered-users.component.html`
- `components/ui/expandable-text/expandable-text.component.html`
- `components/inputs/chips-selector-input/chips-selector-input.component.html`
- `main/components/inputs/location-select/location-select.component.ts`
- `main/components/inputs/location-select/location-select.component.html`
- `main/components/inputs/location-select/location-select.component.spec.ts`
- `../main/assets/i18n/en.json`

Output excerpt; full output in JSON tool 5:

~~~text
./screens/org-admin/registered-users/registered-users.component.scss
./screens/org-admin/registered-users/registered-users.component.html
./components/ui/expandable-text/expandable-text.component.html
./components/inputs/chips-selector-input/chips-selector-input.component.html
./components/inputs/location-select/location-select.component.ts
./components/inputs/location-select/location-select.component.html
./components/inputs/location-select/location-select.component.spec.ts
admin-hierarchy
org-
~~~

### API request 5

Recorded at 2026-10-09T13:08:06.760Z, +20.13 s from session start. Context 25135 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":485,"cache_read_input_tokens":24648,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":485},"output_tokens":720,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
## Summary
On the Registered Users tab, `app-location-select` is rendered with `[useDropdownButton]="true"`. That flag makes it show the `expand_more` arrow icon button. Without the flag, the component shows the text "Select" `mat-button`, which is what `AssessmentForm` uses. So the change is to remove the flag from the Registered Users template and widen the field in that screen's SCSS.

## Evidence
- `main/screens/org-admin/registered-users/registered-users.component.html:6-17` uses `<app-location-select class="location-filter" … [useDropdownButton]="true" …>`.
- `main/components/inputs/location-select/location-select.component.html:21-60` has two branches. With `useDropdownButton()` it renders a `mat-icon-button` containing `expand_more`. Otherwise it renders a `mat-button` showing `{{ buttonText() }}`.
- `buttonText` defaults to the translation `shared.location_select.button_text`, which is "Select" (`main/assets/i18n/en.json:1737`, `location-select.component.ts:57`).
- `main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html:53` uses `<app-location-select class="location" formControlName="orgUnit" />` with no flag, so it gets the "Select" button.
- `registered-users.component.scss:30-35` fixes the field width: `.location-filter ::ng-deep .mat-mdc-form-field { padding: 16px; width: 252px; }`. A text button takes more room than an icon, so this width may need to grow. The exact value is an assumption, to be checked visually.
- `useDropdownButton` is used only in the location-select component, its spec, and this template. The shared component needs no changes.

## Files
- `main/screens/org-admin/registered-users/registered-users.component.html` — existing. Remove `[useDropdownButton]="true"` at line 12.
- `main/screens/org-admin/registered-users/registered-users.component.scss` — existing. Increase the `.location-filter` width from 252px.

## Assumptions
- The `registered-users` directory has no spec file, so no test changes are needed.
- `location-select.component.*` should stay as is, because other screens may rely on the dropdown variant. I did not check whether they do.
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/16_1304_curated-ambicode-with-prompt-sonnet-5-5/traces/exports/78f80a8b-d7a6-470d-810a-a3c630971252/investigate-files-request-need-touch/source.json): 2 artifact files.

Artifact checks (present/size/hash and ledger entry count): pass. Exact source → exported destination, byte count/hash and validation are in the attempt JSON.

Correct historical paths:

- `main/screens/org-admin/registered-users/registered-users.component.html`
- `main/screens/org-admin/registered-users/registered-users.component.scss`

Named non-truth paths:

None.

Final model answer:

~~~text
## Summary
On the Registered Users tab, `app-location-select` is rendered with `[useDropdownButton]="true"`. That flag makes it show the `expand_more` arrow icon button. Without the flag, the component shows the text "Select" `mat-button`, which is what `AssessmentForm` uses. So the change is to remove the flag from the Registered Users template and widen the field in that screen's SCSS.

## Evidence
- `main/screens/org-admin/registered-users/registered-users.component.html:6-17` uses `<app-location-select class="location-filter" … [useDropdownButton]="true" …>`.
- `main/components/inputs/location-select/location-select.component.html:21-60` has two branches. With `useDropdownButton()` it renders a `mat-icon-button` containing `expand_more`. Otherwise it renders a `mat-button` showing `{{ buttonText() }}`.
- `buttonText` defaults to the translation `shared.location_select.button_text`, which is "Select" (`main/assets/i18n/en.json:1737`, `location-select.component.ts:57`).
- `main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html:53` uses `<app-location-select class="location" formControlName="orgUnit" />` with no flag, so it gets the "Select" button.
- `registered-users.component.scss:30-35` fixes the field width: `.location-filter ::ng-deep .mat-mdc-form-field { padding: 16px; width: 252px; }`. A text button takes more room than an icon, so this width may need to grow. The exact value is an assumption, to be checked visually.
- `useDropdownButton` is used only in the location-select component, its spec, and this template. The shared component needs no changes.

## Files
- `main/screens/org-admin/registered-users/registered-users.component.html` — existing. Remove `[useDropdownButton]="true"` at line 12.
- `main/screens/org-admin/registered-users/registered-users.component.scss` — existing. Increase the `.location-filter` width from 252px.

## Assumptions
- The `registered-users` directory has no spec file, so no test changes are needed.
- `location-select.component.*` should stay as is, because other screens may rely on the dropdown variant. I did not check whether they do.
~~~


