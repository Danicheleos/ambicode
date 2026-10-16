# fe-vs-6406-investigate: notation R1 (e-IdspwN)

[Case comparison](../cases/notation/fe-vs-6406-investigate.md) · [Complete data and tool outputs](e-IdspwN.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/16_1304_curated-ambicode-with-prompt-sonnet-5-5/traces/e-IdspwN.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.1333 + judge $0.0047 = total $0.1380. Harness turns 7, API requests 7, tool calls 6.

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
| 1 | 2026-10-09T13:07:37.418Z | route | {} |
| 2 | 2026-10-09T13:07:37.419Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 3 | 2026-10-09T13:07:37.420Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 4 | 2026-10-09T13:07:37.424Z | envelope | {} |
| 5 | 2026-10-09T13:07:39.528Z | map | {"bytes":5894} |
| 6 | 2026-10-09T13:07:39.562Z | policy | {"bytes":86} |
| 7 | 2026-10-09T13:07:39.592Z | policy | {"bytes":88} |
| 8 | 2026-10-09T13:07:39.592Z | step | {"step":"ground","actor":"code","status":"completed","ms":2172} |
| 9 | 2026-10-09T13:07:39.593Z | step | {"step":"scope","actor":"human","status":"skipped"} |
| 10 | 2026-10-09T13:07:39.594Z | step | {"step":"read","actor":"model","status":"delivered","bytes":2535,"budget":{"modelSteps":1,"modelStepsAllowed":6}} |
| 11 | 2026-10-09T13:08:01.623Z | turn | {} |
| 12 | 2026-10-09T13:08:01.623Z | hook | {"ms":91} |
| 13 | 2026-10-09T13:08:01.640Z | note | {"note":"investigation","path":".ambicode/task/investigate-files-request-need-touch/investigation_2026-10-09T15-08.md"} |
| 14 | 2026-10-09T13:08:01.662Z | exit | {"reason":"done","budget":{"modelSteps":1,"wallMs":24244},"complete":true,"unverified":0} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "9a4ce676-4",
    "at": "2026-10-09T13:07:37.424Z",
    "route": "9a4ce676-1",
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
    "hash": "sha256:1d1f95229e2eaf597577592ac84fa52b"
  },
  {
    "id": "9a4ce676-5",
    "at": "2026-10-09T13:07:39.528Z",
    "route": "9a4ce676-1",
    "kind": "map",
    "mode": "prompt",
    "layers": [
      {
        "name": "shortlist",
        "ms": 1074,
        "hits": 20
      },
      {
        "name": "harvest",
        "ms": 5,
        "hits": 83
      },
      {
        "name": "shortlist",
        "ms": 878,
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
    "id": "9a4ce676-6",
    "at": "2026-10-09T13:07:39.562Z",
    "route": "9a4ce676-1",
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
    "id": "9a4ce676-7",
    "at": "2026-10-09T13:07:39.592Z",
    "route": "9a4ce676-1",
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

Recorded at 2026-10-09T13:07:41.249Z, +4.11 s from session start. Context 18635 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":11357,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":11357},"output_tokens":17,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 1: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-IdspwN/home/cwd/repo && grep -rIl \"app-location-select\\|LocationSelect\" --exclude-dir=node_modules --exclude-dir=.git . | head -50"
}
```

Output: 2176 UTF-8 bytes; 853 ms; tool-error=false; SHA256 `46218d942442de2bfedfe3564e338096c28650700334f74b3bcfc7569d65e84a`.

Paths mentioned in output (a mention is not a source-body read):

- `.ambicode/task/investigate-files-request-need-touch/ledger.jsonl`
- `.ambicode/task/investigate-files-request-need-touch/steps/payload-9a4ce676-1-map.txt`
- `main/features/score-types/est/components/wizard/general-data/demographics/est-demographics.component.ts`
- `main/features/score-types/est/components/wizard/general-data/demographics/est-demographics.component.html`
- `main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.html`
- `main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.scss`
- `main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.ts`
- `main/screens/org-admin/registered-users/registered-users.component.ts`
- `main/screens/org-admin/registered-users/registered-users.component.html`
- `main/components/tables/user-table/edit-user-dialog/edit-user-dialog.component.html`
- `main/components/dialogs/new-users-dialog/new-users-dialog.component.html`
- `main/components/dialogs/new-users-dialog/new-users-dialog.component.ts`
- `main/components/dialogs/LocationSelectDialog/LocationSelectDialog.component.ts`
- `main/components/dialogs/OrgUnitDialog/OrgUnitDialog.component.html`
- `main/components/dialogs/employee-dialog/employee-dialog.component.html`
- `main/components/dialogs/share-report-modal/share-report-modal.component.html`
- `main/components/components.module.ts`
- `main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.ts`
- `main/components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html`
- `main/components/inputs/assessment-form/assessment-form.component.spec.ts`
- `main/components/inputs/location-select/directives/select-location-button.directive.spec.ts`
- `main/components/inputs/location-select/directives/select-location-button.directive.ts`
- `main/components/inputs/location-select/location-select.module.ts`
- `main/components/inputs/location-select/location-select.component.ts`
- `main/components/inputs/location-select/location-select.component.stories.ts`
- `main/components/inputs/location-select/location-select.component.spec.ts`

Output excerpt; full output in JSON tool 1:

~~~text
./.ambicode/task/investigate-files-request-need-touch/ledger.jsonl
./.ambicode/task/investigate-files-request-need-touch/steps/payload-9a4ce676-1-map.txt
./main/features/score-types/est/components/wizard/general-data/demographics/est-demographics.component.ts
./main/features/score-types/est/components/wizard/general-data/demographics/est-demographics.component.html
./main/features/score-types/nom/shared/wizards/nom-general-data/nom-general-data-wizard.component.html
./main/features/score-types/n
~~~

### API request 2

Recorded at 2026-10-09T13:07:43.944Z, +6.80 s from session start. Context 19656 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1021,"cache_read_input_tokens":18633,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1021},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 2: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-IdspwN/home/cwd/repo/main && grep -n -B3 -A8 \"location-select\\|select-location\" screens/org-admin/registered-users/registered-users.component.html components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html; cat components/inputs/location-select/location-select.component.ts; ls components/inputs/location-select components/inputs/location-select/directives; cat components/inputs/location-select/directives/select-location-button.directive.ts"
}
```

Output: 14047 UTF-8 bytes; 206 ms; tool-error=false; SHA256 `21ef4d256556aa5c597935f742529d36213641ef158019f110bee203b1f85a0d`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/screens/org-admin/registered-users/registered-users.component.html`
- `components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html`
- `main/components/inputs/location-select/location-select.component.ts`
- `main/components/inputs/location-select/directives/select-location-button.directive.ts`

Paths mentioned in output (a mention is not a source-body read):

- `main/screens/org-admin/registered-users/registered-users.component.html`
- `components/inputs/assessment-form/sections/assessment-details-section/assessment-details-section.component.html`
- `components/inputs/readonly-input/readonly-input.component`
- `state/org-structure.facade`
- `directives/select-location-button.directive`
- `main/components/inputs/location-select/location-select.component.html`
- `location-select.component.scss`
- `components/dialogs/LocationSelectDialog/LocationSelectDialog.component`
- `state/hierarchy.facade`
- `state/locations.facade`
- `state/org.facade`

Output excerpt; full output in JSON tool 2:

~~~text
screens/org-admin/registered-users/registered-users.component.html-3-    <span class="filter-label">
screens/org-admin/registered-users/registered-users.component.html-4-      {{ "screens.org_admin.filter_label" | translate }}
screens/org-admin/registered-users/registered-users.component.html-5-    </span>
screens/org-admin/registered-users/registered-users.component.html:6:    <app-location-select
screens/org-admin/registered-users/registered-users.component.html-7-      class="location-filter"
~~~

### API request 3

Recorded at 2026-10-09T13:07:46.041Z, +8.90 s from session start. Context 25407 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":5751,"cache_read_input_tokens":19654,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":5751},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 3: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cat components/inputs/location-select/location-select.component.html components/inputs/location-select/location-select.component.scss; cat screens/org-admin/registered-users/registered-users.component.scss | grep -n -B2 -A8 \"location\"; grep -n \"useDropdownButton\\|button_text\" -r . --include=*.ts --include=*.html --include=*.json -l | head -20"
}
```

Output: 2508 UTF-8 bytes; 190 ms; tool-error=false; SHA256 `86bf04e5c1b56544037210e1152cf6e76db69708dae63ef507dc836fa4a3888b`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/components/inputs/location-select/location-select.component.html`
- `components/inputs/location-select/location-select.component.scss`
- `main/screens/org-admin/registered-users/registered-users.component.scss`

Output excerpt; full output in JSON tool 3:

~~~text
<mat-form-field
  [appearance]="appearance()"
  [floatLabel]="floatLabel()"
  subscriptSizing="dynamic"
>
  <ng-container ngProjectAs="mat-label">
    @if (label()) {
      <mat-label>
        {{ label() }}
      </mat-label>
    }
  </ng-container>

  <app-readonly-input
    [formControl]="control"
    [displayFn]="locationDisplayFn"
    [tooltipText]="locationHierarchyTooltip()"
    [tooltipPosition]="hierarchyTooltipPosition()"
    tooltipClass="location-hierarchy-tooltip"
    [richPrefixText
~~~

### API request 4

Recorded at 2026-10-09T13:07:47.393Z, +10.25 s from session start. Context 26728 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1321,"cache_read_input_tokens":25405,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1321},"output_tokens":10,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 4: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "grep -rn \"useDropdownButton\\|expand_more\" . --include=*.ts --include=*.html --include=*.scss | grep -i \"location\\|registered\""
}
```

Output: 42 UTF-8 bytes; 584 ms; tool-error=false; SHA256 `8324441ecbddb5042c1f73d54cdadb7746defb638a7c50ca181beee42a1d0dfb`.

Output excerpt; full output in JSON tool 4:

~~~text
(eval):1: no matches found: --include=*.ts
~~~

### API request 5

Recorded at 2026-10-09T13:07:49.407Z, +12.27 s from session start. Context 26903 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":175,"cache_read_input_tokens":26726,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":175},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 5: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "grep -rn \"useDropdownButton\" . | grep -v node_modules"
}
```

Output: 481 UTF-8 bytes; 1168 ms; tool-error=false; SHA256 `89f0734a0fcc97175a9da1ff246e225355c2f685e5ddd25dd4642d0dbc4a7b20`.

Paths mentioned in output (a mention is not a source-body read):

- `main/screens/org-admin/registered-users/registered-users.component.html`
- `main/components/inputs/location-select/location-select.component.ts`
- `main/components/inputs/location-select/location-select.component.html`
- `main/components/inputs/location-select/location-select.component.spec.ts`

Output excerpt; full output in JSON tool 5:

~~~text
./screens/org-admin/registered-users/registered-users.component.html:13:      [useDropdownButton]="true"
./components/inputs/location-select/location-select.component.ts:70:  public readonly useDropdownButton = input<boolean, unknown>(false, {
./components/inputs/location-select/location-select.component.html:28:    @if (useDropdownButton()) {
./components/inputs/location-select/location-select.component.spec.ts:158:    fixture.componentRef.setInput("useDropdownButton", true);
~~~

### API request 6

Recorded at 2026-10-09T13:07:51.986Z, +14.85 s from session start. Context 27219 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":316,"cache_read_input_tokens":26901,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":316},"output_tokens":17,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 6: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "sed -n 140,190p components/inputs/location-select/location-select.component.spec.ts; grep -n \"dropdown\\|Dropdown\" components/inputs/location-select/location-select.component.stories.ts"
}
```

Output: 1691 UTF-8 bytes; 365 ms; tool-error=false; SHA256 `37f60dd71d0728fa386cf6a5e9c2cbed4e30f305e42b870f383a2d3d3d36da91`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/components/inputs/location-select/location-select.component.spec.ts`
- `components/inputs/location-select/location-select.component.stories.ts`

Output excerpt; full output in JSON tool 6:

~~~text
    const SelectLocationButtonDirective = getSelectLocationButtonDirective();
    const openLocationDialogSpy = vi.spyOn(
      SelectLocationButtonDirective,
      "openLocationDialog"
    );

    const button = await getButton();
    await button.click();

    expect(openLocationDialogSpy).toHaveBeenCalled();

    fixture.detectChanges();
    const input = getInput();
    expect(input.value).toBe(mockSelectedLocation.name);
  });

  it("should render dropdown icon button when enabled", async (
~~~

### API request 7

Recorded at 2026-10-09T13:08:01.401Z, +24.26 s from session start. Context 28039 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":820,"cache_read_input_tokens":27217,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":820},"output_tokens":747,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
## Summary

On the Admin → Registered Users tab, `app-location-select` shows an arrow icon button because the page passes `[useDropdownButton]="true"`. `LocationSelectComponent` already renders a text "Select" button by default (the `@else` branch). That default is what `AssessmentForm` uses. So the fix is to stop opting into the arrow, then widen the field.

## Evidence

- **Registered Users usage:** `main/screens/org-admin/registered-users/registered-users.component.html:6-14` sets `[useDropdownButton]="true"`. That is the only template usage of the flag. A repo-wide grep for `useDropdownButton` found only the template, the component, its html and its spec.
- **AssessmentForm usage:** `assessment-details-section.component.html:53` uses `<app-location-select class="location" formControlName="orgUnit" />` with no flag, so it gets the text button.
- **Button rendering:** `location-select.component.html:28-60`.
  - With the flag on, it renders `mat-icon-button` with an `expand_more` icon.
  - Otherwise it renders `mat-button` with `{{ buttonText() }}`.
  - `buttonText` defaults to the translation `shared.location_select.button_text` (`location-select.component.ts:~54`).
- **Width:** `registered-users.component.scss:28-33` fixes `.location-filter .mat-mdc-form-field` at `width: 252px`. A text button takes more room than an icon, so this probably needs to grow.
- **Field layout:** `location-select.component.scss` already sets `flex-wrap: nowrap` and `min-width: 0` on the infix, so a wider suffix shrinks the input rather than wrapping.
- **Spec:** `location-select.component.spec.ts:157-173` tests the dropdown-icon variant (`useDropdownButton` set to true, expects `expand_more`).

## Files

Each file's role:

- `main/screens/org-admin/registered-users/registered-users.component.html` (existing, must edit): remove `[useDropdownButton]="true"` so the default "Select" button renders.
- `main/screens/org-admin/registered-users/registered-users.component.scss` (existing, must edit): increase the 252px `.location-filter` width.
- `main/components/inputs/location-select/location-select.component.html` (existing, optional): the dropdown branch becomes unused on this page. Remove it only if the arrow variant is being deleted.
- `main/components/inputs/location-select/location-select.component.ts` (existing, optional): same, for the `useDropdownButton` input.
- `main/components/inputs/location-select/location-select.component.spec.ts` (existing, optional): the "dropdown icon" test must go if the variant is removed.

**Assumption:** the ticket only asks to change this page, so the arrow variant can stay as dead-but-harmless code. If the team wants it removed, the three optional files apply. I didn't check the translated "Select" text width, so the new width needs a visual check.

## Files
- main/screens/org-admin/registered-users/registered-users.component.html
- main/screens/org-admin/registered-users/registered-users.component.scss
- main/components/inputs/location-select/location-select.component.html
- main/components/inputs/location-select/location-select.component.ts
- main/components/inputs/location-select/location-select.component.spec.ts
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/16_1304_curated-ambicode-with-prompt-sonnet-5-5/traces/exports/9f0f7ff3-dcc3-4ae9-87a7-973bddc01271/investigate-files-request-need-touch/source.json): 2 artifact files.

Artifact checks (present/size/hash and ledger entry count): pass. Exact source → exported destination, byte count/hash and validation are in the attempt JSON.

Correct historical paths:

- `main/screens/org-admin/registered-users/registered-users.component.html`
- `main/screens/org-admin/registered-users/registered-users.component.scss`
- `main/components/inputs/location-select/location-select.component.html`
- `main/components/inputs/location-select/location-select.component.ts`
- `main/components/inputs/location-select/location-select.component.spec.ts`

Named non-truth paths:

None.

Final model answer:

~~~text
## Summary

On the Admin → Registered Users tab, `app-location-select` shows an arrow icon button because the page passes `[useDropdownButton]="true"`. `LocationSelectComponent` already renders a text "Select" button by default (the `@else` branch). That default is what `AssessmentForm` uses. So the fix is to stop opting into the arrow, then widen the field.

## Evidence

- **Registered Users usage:** `main/screens/org-admin/registered-users/registered-users.component.html:6-14` sets `[useDropdownButton]="true"`. That is the only template usage of the flag. A repo-wide grep for `useDropdownButton` found only the template, the component, its html and its spec.
- **AssessmentForm usage:** `assessment-details-section.component.html:53` uses `<app-location-select class="location" formControlName="orgUnit" />` with no flag, so it gets the text button.
- **Button rendering:** `location-select.component.html:28-60`.
  - With the flag on, it renders `mat-icon-button` with an `expand_more` icon.
  - Otherwise it renders `mat-button` with `{{ buttonText() }}`.
  - `buttonText` defaults to the translation `shared.location_select.button_text` (`location-select.component.ts:~54`).
- **Width:** `registered-users.component.scss:28-33` fixes `.location-filter .mat-mdc-form-field` at `width: 252px`. A text button takes more room than an icon, so this probably needs to grow.
- **Field layout:** `location-select.component.scss` already sets `flex-wrap: nowrap` and `min-width: 0` on the infix, so a wider suffix shrinks the input rather than wrapping.
- **Spec:** `location-select.component.spec.ts:157-173` tests the dropdown-icon variant (`useDropdownButton` set to true, expects `expand_more`).

## Files

Each file's role:

- `main/screens/org-admin/registered-users/registered-users.component.html` (existing, must edit): remove `[useDropdownButton]="true"` so the default "Select" button renders.
- `main/screens/org-admin/registered-users/registered-users.component.scss` (existing, must edit): increase the 252px `.location-filter` width.
- `main/components/inputs/location-select/location-select.component.html` (existing, optional): the dropdown branch becomes unused on this page. Remove it only if the arrow variant is being deleted.
- `main/components/inputs/location-select/location-select.component.ts` (existing, optional): same, for the `useDropdownButton` input.
- `main/components/inputs/location-select/location-select.component.spec.ts` (existing, optional): the "dropdown icon" test must go if the variant is removed.

**Assumption:** the ticket only asks to change this page, so the arrow variant can stay as dead-but-harmless code. If the team wants it removed, the three optional files apply. I didn't check the translated "Select" text width, so the new width needs a visual check.

## Files
- main/screens/org-admin/registered-users/registered-users.component.html
- main/screens/org-admin/registered-users/registered-users.component.scss
- main/components/inputs/location-select/location-select.component.html
- main/components/inputs/location-select/location-select.component.ts
- main/components/inputs/location-select/location-select.component.spec.ts
~~~


