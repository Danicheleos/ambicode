# fe-vs-5164-investigate: 17 R2 (e-Gjo5tL)

[Case comparison](../cases/17/fe-vs-5164-investigate.md) · [Complete data and tool outputs](e-Gjo5tL.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/17_1451_walk-ambicode-with-prompt-sonnet-5-5/traces/e-Gjo5tL.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.2015 + judge $0.0050 = total $0.2065. Harness turns 8, API requests 7, tool calls 7.

## Starting inputs

Prompt SHA256: `09e6e4a8af9560aa4161c1313900e88e671b1a041c3ea2e8be6eb8a108d9b91d`. Normalized delivered-step SHA256: `03330eedda5f64b7f3e14490b91761ce8fd133fce5e46af852d30f963a9dbeee`. Contract SHA256: `41521b1cb6e391b5089f71332cdeb878a433ecf87f385df4a23d9150719fb704`.

The exact prompt lives in the immutable eval result linked from the main report; the complete initial route delivery and contract text are in this attempt JSON.

```text
[ambicode] investigate · task investigate-files-request-need-touch · step read (5/5)
Now: Read the code the question is about, then answer it.
Then: answer the user; your answer is saved as the investigation note when you stop
Route: ground (done) · read (now)

Mode: headless (set by the user).

- The map lists leads, not answers: open those that fit.
- One `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" read --task investigate-files-request-need-touch <path[:a-b]>…` call for every file and span.
- Cite `path:line` for claims; mark assumptions.
- If the question's premise is not in the code, say so after a short search; answer from what exists.
- Files question: answer for the whole request as written. List each existing file implementing it edits (its types, schema, DTO, mocks, routes and tests included) and any file its requirements may need, naming that assumption. Skip files that only explain the code, files only your own extras need, and similar features the request does not name.
Diagnostics (reproduce, print a value) run only as `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" check --task investigate-files-request-need-touch <projectId>/<checkId> --only <spec> --phase red`, after the user is asked; decline means don't run — inconclusive.
Edit nothing.

## map
tuning: 3bd1fbc43250
Leads from the terms IndexedDB, US-ADV-ENG, concurrency-related, in-app, closing/refreshing, InexedDB, refreshes/closes; then UserId, ReportId, PersonIndex, WizardRedirectKey, WizardRedirects, WizardAutoLaunchService:
1. main/features/score-types/shared/services/wizard-auto-launch.service.ts:7 — contains "IndexedDB"
2. main/features/score-types/ge-adv/services/ge-adv-wizard-auto-launch.service.ts:4 — contains "WizardRedirects"
3. main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts:38 — contains "ReportId"
4. main/screens/report/report.component.ts:45 — contains "ReportId"
5. main/components/tables/report-table/report-table.component.ts:166 — contains "UserId"
6. main/features/amplitude/services/amplitude.service.ts:96 — contains "UserId"
7. main/services/auth.service.ts:222 — contains "UserId"
8. main/components/dialogs/AssessmentTypeDialog/AssessmentTypeDialog.component.ts:174 — contains "ReportId"
```

## Engine events in recorded order

The engine ledger and model trace use different clocks/events. Entries below retain timestamps; model calls follow in their own recorded order. No invented interleaving or internal model reasoning is assigned.

| # | UTC | Event | Input / output / state |
|---|---|---|---|
| 1 | 2026-10-09T14:54:01.756Z | route | {} |
| 2 | 2026-10-09T14:54:01.757Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 3 | 2026-10-09T14:54:01.757Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 4 | 2026-10-09T14:54:01.761Z | envelope | {} |
| 5 | 2026-10-09T14:54:03.761Z | map | {"bytes":5142} |
| 6 | 2026-10-09T14:54:03.789Z | policy | {"bytes":86} |
| 7 | 2026-10-09T14:54:03.812Z | policy | {"bytes":88} |
| 8 | 2026-10-09T14:54:03.812Z | step | {"step":"ground","actor":"code","status":"completed","ms":2055} |
| 9 | 2026-10-09T14:54:03.813Z | step | {"step":"scope","actor":"human","status":"skipped"} |
| 10 | 2026-10-09T14:54:03.814Z | step | {"step":"read","actor":"model","status":"delivered","bytes":2335,"budget":{"modelSteps":1,"modelStepsAllowed":6}} |
| 11 | 2026-10-09T14:54:37.611Z | turn | {} |
| 12 | 2026-10-09T14:54:37.612Z | hook | {"ms":43} |
| 13 | 2026-10-09T14:54:37.634Z | note | {"note":"investigation","path":".ambicode/task/investigate-files-request-need-touch/investigation_2026-10-09T16-54.md"} |
| 14 | 2026-10-09T14:54:37.665Z | exit | {"reason":"done","budget":{"modelSteps":1,"wallMs":35909},"complete":true,"unverified":0} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "19b72b6f-4",
    "at": "2026-10-09T14:54:01.761Z",
    "route": "19b72b6f-1",
    "kind": "envelope",
    "sources": [
      {
        "key": "ARGS",
        "title": "Investigate which files this request would need to touch. Read the relevant cod…",
        "relation": "args",
        "derivedFrom": null,
        "bytes": 3778
      }
    ],
    "builtFrom": "args",
    "asked": [],
    "missingAsked": [],
    "hash": "sha256:e4f82d2488be84ad26e72a865197da52"
  },
  {
    "id": "19b72b6f-5",
    "at": "2026-10-09T14:54:03.761Z",
    "route": "19b72b6f-1",
    "kind": "map",
    "mode": "prompt",
    "layers": [
      {
        "name": "shortlist",
        "ms": 956,
        "hits": 1
      },
      {
        "name": "harvest",
        "ms": 2,
        "hits": 16
      },
      {
        "name": "shortlist",
        "ms": 670,
        "hits": 20
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
      "pass2": [
        "IndexedDB",
        "US-ADV-ENG",
        "concurrency-related",
        "in-app",
        "closing/refreshing",
        "InexedDB",
        "UserId",
        "ReportId",
        "PersonIndex",
        "WizardRedirectKey",
        "WizardRedirects",
        "WizardAutoLaunchService"
      ]
    },
    "candidates": 20,
    "limitations": [
      "No file's path or contents matched \"US-ADV-ENG\".",
      "No file's path or contents matched \"concurrency-related\".",
      "No file's path or contents matched \"in-app\".",
      "No file's path or contents matched \"closing/refreshing\".",
      "No file's path or contents matched \"InexedDB\".",
      "No file's path or contents matched \"refreshes/closes\".",
      "Co-change contributed nothing: 1 commit(s) in this repository touch the files the terms matched.",
      "1 matching file(s) are not listed: they fall outside projects[].shortlist in .ambicode/config.yaml (tests, styles, markup and data by default).",
      "99 matching file(s) are not listed: they fall outside projects[].shortlist in .ambicode/config.yaml (tests, styles, markup and data by default).",
      "108 further candidate(s) scored but are not listed; raise --limit to see them."
    ],
    "index": "none",
    "collisions": [],
    "bytes": 5142,
    "serialized": 20,
    "candidatePaths": [
      "main/features/score-types/shared/services/wizard-auto-launch.service.ts",
      "main/features/score-types/ge-adv/services/ge-adv-wizard-auto-launch.service.ts",
      "main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts",
      "main/screens/report/report.component.ts",
      "main/components/tables/report-table/report-table.component.ts",
      "main/features/amplitude/services/amplitude.service.ts",
      "main/services/auth.service.ts",
      "main/components/dialogs/AssessmentTypeDialog/AssessmentTypeDialog.component.ts",
      "main/features/ai-custom-solutions/components/ai-solutions-chatkit/ai-solutions-chatkit.component.ts",
      "main/features/ai-custom-solutions/state/ai-solutions.facade.ts",
      "main/features/score-types/composite-rank/components/score-card/composite-rank-score-card.component.ts",
      "main/features/score-types/composite-rank/state/composite-rank.facade.ts",
      "main/features/score-types/est/components/score-card/est-score-card.component.ts",
      "main/features/score-types/est/components/wizard/est-wizard.component.ts",
      "main/features/score-types/est/services/est-data.service.ts",
      "main/features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.ts",
      "main/features/score-types/ge-adv/state/ge-adv.facade.ts",
      "main/features/score-types/hal/components/hal-score-detail/hal-score-detail.component.ts",
      "main/features/score-types/hal/models/hal-inputs.model.ts",
      "main/features/score-types/lm-carry/components/lm-carry-score-card/lm-carry-score-card.component.ts"
    ],
    "tuning": {
      "hash": "3bd1fbc43250",
      "overrides": []
    },
    "profile": null,
    "decisions": {
      "sequenceFiles": 0,
      "pass2Downweighted": 0,
      "harvestFiles": 1,
      "feature": null,
      "proseRetry": false
    },
    "delivered": {
      "leads": [
        "main/features/score-types/shared/services/wizard-auto-launch.service.ts",
        "main/features/score-types/ge-adv/services/ge-adv-wizard-auto-launch.service.ts",
        "main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts",
        "main/screens/report/report.component.ts",
        "main/components/tables/report-table/report-table.component.ts",
        "main/features/amplitude/services/amplitude.service.ts",
        "main/services/auth.service.ts",
        "main/components/dialogs/AssessmentTypeDialog/AssessmentTypeDialog.component.ts"
      ],
      "feature": [],
      "bytes": 975,
      "hash": "518ae3d2bac3"
    }
  },
  {
    "id": "19b72b6f-6",
    "at": "2026-10-09T14:54:03.789Z",
    "route": "19b72b6f-1",
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
    "id": "19b72b6f-7",
    "at": "2026-10-09T14:54:03.812Z",
    "route": "19b72b6f-1",
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

Recorded at 2026-10-09T14:54:05.666Z, +4.22 s from session start. Context 19494 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":12216,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":12216},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 1: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd repo && ls && git ls-files | grep -i -E \"ge-adv|wizard|score-types/shared\" | head -100"
}
```

Output: 9154 UTF-8 bytes; 2295 ms; tool-error=false; SHA256 `60bc581df3d0aef5749824ba821fa11969139ee1635c5d031221878d78cf310c`.

Paths mentioned in output (a mention is not a source-body read):

- `main/assets/illustrations/ge-adv/ge-adv_back_flexion-extension_ext-gt-15deg.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_flexion-extension_flex-gt-30deg.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_flexion-extension_flex-gt-60deg.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_flexion-extension_neutral.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_force_carry.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_force_lift-lower.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_force_pull.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_force_push.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_side-bending_neutral.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_side-bending_sidebend-gt-20deg.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_side-bending_sidebend-gt-30deg.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_twisting_neutral.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_twisting_twist-gt-20deg.svg`
- `main/assets/illustrations/ge-adv/ge-adv_back_twisting_twist-gt-30deg.svg`
- `main/assets/illustrations/ge-adv/ge-adv_elbows_contact-stress_elbow-or-forearm-on-hard-surface_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_elbows_flexion-extension_ext-lt-60deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_elbows_flexion-extension_flex-gt-100deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_elbows_flexion-extension_neutral_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_elbows_force_forearm-twisting-torque_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_elbows_force_grip-hold_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_elbows_force_hammering_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_elbows_supination-pronation_neutral_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_elbows_supination-pronation_pro-gt-45deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_elbows_supination-pronation_sup-gt-45deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_fingers_force_pinch_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_fingers_force_thumb-or-finger-press_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_fingers_posture_finger-flexion_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_fingers_posture_thumb-extension-or-adduction_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_fingers_posture_thumb-flexion-or-opposition_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_fingers_posture_trigger-finger-or-flexion_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_hands-wrists_flexion-extension_ext-gt-30deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_hands-wrists_flexion-extension_flex-gt-30deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_hands-wrists_flexion-extension_neutral_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_hands-wrists_force_grip-grasp_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_hands-wrists_radial-ulnar_neutral_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_hands-wrists_radial-ulnar_radial-gt-20deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_hands-wrists_radial-ulnar_ulnar-gt-20deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_legs_force_foot-pedal.svg`
- `main/assets/illustrations/ge-adv/ge-adv_legs_force_squat-lift.svg`
- `main/assets/illustrations/ge-adv/ge-adv_legs_posture_climb.svg`
- `main/assets/illustrations/ge-adv/ge-adv_legs_posture_crawl.svg`
- `main/assets/illustrations/ge-adv/ge-adv_legs_posture_kneel.svg`
- `main/assets/illustrations/ge-adv/ge-adv_legs_posture_squat-crouch.svg`
- `main/assets/illustrations/ge-adv/ge-adv_neck_flexion-extension_ext-gt-15deg.svg`
- `main/assets/illustrations/ge-adv/ge-adv_neck_flexion-extension_flex-gt-30deg.svg`
- `main/assets/illustrations/ge-adv/ge-adv_neck_flexion-extension_neutral.svg`
- `main/assets/illustrations/ge-adv/ge-adv_neck_force_lifting-overhead.svg`
- `main/assets/illustrations/ge-adv/ge-adv_neck_force_ppe.svg`
- `main/assets/illustrations/ge-adv/ge-adv_neck_side-bending_neutral.svg`
- `main/assets/illustrations/ge-adv/ge-adv_neck_side-bending_sidebend-gt-20deg.svg`
- `main/assets/illustrations/ge-adv/ge-adv_neck_twisting_neutral.svg`
- `main/assets/illustrations/ge-adv/ge-adv_neck_twisting_twist-gt-20deg.svg`
- `main/assets/illustrations/ge-adv/ge-adv_shoulders_abduction-adduction_abd-gt-30deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_shoulders_abduction-adduction_add-gt-30deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_shoulders_abduction-adduction_neutral_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_shoulders_flexion-extension_ext-gt-30deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_shoulders_flexion-extension_flex-gt-30deg_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_shoulders_flexion-extension_neutral_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_shoulders_flexion-extension_overhead-reach_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_shoulders_force_hold_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_shoulders_force_lift-lower_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_shoulders_force_pull_left.svg`
- `main/assets/illustrations/ge-adv/ge-adv_shoulders_force_push_left.svg`
- `main/assets/screenshots/REBAwizard.png`
- `main/components/ui/wizard-dialog-wrapper/wizard-dialog-wrapper.component.html`
- `main/components/ui/wizard-dialog-wrapper/wizard-dialog-wrapper.component.scss`
- `main/components/ui/wizard-dialog-wrapper/wizard-dialog-wrapper.component.ts`
- `main/features/score-types/composite-rank/components/wizard/composite-rank-wizard.component.html`
- `main/features/score-types/composite-rank/components/wizard/composite-rank-wizard.component.scss`
- `main/features/score-types/composite-rank/components/wizard/composite-rank-wizard.component.ts`
- `main/features/score-types/est/components/wizard/directives/cancel-button/est-cancel-button.directive.ts`
- `main/features/score-types/est/components/wizard/est-wizard.component.html`
- `main/features/score-types/est/components/wizard/est-wizard.component.scss`
- `main/features/score-types/est/components/wizard/est-wizard.component.spec.ts`
- `main/features/score-types/est/components/wizard/est-wizard.component.stories.ts`
- `main/features/score-types/est/components/wizard/est-wizard.component.ts`
- `main/features/score-types/est/components/wizard/est-wizard.shared.scss`
- `main/features/score-types/est/components/wizard/general-data/demographics/est-demographics.component.html`
- `main/features/score-types/est/components/wizard/general-data/demographics/est-demographics.component.scss`
- `main/features/score-types/est/components/wizard/general-data/demographics/est-demographics.component.stories.ts`
- `main/features/score-types/est/components/wizard/general-data/demographics/est-demographics.component.ts`
- `main/features/score-types/est/components/wizard/general-data/demographics/mocks/stub-est-demographics-dto.ts`
- `main/features/score-types/est/components/wizard/general-data/demographics/mocks/stub-est-demographics-form-data.ts`
- `main/features/score-types/est/components/wizard/general-data/demographics/mocks/stub-location.ts`
- `main/features/score-types/est/components/wizard/general-data/est-general-data.component.html`
- `main/features/score-types/est/components/wizard/general-data/est-general-data.component.scss`
- `main/features/score-types/est/components/wizard/general-data/est-general-data.component.stories.ts`
- `main/features/score-types/est/components/wizard/general-data/est-general-data.component.ts`
- `main/features/score-types/est/components/wizard/general-data/job-info/est-job-info.component.html`
- `main/features/score-types/est/components/wizard/general-data/job-info/est-job-info.component.scss`
- `main/features/score-types/est/components/wizard/general-data/job-info/est-job-info.component.stories.ts`
- `main/features/score-types/est/components/wizard/general-data/job-info/est-job-info.component.ts`
- `main/features/score-types/est/components/wizard/general-data/job-info/mocks/stub-est-job-form-data.ts`
- `main/features/score-types/est/components/wizard/general-data/job-info/mocks/stub-est-job-info-dto.ts`
- `main/features/score-types/est/components/wizard/general-data/job-info/percentage-field.error-state-matcher.ts`
- `main/features/score-types/est/components/wizard/general-data/mocks/stub-est-general-data-dto.ts`
- `main/features/score-types/est/components/wizard/general-data/mocks/stub-est-general-form-data.ts`
- `main/features/score-types/est/components/wizard/general-data/operator-info/est-operator-info.component.html`
- `main/features/score-types/est/components/wizard/general-data/operator-info/est-operator-info.component.scss`
- `main/features/score-types/est/components/wizard/general-data/operator-info/est-operator-info.component.stories.ts`

Output excerpt; full output in JSON tool 1:

~~~text
CODE_GUIDELINE.md
FF_GUIDELINE.md
LICENSE.md
README.md
_config.yml
angular.json
ci
custom-webpack.config.ts
eslint.config.mts
main
package-lock.json
package.json
patches
renovate.json
scripts
tsconfig.json
tsconfig.spec.json
vitest.config.ts
git: error: couldn't create cache file '/var/folders/nx/xb7v_m614s50z6c43bmbj5j40000gp/T/xcrun_db-FJ5KOuIV' (errno=Operation not permitted)
2026-10-09 16:54:06.244 xcodebuild[57265:16216730]  DVTFilePathFSEvents: Failed to start fs event stream.
git: error: 
~~~

### API request 2

Recorded at 2026-10-09T14:54:09.655Z, +8.21 s from session start. Context 24014 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":4520,"cache_read_input_tokens":19492,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":4520},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 2.

#### Tool 2: Bash (cat)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-Gjo5tL/home/cwd/repo/main/features/score-types && ls ge-adv ge-adv/* shared shared/services | head -80; wc -l ge-adv/components/wizard/ge-adv-wizard.component.ts"
}
```

Output: 1356 UTF-8 bytes; 225 ms; tool-error=false; SHA256 `33dd6b8579b3407dd9f98971b094a1611ce6c4624ccbb75a7a7c84b5306cc746`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`

Paths mentioned in output (a mention is not a source-body read):

- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`

Output excerpt; full output in JSON tool 2:

~~~text
ge-adv:
components
constants
directives
mocks
models
pipes
providers
services
state

ge-adv/components:
score-card
vlm-status
wizard

ge-adv/constants:
ge-adv-rounding.constants.ts
ge-adv-routing.constants.ts
ge-adv-thresholds.constants.ts
ge-adv-validation.constants.ts

ge-adv/directives:
cancel-button
expandable-content

ge-adv/mocks:
ge-adv-back.mocks.ts
ge-adv-elbows.mocks.ts
ge-adv-fingers.mocks.ts
ge-adv-form-service.mocks.ts
ge-adv-general-data.mocks.ts
ge-adv-hands-wrists.mocks.ts
ge-adv
~~~

#### Tool 3: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-Gjo5tL/home/cwd/repo && grep -rIl -i -E \"indexeddb|beforeunload|canDeactivate|idb\" main --include=*.ts --include=package.json . 2>/dev/null | grep -v node_modules | head -20"
}
```

Output: 42 UTF-8 bytes; 164 ms; tool-error=false; SHA256 `8324441ecbddb5042c1f73d54cdadb7746defb638a7c50ca181beee42a1d0dfb`.

Output excerpt; full output in JSON tool 3:

~~~text
(eval):1: no matches found: --include=*.ts
~~~

### API request 3

Recorded at 2026-10-09T14:54:12.258Z, +10.81 s from session start. Context 25136 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1122,"cache_read_input_tokens":24012,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1122},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 4: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cat main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts; grep -rIl -i -E \"indexeddb|beforeunload|canDeactivate|\\bidb\\b|dexie\" main package.json; ls main/features/score-types/ge-adv/directives/cancel-button main/features/score-types/ge-adv/components/wizard main/features/score-types/shared/*"
}
```

Output: 11189 UTF-8 bytes; 2951 ms; tool-error=false; SHA256 `21e5f7b7613a191bf16c0bb03b131ff8d7069c3fd91fed80ef231a989ef5e820`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`

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
- `main/features/score-types/shared/services/wizard-auto-launch.service.ts`
- `main/screens/login/login.component.spec.ts`
- `main/guards/auth.guard.spec.ts`

Output excerpt; full output in JSON tool 4:

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

### API request 4

Recorded at 2026-10-09T14:54:17.936Z, +16.49 s from session start. Context 30104 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":4968,"cache_read_input_tokens":25134,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":4968},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 5: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd main/features/score-types && cat shared/services/wizard-auto-launch.service.ts ge-adv/directives/cancel-button/*.ts shared/directives/cancel-button.directive.ts ge-adv/services/ge-adv-wizard-auto-launch.service.ts; grep -n -i \"hasUserInput\\|userInput\" -r ge-adv --include=*.ts | head; cat ge-adv/state/ge-adv.facade.ts | head -80; grep -n \"idb\\|dexie\\|localforage\" /private/tmp/e-Gjo5tL/home/cwd/repo/package.json; grep -rn \"wizard\\|ge-adv\" /private/tmp/e-Gjo5tL/home/cwd/repo/main/app.routes.ts /private/tmp/e-Gjo5tL/home/cwd/repo/main/features/score-types/ge-adv/constants/ge-adv-routing.constants.ts | head"
}
```

Output: 10823 UTF-8 bytes; 199 ms; tool-error=false; SHA256 `660a8e52d8d36231b2838829fd64735c3388b1063339b759769ceece8388ef36`.

Inferred requested paths (operands, not proof all bodies were returned):

- `shared/services/wizard-auto-launch.service.ts`
- `shared/directives/cancel-button.directive.ts`
- `ge-adv/services/ge-adv-wizard-auto-launch.service.ts`
- `ge-adv/state/ge-adv.facade.ts`
- `package.json`
- `main/app.routes.ts`
- `main/features/score-types/ge-adv/constants/ge-adv-routing.constants.ts`

Paths mentioned in output (a mention is not a source-body read):

- `state/user.facade`
- `features/score-types/shared/directives/cancel-button.directive`
- `components/dialogs/ConfirmationDialog/ConfirmationDialog.component`
- `features/score-types/shared/services/wizard-auto-launch.service`
- `state/org.facade`
- `../state/ge-adv.facade`
- `features/vlm/models/vlm-data.model`
- `features/vlm/state/vlm.facade`
- `state/report.facade`
- `state/scoring.facade`
- `../models/dto/ge-adv-back.dto`
- `../models/dto/ge-adv-elbows.dto`
- `../models/dto/ge-adv-fingers.dto`
- `../models/dto/ge-adv-general-data.dto`
- `../models/dto/ge-adv-hands-wrists.dto`
- `../models/dto/ge-adv-legs.dto`
- `../models/dto/ge-adv-neck.dto`
- `../models/dto/ge-adv-results.dto`
- `../models/dto/ge-adv-shoulders.dto`
- `../models/dto/ge-adv.dto`
- `../models/mappers/shared/ai-string-boolean.mapper`
- `../services/ge-adv-api.service`
- `main/app.routes.ts`
- `main/features/score-types/ge-adv/constants/ge-adv-routing.constants.ts`

Output excerpt; full output in JSON tool 5:

~~~text
import { inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import localforage from "localforage";

import { UserFacade } from "state/user.facade";

export type UserId = string;
export type ReportId = string;
export type PersonIndex = number;
export type WizardRedirectKey = `${UserId}/${ReportId}/${PersonIndex}`;
export type WizardRedirects = Record<WizardRedirectKey, boolean>;

/**
 * Keeps track of dismissed wizard auto-launch redirects per user/report/person
~~~

### API request 5

Recorded at 2026-10-09T14:54:19.556Z, +18.11 s from session start. Context 35257 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":5153,"cache_read_input_tokens":30102,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":5153},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 6: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-Gjo5tL/home/cwd/repo/main && grep -rn \"GE_ADV_WIZARD_URL_SEGMENT\\|GeAdvWizardComponent\" --include=*.ts . | grep -v \"wizard.component.ts:\" | head; ls guards; grep -n \"static\\|isProcessed\" -A4 features/score-types/ge-adv/models/dto/ge-adv.dto.ts | head -60; grep -n \"public\\|reset\\|valueChanges\" features/score-types/ge-adv/services/ge-adv-form.service.ts | head -30; cat features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.html | head -40; ls features/score-types/shared/services/ features/score-types/est/components/wizard | head -30"
}
```

Output: 5005 UTF-8 bytes; 185 ms; tool-error=false; SHA256 `39fc42b2e37e855d33495f38c96f373852f75dff9d2a5f3b990d961118a893c1`.

Inferred requested paths (operands, not proof all bodies were returned):

- `features/score-types/ge-adv/models/dto/ge-adv.dto.ts`
- `features/score-types/ge-adv/services/ge-adv-form.service.ts`
- `features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.html`

Output excerpt; full output in JSON tool 6:

~~~text
(eval):1: no matches found: --include=*.ts
auth.guard.spec.ts
auth.guard.ts
cority.guard.ts
okta-auth.guard.ts
61:  export const isProcessed = (dto: GeAdvDto): dto is Processed => {
62-    return isSubmitted(dto) && "results" in dto;
63-  };
64-
65-  export const getGeneralDataDto = (dto: GeAdvDto): GeAdvGeneralDataDto => {
--
77:      ...(isProcessed(dto) && {
78-        bodyPartScore: GeAdvResultsDto.getBodyPartScore(
79-          dto.results,
80-          GeAdvBodyPartKey.Legs
81-        ),
-
~~~

### API request 6

Recorded at 2026-10-09T14:54:23.082Z, +21.64 s from session start. Context 38151 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":2894,"cache_read_input_tokens":35255,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2894},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 7: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "sed -n 1,64p features/score-types/ge-adv/models/dto/ge-adv.dto.ts; grep -rn \"GE_ADV_WIZARD_URL_SEGMENT\" . | head; grep -rln \"GeAdvWizardComponent\" . | head; ls features/score-types/ge-adv/models/mappers; ls features/score-types/ge-adv/components/wizard/*.spec.ts 2>&1 | head -2"
}
```

Output: 3943 UTF-8 bytes; 1824 ms; tool-error=false; SHA256 `288b6d3187bde2f8610c19303e75706352290a7533ab0dc0dcdf52d88c9634e1`.

Inferred requested paths (operands, not proof all bodies were returned):

- `features/score-types/ge-adv/models/dto/ge-adv.dto.ts`

Paths mentioned in output (a mention is not a source-body read):

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
- `features/score-types/ge-adv/constants/ge-adv-routing.constants.ts`
- `features/score-types/ge-adv/components/score-card/detail/shared/edit-button/ge-adv-edit-button.component.html`
- `features/score-types/ge-adv/components/score-card/detail/shared/edit-button/ge-adv-edit-button.component.ts`
- `../../../../../constants/ge-adv-routing.constants`
- `features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.ts`
- `../../constants/ge-adv-routing.constants`
- `screens/app/constants/site-map.ts`
- `features/score-types/ge-adv/constants/ge-adv-routing.constants`
- `screens/report/report-routing.module.ts`
- `features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.stories.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`

Output excerpt; full output in JSON tool 7:

~~~text
import { GeAdvBodyPartKey } from "../shared/ge-adv-body-parts";
import type { GeAdvBackDto } from "./ge-adv-back.dto";
import { GeAdvContributionsDto } from "./ge-adv-contributions.dto";
import type { GeAdvElbowsDto } from "./ge-adv-elbows.dto";
import type { GeAdvFingersDto } from "./ge-adv-fingers.dto";
import type { GeAdvGeneralDataDto } from "./ge-adv-general-data.dto";
import type { GeAdvHandsWristsDto } from "./ge-adv-hands-wrists.dto";
import type { GeAdvLegsDto } from "./ge-adv-legs.dto"
~~~

### API request 7

Recorded at 2026-10-09T14:54:31.354Z, +29.91 s from session start. Context 40372 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":2221,"cache_read_input_tokens":38149,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2221},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
The ticket touches the GE ADV wizard component, the shared wizard services, the GE ADV auto-launch subclass, and the cancel button. The generic backup logic goes in new shared files. I read these files and grepped the tree; I did not run anything.

## Findings

**What exists today**
- The wizard component (`main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`) already has the hooks the ticket needs.
  - **Populate on load.** `onDataAvailable_populateForm` takes the first non-null `geAdvData$` and calls `formGroup.reset(GeAdvMapper.mapDtoToFormData(dto))` (lines ~170-176). The backup fallback belongs here.
  - **Submit.** `onSubmit` runs `processGeAdvScore$` and then `geAdvWizardAutoLaunchService.forget(...)` (lines ~185-200). This is where the backup should be deleted after success.
  - **Cancel.** `onCancel` calls `stopRedirecting` and then navigates away (lines ~203-212). The final backup write goes here.
  - **Inputs and providers.** `reportId` and `personIndex` are inputs, and `GeAdvFormService` is component-provided, so the form lives on the component.
- Server data has no "user inputs present" check, but the DTO supports one. `GeAdvDto.isSubmitted` is `"user" in dto` (`ge-adv/models/dto/ge-adv.dto.ts:~57`). The "server user inputs present → use server data, else use backup" rule can use that.
- The app already stores things in IndexedDB through `localforage` (`package.json:74`; `shared/services/wizard-auto-launch.service.ts`).
  - That service keys entries as `userId/reportId/personIndex` and has `getItem`, `setItem` and `forget` patterns.
  - It also holds the auto-launch dismissal state, so the backup's key scheme and cleanup can mirror it.
- `CancelButtonDirective` (`shared/directives/cancel-button.directive.ts`) opens the confirm dialog and emits `cancelConfirmed`. It is already shared across wizards, so it probably needs no change.
- Routing: `main/screens/report/report-routing.module.ts:55` declares the `ge-adv` wizard route. This is where a `canDeactivate` guard for in-app navigation would be attached. That is not strictly required, because the component could handle it in `ngOnDestroy`.

**What does not exist**
- A grep for `beforeunload`, `canDeactivate`, `dexie` and `idb` under `main` found nothing relevant.
- There is no debounce or autosave logic and no form-backup service anywhere in the code.

## Assumptions
- I assume the backup reuses `localforage`, which is already a dependency, so there is no new package.
- I assume the generic logic is a new shared service under `score-types/shared/services/`, with a thin GE ADV subclass. This follows the existing `WizardAutoLaunchService` and `GeAdvWizardAutoLaunchService` pattern.
- The browser-prompt behaviour (`beforeunload` with pending changes) may be implemented as a shared directive or a function inside the new service. I could not tell which from the code.
- A dirty-state flag is needed. I did not check whether `GeAdvFormService` already exposes one (`ge-adv-form.service.ts` exposes `formGroup`).
- Which of the optional files below get touched depends on how the new code is laid out.

## Files

Existing files to edit:
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts` — add backup restore, debounced save, final save on cancel and destroy, `beforeunload` handling, and backup removal after submit.
- `main/features/score-types/ge-adv/services/ge-adv-form.service.ts` — optional; it could expose a dirty-state or value stream for the backup.
- `main/features/score-types/ge-adv/mocks/ge-adv-form-service.mocks.ts` — optional; update the mock if the form service API changes.
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.stories.ts` — optional; provide the new backup service in the stories.
- `main/screens/report/report-routing.module.ts` — optional; only if a `canDeactivate` guard is used for in-app navigation.

Proposed new files:
- `main/features/score-types/shared/services/wizard-backup.service.ts` — generic abstract service: key by user/report/person, with save, load, remove and debounce.
- `main/features/score-types/shared/services/wizard-backup.service.spec.ts` — unit tests for the shared service.
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts` — GE ADV subclass that supplies the storage key and the form-data type.
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.spec.ts` — tests for the GE ADV subclass.
- `main/features/score-types/shared/directives/unsaved-changes.directive.ts` — optional; generic `beforeunload` handling.

Deletions: none.
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/17_1451_walk-ambicode-with-prompt-sonnet-5-5/traces/exports/b8bc9716-03df-4d65-9a01-a7ab547c2b6a/investigate-files-request-need-touch/source.json): 2 artifact files.

Artifact checks (present/size/hash and ledger entry count): pass. Exact source → exported destination, byte count/hash and validation are in the attempt JSON.

Correct historical paths:

- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`

Named non-truth paths:

- `main/features/score-types/ge-adv/services/ge-adv-form.service.ts`
- `main/features/score-types/ge-adv/mocks/ge-adv-form-service.mocks.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.stories.ts`
- `main/screens/report/report-routing.module.ts`
- `main/features/score-types/shared/services/wizard-backup.service.ts`
- `main/features/score-types/shared/services/wizard-backup.service.spec.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.spec.ts`
- `main/features/score-types/shared/directives/unsaved-changes.directive.ts`

Final model answer:

~~~text
The ticket touches the GE ADV wizard component, the shared wizard services, the GE ADV auto-launch subclass, and the cancel button. The generic backup logic goes in new shared files. I read these files and grepped the tree; I did not run anything.

## Findings

**What exists today**
- The wizard component (`main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`) already has the hooks the ticket needs.
  - **Populate on load.** `onDataAvailable_populateForm` takes the first non-null `geAdvData$` and calls `formGroup.reset(GeAdvMapper.mapDtoToFormData(dto))` (lines ~170-176). The backup fallback belongs here.
  - **Submit.** `onSubmit` runs `processGeAdvScore$` and then `geAdvWizardAutoLaunchService.forget(...)` (lines ~185-200). This is where the backup should be deleted after success.
  - **Cancel.** `onCancel` calls `stopRedirecting` and then navigates away (lines ~203-212). The final backup write goes here.
  - **Inputs and providers.** `reportId` and `personIndex` are inputs, and `GeAdvFormService` is component-provided, so the form lives on the component.
- Server data has no "user inputs present" check, but the DTO supports one. `GeAdvDto.isSubmitted` is `"user" in dto` (`ge-adv/models/dto/ge-adv.dto.ts:~57`). The "server user inputs present → use server data, else use backup" rule can use that.
- The app already stores things in IndexedDB through `localforage` (`package.json:74`; `shared/services/wizard-auto-launch.service.ts`).
  - That service keys entries as `userId/reportId/personIndex` and has `getItem`, `setItem` and `forget` patterns.
  - It also holds the auto-launch dismissal state, so the backup's key scheme and cleanup can mirror it.
- `CancelButtonDirective` (`shared/directives/cancel-button.directive.ts`) opens the confirm dialog and emits `cancelConfirmed`. It is already shared across wizards, so it probably needs no change.
- Routing: `main/screens/report/report-routing.module.ts:55` declares the `ge-adv` wizard route. This is where a `canDeactivate` guard for in-app navigation would be attached. That is not strictly required, because the component could handle it in `ngOnDestroy`.

**What does not exist**
- A grep for `beforeunload`, `canDeactivate`, `dexie` and `idb` under `main` found nothing relevant.
- There is no debounce or autosave logic and no form-backup service anywhere in the code.

## Assumptions
- I assume the backup reuses `localforage`, which is already a dependency, so there is no new package.
- I assume the generic logic is a new shared service under `score-types/shared/services/`, with a thin GE ADV subclass. This follows the existing `WizardAutoLaunchService` and `GeAdvWizardAutoLaunchService` pattern.
- The browser-prompt behaviour (`beforeunload` with pending changes) may be implemented as a shared directive or a function inside the new service. I could not tell which from the code.
- A dirty-state flag is needed. I did not check whether `GeAdvFormService` already exposes one (`ge-adv-form.service.ts` exposes `formGroup`).
- Which of the optional files below get touched depends on how the new code is laid out.

## Files

Existing files to edit:
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts` — add backup restore, debounced save, final save on cancel and destroy, `beforeunload` handling, and backup removal after submit.
- `main/features/score-types/ge-adv/services/ge-adv-form.service.ts` — optional; it could expose a dirty-state or value stream for the backup.
- `main/features/score-types/ge-adv/mocks/ge-adv-form-service.mocks.ts` — optional; update the mock if the form service API changes.
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.stories.ts` — optional; provide the new backup service in the stories.
- `main/screens/report/report-routing.module.ts` — optional; only if a `canDeactivate` guard is used for in-app navigation.

Proposed new files:
- `main/features/score-types/shared/services/wizard-backup.service.ts` — generic abstract service: key by user/report/person, with save, load, remove and debounce.
- `main/features/score-types/shared/services/wizard-backup.service.spec.ts` — unit tests for the shared service.
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.ts` — GE ADV subclass that supplies the storage key and the form-data type.
- `main/features/score-types/ge-adv/services/ge-adv-wizard-backup.service.spec.ts` — tests for the GE ADV subclass.
- `main/features/score-types/shared/directives/unsaved-changes.directive.ts` — optional; generic `beforeunload` handling.

Deletions: none.
~~~


