# fe-vs-5967-investigate: notation R1 (e-Bj9KZ3)

[Case comparison](../cases/notation/fe-vs-5967-investigate.md) · [Complete data and tool outputs](e-Bj9KZ3.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/15_1241_curated-ambicode-with-prompt-sonnet-5-5/traces/e-Bj9KZ3.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.2854 + judge $0 = total $0.2854. Harness turns 10, API requests 9, tool calls 9.

## Starting inputs

Prompt SHA256: `8a71272a07bfe04445856c28101f44705d3839a9a3a304c9530afceb31f1869a`. Normalized delivered-step SHA256: `5b49fa20537d854a55905dc136316958be12490609767f674c7b4b9e8692eee9`. Contract SHA256: `edc68aaa9243b44ec0f5da41d77f8612643562db8efcd533ec8d73870b25b73e`.

The exact prompt lives in the immutable eval result linked from the main report; the complete initial route delivery and contract text are in this attempt JSON.

```text
[ambicode] investigate · task ENG-24 · step read (5/5)
Now: Read the code the question is about -> answer it.
Then: answer the user; your answer is saved as the investigation note when you stop
Route: ground✓ [read]

Mode: headless (set by the user).

- @map lists leads, not answers: open those that fit.
- one `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" read --task ENG-24 <path[:a-b]>…` call with every file and span.
- claim => cite `path:line` · assumption => mark it.
- premise not in the code => say so after a short search; answer from what exists.
- files question => answer the whole request as written: each existing file implementing it edits (its types, schema, DTO, mocks, routes and tests) + any file its requirements may need, naming that assumption. !files that only explain the code · !files only your own extras need · !similar features the request does not name.
Diagnostics (reproduce, print a value) => only `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" check --task ENG-24 <projectId>/<checkId> --only <spec> --phase red`, after ?the user · declined => !run; inconclusive.
!edit anything.

## map
tuning: 3bd1fbc43250
Leads from the terms nom, NOM-specific (+7 more):
1. main/router/route-reuse-strategies/explicit-query-params-reactivate.strategy.ts:1 — sits under a directory matching "route"
2. main/features/score-types/nom/components/score-card/components/carry/nom-carry-detail.component.ts:34 — sits under one of 3 broad directories matching "nom"
3. main/features/score-types/nom/components/score-card/nom-score-card.component.ts:13 — sits under one of 3 broad directories matching "nom"
4. main/screens/analytics/analytics-router.module.ts:3 — filename matched "route"
5. main/features/score-types/nom/components/score-card/components/lift/nom-lift-detail.component.ts:10 — sits under one of 3 broad directories matching "nom"
6. main/features/score-types/nom/components/score-card/components/push-pull/nom-push-pull-detail.component.ts:10 — sits under one of 3 broad directories matching "nom"
7. main/features/score-types/nom/components/score-card/components/team/nom-team-detail.component.ts:10 — sits under one of 3 broad directories matching "nom"
8. main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts:18
```

## Engine events in recorded order

The engine ledger and model trace use different clocks/events. Entries below retain timestamps; model calls follow in their own recorded order. No invented interleaving or internal model reasoning is assigned.

| # | UTC | Event | Input / output / state |
|---|---|---|---|
| 1 | 2026-10-09T12:49:01.131Z | route | {} |
| 2 | 2026-10-09T12:49:01.132Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 3 | 2026-10-09T12:49:01.133Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 4 | 2026-10-09T12:49:01.137Z | envelope | {} |
| 5 | 2026-10-09T12:49:02.811Z | map | {"bytes":5834} |
| 6 | 2026-10-09T12:49:02.841Z | policy | {"bytes":86} |
| 7 | 2026-10-09T12:49:02.868Z | policy | {"bytes":88} |
| 8 | 2026-10-09T12:49:02.869Z | step | {"step":"ground","actor":"code","status":"completed","ms":1736} |
| 9 | 2026-10-09T12:49:02.869Z | step | {"step":"scope","actor":"human","status":"skipped"} |
| 10 | 2026-10-09T12:49:02.870Z | step | {"step":"read","actor":"model","status":"delivered","bytes":2362,"budget":{"modelSteps":1,"modelStepsAllowed":6}} |
| 11 | 2026-10-09T12:49:46.136Z | turn | {} |
| 12 | 2026-10-09T12:49:46.137Z | hook | {"ms":105} |
| 13 | 2026-10-09T12:49:46.158Z | note | {"note":"investigation","path":".ambicode/task/ENG-24/investigation_2026-10-09T14-49.md"} |
| 14 | 2026-10-09T12:49:46.180Z | exit | {"reason":"done","budget":{"modelSteps":1,"wallMs":45049},"complete":true,"unverified":0} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "b3d2dcea-4",
    "at": "2026-10-09T12:49:01.137Z",
    "route": "b3d2dcea-1",
    "kind": "envelope",
    "sources": [
      {
        "key": "ARGS",
        "title": "Investigate which files this request would need to touch. Read the relevant cod…",
        "relation": "args",
        "derivedFrom": null,
        "bytes": 1017
      }
    ],
    "builtFrom": "args",
    "asked": [],
    "missingAsked": [],
    "hash": "sha256:a3363f59644f7cefd504ab3dc7fc2f12"
  },
  {
    "id": "b3d2dcea-5",
    "at": "2026-10-09T12:49:02.811Z",
    "route": "b3d2dcea-1",
    "kind": "map",
    "mode": "prompt",
    "layers": [
      {
        "name": "shortlist",
        "ms": 667,
        "hits": 20
      },
      {
        "name": "harvest",
        "ms": 2,
        "hits": 17
      },
      {
        "name": "shortlist",
        "ms": 633,
        "hits": 20
      }
    ],
    "layersSource": "default",
    "terms": {
      "pass1": [
        "nom",
        "NOM-specific",
        "score-type"
      ],
      "pass2": [
        "nom",
        "NOM-specific",
        "score-type",
        "NomCarryEffortDetail",
        "NomCarryRiskFactorRow",
        "NomCarryDetailComponent",
        "formatters",
        "route",
        "router"
      ]
    },
    "candidates": 31,
    "limitations": [
      "\"nom\" appears in 307 files; only the first 200 were ranked.",
      "\"score-type\" appears in 216 files; only the first 200 were ranked.",
      "\"scoretype\" appears in 203 files; only the first 200 were ranked.",
      "\"score-type\" matched 2064 of the project's 3431 files, which is not a shortlist, so it was ignored.",
      "Co-change contributed nothing: 1 commit(s) in this repository touch the files the terms matched.",
      "212 matching file(s) are not listed: they fall outside projects[].shortlist in .ambicode/config.yaml (tests, styles, markup and data by default).",
      "121 further candidate(s) scored but are not listed; raise --limit to see them.",
      "270 matching file(s) are not listed: they fall outside projects[].shortlist in .ambicode/config.yaml (tests, styles, markup and data by default).",
      "239 further candidate(s) scored but are not listed; raise --limit to see them."
    ],
    "index": "none",
    "collisions": [],
    "bytes": 5834,
    "serialized": 14,
    "candidatePaths": [
      "main/router/route-reuse-strategies/explicit-query-params-reactivate.strategy.ts",
      "main/features/score-types/nom/components/score-card/components/carry/nom-carry-detail.component.ts",
      "main/features/score-types/nom/components/score-card/nom-score-card.component.ts",
      "main/screens/analytics/analytics-router.module.ts",
      "main/features/score-types/nom/components/score-card/components/lift/nom-lift-detail.component.ts",
      "main/features/score-types/nom/components/score-card/components/push-pull/nom-push-pull-detail.component.ts",
      "main/features/score-types/nom/components/score-card/components/team/nom-team-detail.component.ts",
      "main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts",
      "main/features/score-types/nom/shared/wizards/nom-carry/constants/card-configs/nom-carry-obstacles-on-route-config.constant.ts",
      "main/features/score-types/nom/shared/wizards/nom-push-pull/constants/card-configs/nom-push-pull-obstacles-along-route-config.constant.ts",
      "main/features/score-types/nom/components/score-card/components/general-data/nom-general-data-detail.component.ts",
      "main/features/score-types/nom/components/score-card/components/selected-card-tooltip/nom-selected-card-tooltip.component.ts",
      "main/features/score-types/nom/components/score-card/nom-score-card.mocks.ts",
      "main/features/score-types/nom/shared/constants/carry/nom-carry-work-conditions.constants.ts",
      "main/features/score-types/nom/shared/constants/nom-work-conditions.constants.ts",
      "main/features/score-types/nom/shared/models/carry/nom-carry-input-base.interface.ts",
      "main/features/score-types/nom/shared/models/push-pull/nom-push-pull-input-base.interface.ts",
      "main/features/score-types/nom/shared/models/result/nom-carry-task-result.interface.ts",
      "main/features/score-types/nom/shared/models/result/nom-push-pull-task-result.interface.ts",
      "main/features/score-types/nom/shared/wizards/nom-carry/components/nom-carry-effort/nom-carry-effort.component.ts"
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
        "main/router/route-reuse-strategies/explicit-query-params-reactivate.strategy.ts",
        "main/features/score-types/nom/components/score-card/components/carry/nom-carry-detail.component.ts",
        "main/features/score-types/nom/components/score-card/nom-score-card.component.ts",
        "main/screens/analytics/analytics-router.module.ts",
        "main/features/score-types/nom/components/score-card/components/lift/nom-lift-detail.component.ts",
        "main/features/score-types/nom/components/score-card/components/push-pull/nom-push-pull-detail.component.ts",
        "main/features/score-types/nom/components/score-card/components/team/nom-team-detail.component.ts",
        "main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts"
      ],
      "feature": [],
      "bytes": 1160,
      "hash": "de8af7c14295"
    }
  },
  {
    "id": "b3d2dcea-6",
    "at": "2026-10-09T12:49:02.841Z",
    "route": "b3d2dcea-1",
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
    "id": "b3d2dcea-7",
    "at": "2026-10-09T12:49:02.868Z",
    "route": "b3d2dcea-1",
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

Recorded at 2026-10-09T12:49:04.404Z, +3.57 s from session start. Context 18974 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":11696,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":11696},"output_tokens":5,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 1: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-Bj9KZ3/home/cwd/repo && ls && grep -rliE \"telemetry|analytics|track(Event)?\\b\" --include=*.ts . --exclude-dir=node_modules | head -60"
}
```

Output: 284 UTF-8 bytes; 219 ms; tool-error=false; SHA256 `4fad2aaeb630920ca0270341fc415ec72a28dd94e93908c91e7349cc4319767b`.

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
(eval):1: no matches found: --include=*.ts
~~~

### API request 2

Recorded at 2026-10-09T12:49:06.809Z, +5.98 s from session start. Context 19389 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":415,"cache_read_input_tokens":18972,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":415},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 2: Grep (Grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "pattern": "telemetry|trackEvent|logEvent|mixpanel|amplitude|posthog|gtag",
  "path": "/private/tmp/e-Bj9KZ3/home/cwd/repo/main",
  "-i": true,
  "output_mode": "files_with_matches",
  "head_limit": 60
}
```

Output: 4574 UTF-8 bytes; 136 ms; tool-error=false; SHA256 `5382ba008ffd5c3698d82fe8389951392d1403619241b3095a8c805963e8d931`.

Paths mentioned in output (a mention is not a source-body read):

- `main/assets/helpPages/fr/modules.md`
- `main/assets/helpPages/fr/potentialSolutions.md`
- `main/assets/helpPages/pt/modules.md`
- `main/assets/helpPages/pt/potentialSolutions.md`
- `main/assets/i18n/de.json`
- `main/assets/i18n/fr.json`
- `main/assets/i18n/pt.json`
- `main/components/datadisplays/i18n-html/i18n-html.component.ts`
- `main/components/dialogs/AssessmentTypeDialog/AssessmentTypeDialog.component.spec.ts`
- `main/components/dialogs/AssessmentTypeDialog/AssessmentTypeDialog.component.ts`
- `main/components/dialogs/new-users-dialog/new-users-dialog.component.ts`
- `main/components/inputs/assessment-form/assessment-form.component.spec.ts`
- `main/components/inputs/assessment-form/assessment-form.component.ts`
- `main/components/tables/report-table/report-table.component.ts`
- `main/components/ui/steppers/services/stepper-selection-tracker.service.ts`
- `main/environments/environment.ts`
- `main/environments/environment.web-dev.ts`
- `main/environments/environment.web-local.ts`
- `main/environments/environment.web-prod.ts`
- `main/environments/environment.web-staging.ts`
- `main/environments/environment.web.ts`
- `main/features/ai-custom-solutions/components/ai-solutions-chatkit/ai-solutions-chatkit.component.ts`
- `main/features/ai-custom-solutions/state/ai-solutions.facade.ts`
- `main/features/amplitude/mocks/amplitude-browser.mock.ts`
- `main/features/amplitude/models/amplitude.model.ts`
- `main/features/amplitude/services/amplitude.service.spec.ts`
- `main/features/amplitude/services/amplitude.service.ts`
- `main/features/score-types/composite-rank/components/score-card/composite-rank-score-card.component.ts`
- `main/features/score-types/composite-rank/services/composite-rank-api.service.ts`
- `main/features/score-types/ge-adv/components/score-card/detail/ge-adv-score-detail.component.stories.ts`
- `main/features/score-types/ge-adv/components/score-card/detail/ge-adv-score-detail.component.ts`
- `main/features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.stories.ts`
- `main/features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.ts`
- `main/features/score-types/ge-adv/components/score-card/results/ge-adv-score-card-results.component.stories.ts`
- `main/features/score-types/ge-adv/components/score-card/results/ge-adv-score-card-results.component.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.stories.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`
- `main/features/score-types/ge-adv/providers/ge-adv.provider.ts`
- `main/features/score-types/ge-adv/services/ge-adv-telemetry.service.ts`
- `main/features/score-types/hal/components/hal-score-detail/hal-score-detail.component.spec.ts`
- `main/features/score-types/hal/components/hal-score-detail/hal-score-detail.component.ts`
- `main/features/score-types/lm-carry/components/lm-carry-score-card/lm-carry-score-card.component.spec.ts`
- `main/features/score-types/lm-carry/components/lm-carry-score-card/lm-carry-score-card.component.ts`
- `main/features/score-types/lm-carry/components/lm-carry-score-detail/lm-carry-score-detail.component.ts`
- `main/features/score-types/lm-carry/components/lm-carry-wizard/lm-carry-wizard.component.ts`
- `main/features/score-types/lm-lift/components/lm-lift-score-card/lm-lift-score-card.component.spec.ts`
- `main/features/score-types/lm-lift/components/lm-lift-score-card/lm-lift-score-card.component.ts`
- `main/features/score-types/lm-lift/components/lm-lift-score-detail/lm-lift-score-detail.component.ts`
- `main/features/score-types/lm-lift/components/lm-lift-wizard/lm-lift-wizard.component.ts`
- `main/features/score-types/lm-lower/components/lm-lower-score-card/lm-lower-score-card.component.spec.ts`
- `main/features/score-types/lm-lower/components/lm-lower-score-card/lm-lower-score-card.component.ts`
- `main/features/score-types/lm-lower/components/lm-lower-score-detail/lm-lower-score-detail.component.ts`
- `main/features/score-types/lm-lower/components/lm-lower-wizard/lm-lower-wizard.component.ts`
- `main/features/score-types/lm-push-pull/components/lm-push-pull-card/lm-push-pull-card.component.spec.ts`
- `main/features/score-types/lm-push-pull/components/lm-push-pull-card/lm-push-pull-card.component.ts`
- `main/features/score-types/lm-push-pull/components/lm-push-pull-score-detail/lm-push-pull-score-detail.component.ts`
- `main/features/score-types/lm-push-pull/components/lm-push-pull-wizard/lm-push-pull-wizard.component.ts`
- `main/features/score-types/niosh/components/niosh-score-detail/niosh-score-detail.component.ts`
- `main/features/score-types/niosh/components/niosh-wizard/niosh-wizard.component.ts`
- `main/features/score-types/rsi/components/rsi-score-detail/rsi-score-detail.component.ts`

Output excerpt; full output in JSON tool 2:

~~~text
Found 60 files limit: 60
main/assets/helpPages/fr/modules.md
main/assets/helpPages/fr/potentialSolutions.md
main/assets/helpPages/pt/modules.md
main/assets/helpPages/pt/potentialSolutions.md
main/assets/i18n/de.json
main/assets/i18n/fr.json
main/assets/i18n/pt.json
main/components/datadisplays/i18n-html/i18n-html.component.ts
main/components/dialogs/AssessmentTypeDialog/AssessmentTypeDialog.component.spec.ts
main/components/dialogs/AssessmentTypeDialog/AssessmentTypeDialog.component.ts
main/comp
~~~

### API request 3

Recorded at 2026-10-09T12:49:08.963Z, +8.13 s from session start. Context 21554 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":2165,"cache_read_input_tokens":19387,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2165},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 3: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cat main/features/amplitude/models/amplitude.model.ts main/features/score-types/ge-adv/services/ge-adv-telemetry.service.ts; grep -rn \"GeAdvTelemetry\\|ge-adv-telemetry\" main | grep -v \"^main/features/score-types/ge-adv/services/ge-adv-telemetry.service.ts\"; ls -R main/features/score-types/nom | grep -v \"^$\" | head -100; ls main/features/amplitude/*"
}
```

Output: 25745 UTF-8 bytes; 1754 ms; tool-error=false; SHA256 `5dcd33ea3e19b4bb35286ab58e4f2222ee8a8244fe02e1364663fe21197b544e`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/features/amplitude/models/amplitude.model.ts`
- `main/features/score-types/ge-adv/services/ge-adv-telemetry.service.ts`

Paths mentioned in output (a mention is not a source-body read):

- `screens/org-admin/org-settings/org-settings.model`
- `features/amplitude/models/amplitude.model`
- `features/amplitude/services/amplitude.service`
- `../state/ge-adv.facade`
- `main/features/score-types/ge-adv/providers/ge-adv.provider.ts`
- `../services/ge-adv-telemetry.service`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.stories.ts`
- `../../services/ge-adv-telemetry.service`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`
- `main/features/score-types/ge-adv/components/score-card/results/ge-adv-score-card-results.component.stories.ts`
- `../../../services/ge-adv-telemetry.service`
- `main/features/score-types/ge-adv/components/score-card/results/ge-adv-score-card-results.component.ts`
- `main/features/score-types/ge-adv/components/score-card/detail/ge-adv-score-detail.component.ts`
- `main/features/score-types/ge-adv/components/score-card/detail/ge-adv-score-detail.component.stories.ts`
- `main/features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.stories.ts`
- `main/features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.ts`

Output excerpt; full output in JSON tool 3:

~~~text
import { Role } from "models/Auth";
import { ToolType } from "models/Scoring";
import { OrganizationAdminSettings } from "screens/org-admin/org-settings/org-settings.model";

export type AnalyticPrimitive = string | number | boolean | Date | null | undefined;

export type AnalyticValue = AnalyticPrimitive | AnalyticPrimitive[];

export interface AmplitudeEventProperties {
  [key: string]: AnalyticValue;
}

export interface AmplitudeUserProperties {
  [key: string]: AnalyticValue;
}

export inter
~~~

### API request 4

Recorded at 2026-10-09T12:49:12.270Z, +11.44 s from session start. Context 34442 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":12888,"cache_read_input_tokens":21552,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":12888},"output_tokens":8,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 4: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-Bj9KZ3/home/cwd/repo; grep -n \"track[A-Za-z]*(\\|^  public\\|^  private\" main/features/amplitude/services/amplitude.service.ts | head -80; echo ---; grep -rn \"ToolType.nom\\|nom = \\|nom:\" main/models/Scoring* | head; echo ---; grep -n \"amplitude\\|Amplitude\\|inject(\\|trackSc\\|track\" main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts main/features/score-types/nom/components/score-card/nom-score-card.component.ts; ls main/features/score-types/nom main/features/score-types/nom/*.ts 2>/dev/null; echo ---; grep -rn \"trackReportExported\" main --include=*.ts | grep -v spec"
}
```

Output: 6241 UTF-8 bytes; 198 ms; tool-error=false; SHA256 `7d24d63ced8008f69eb2c165c6ac59bf88836263bfea768f82d4d481e9870078`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/features/amplitude/services/amplitude.service.ts`
- `main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts`
- `main/features/score-types/nom/components/score-card/nom-score-card.component.ts`

Paths mentioned in output (a mention is not a source-body read):

- `main/models/Scoring.ts`
- `main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts`
- `main/features/score-types/nom/components/score-card/nom-score-card.component.ts`

Output excerpt; full output in JSON tool 4:

~~~text
40:  private readonly platformId = inject(PLATFORM_ID);
41:  private readonly gdpr = inject(GdprFacade);
42:  private readonly destroyRef = inject(DestroyRef);
43:  private readonly ngZone = inject(NgZone);
44:  private readonly router = inject(Router);
46:  private isInitialized = false;
47:  private isEnabled = false;
48:  private routerTrackingSub?: Subscription;
50:  public constructor() {
71:  private setupRouterTracking(): void {
90:            this.trackDashboardViewed();
93:            t
~~~

### API request 5

Recorded at 2026-10-09T12:49:15.797Z, +14.97 s from session start. Context 37753 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":3311,"cache_read_input_tokens":34440,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":3311},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 2.

#### Tool 5: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-Bj9KZ3/home/cwd/repo; sed -n 560,760p main/features/amplitude/services/amplitude.service.ts; grep -rn \"REPORT_EXPORTED\\|trackReportExported\\|ReportExported\" main -r | grep -v \"amplitude.model\"; grep -n \"describe\\|it(\" main/features/amplitude/services/amplitude.service.spec.ts | head -50"
}
```

Output: 8533 UTF-8 bytes; 2067 ms; tool-error=false; SHA256 `343e41d8bf1d6b5c95d710d8d80b229e8d8e77656da5a755d06a91ee7dd1f313`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/features/amplitude/services/amplitude.service.ts`
- `main/features/amplitude/services/amplitude.service.spec.ts`

Paths mentioned in output (a mention is not a source-body read):

- `main/features/amplitude/services/amplitude.service.ts`
- `main/screens/report/services/report-export.service.ts`
- `main/services/report.service.ts`

Output excerpt; full output in JSON tool 5:

~~~text
      scoreType,
      effortId,
      effortIndex
    );
  }

  public trackScoreTypesSubmitted(
    reportId: string,
    scoreTypes: ToolType[],
    wizardType: WizardType,
    wasAiAssisted?: boolean
  ): void {
    this.trackEvent(InseerEventTypes.SCORE_TYPE_SUBMITTED, {
      [InseerEventProperties.REPORT_ID]: reportId,
      [InseerEventProperties.SCORE_TYPES]: scoreTypes,
      [InseerEventProperties.WIZARD_TYPE]: wizardType,
      [InseerEventProperties.WAS_AI_ASSISTED]: wasAiAssisted,

~~~

#### Tool 6: Bash (cat)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-Bj9KZ3/home/cwd/repo; sed -n 60,330p main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts"
}
```

Output: 8757 UTF-8 bytes; 156 ms; tool-error=false; SHA256 `51d43ba5e5602b3299f1826076051a1d89fa184c036bc5b24f0d242d240ef2e3`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts`

Output excerpt; full output in JSON tool 6:

~~~text
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideMatDialogConfig(), provideAppDialog()],
  host: {
    class: "page-content inseer-ds",
  },
})
export class NomWizardComponent
  implements OnInit, AfterViewInit, IAssessmentWizard<NomData>
{
  private readonly breakpointService = inject(BreakpointService);
  private readonly userFacade = inject(UserFacade);
  private readonly reportFacade = inject(ReportFacade);
  private readonly scoringFacade = inject(ScoringFacade);
  pr
~~~

### API request 6

Recorded at 2026-10-09T12:49:19.994Z, +19.16 s from session start. Context 45613 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":7860,"cache_read_input_tokens":37751,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":7860},"output_tokens":8,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 7: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-Bj9KZ3/home/cwd/repo; sed -n 70,110p main/screens/report/services/report-export.service.ts; sed -n 400,415p main/services/report.service.ts; sed -n 785,830p main/services/report.service.ts; sed -n 80,200p main/features/score-types/nom/components/score-card/nom-score-card.component.ts; grep -rn \"trackScoreTypesSubmitted\\|trackScoreTypesAdded\\|trackScoreCardEffortViewed\\|trackScoreTypeEditSaved\" main --include=*.ts | grep -v \"spec\\|amplitude.service.ts\\|ge-adv\"; grep -rln \"nom-wizard\\|NomWizard\" main --include=*.ts | grep -v \"features/score-types/nom/\""
}
```

Output: 7683 UTF-8 bytes; 212 ms; tool-error=false; SHA256 `cd8fea4bb523c87fec377168e8250d43d41e870002db515d7d58618b704b1b1d`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/screens/report/services/report-export.service.ts`
- `main/services/report.service.ts`
- `main/features/score-types/nom/components/score-card/nom-score-card.component.ts`

Output excerpt; full output in JSON tool 7:

~~~text
    }

    if (!this.solutions.solutionsHidden() && this.solutions.showInseerSolutions()) {
      return !this.solutions.topThreeInseerSolutions()?.length;
    } else return false;
  });

  public enablePdfExport(): void {
    this.canExportPdf.set(true);
  }

  public exportPdf(): void {
    this.amplitudeService.trackReportExported(this.reportFacade.reportId, ExportType.PDF);
    this.reportFacade.setIsExportingPdf(true);

    setTimeout(() => {
      // Some legacy score cards don't fully rea
~~~

### API request 7

Recorded at 2026-10-09T12:49:23.835Z, +23.00 s from session start. Context 49211 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":3598,"cache_read_input_tokens":45611,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":3598},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 8: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-Bj9KZ3/home/cwd/repo; grep -rln \"NomScoreCardComponent\\|NomWizardComponent\\|processNomScore\" main | grep -v \"score-types/nom/\"; echo ---; grep -n \"geAdvTelemetry\\.\\|track\" main/features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.ts main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts; echo ---; grep -n \"ge-adv\\|geAdv\\|GeAdv\" main/features/score-types/ge-adv/providers/ge-adv.provider.ts; grep -rn \"nom\" -il main/features/score-types/*.ts main/features/score-types/*/*.provider.ts 2>/dev/null; grep -n \"Nom\\|nom\" main/screens/report/services/report-export.service.ts | head"
}
```

Output: 1666 UTF-8 bytes; 2278 ms; tool-error=false; SHA256 `42164f419c15edce7e35b272624baf1c2df77f65f5c0ef6616aec8e6dbbac756`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`
- `main/features/score-types/ge-adv/providers/ge-adv.provider.ts`
- `main/screens/report/services/report-export.service.ts`

Paths mentioned in output (a mention is not a source-body read):

- `main/state/scoring.facade.ts`
- `main/screens/report/report-routing.module.ts`
- `main/screens/report/components/score-cards/report-score-cards.component.ts`
- `main/components/components.module.ts`
- `main/services/report.service.ts`
- `main/features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`
- `../services/ge-adv-telemetry.service`
- `../services/ge-adv-wizard-auto-launch.service`
- `../state/ge-adv.facade`

Output excerpt; full output in JSON tool 8:

~~~text
main/state/scoring.facade.ts
main/screens/report/report-routing.module.ts
main/screens/report/components/score-cards/report-score-cards.component.ts
main/components/components.module.ts
main/services/report.service.ts
---
main/features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.ts:58:    this.geAdvTelemetry.trackGeAdvEditOpened();
main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts:171:    this.trackStepperTransitions();
main/features/score-typ
~~~

### API request 8

Recorded at 2026-10-09T12:49:30.099Z, +29.27 s from session start. Context 50453 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1242,"cache_read_input_tokens":49209,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1242},"output_tokens":20,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 9: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-Bj9KZ3/home/cwd/repo; grep -n -i \"nom\" main/state/scoring.facade.ts main/screens/report/report-routing.module.ts main/screens/report/components/score-cards/report-score-cards.component.ts main/services/report.service.ts | head -40; sed -n 40,70p main/features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.ts; grep -n \"amplitude\\|Amplitude\" main/screens/report/components/score-cards/report-score-cards.component.ts main/state/scoring.facade.ts | head"
}
```

Output: 2661 UTF-8 bytes; 268 ms; tool-error=false; SHA256 `f7b0eab8c56b42d1766f6bc1e1d2a2e91cc9030617de0cad90e0dfed986f82b1`.

Inferred requested paths (operands, not proof all bodies were returned):

- `main/state/scoring.facade.ts`
- `main/screens/report/report-routing.module.ts`
- `main/screens/report/components/score-cards/report-score-cards.component.ts`
- `main/services/report.service.ts`
- `main/features/score-types/ge-adv/components/score-card/ge-adv-score-card.component.ts`

Paths mentioned in output (a mention is not a source-body read):

- `main/state/scoring.facade.ts`
- `features/score-types/nom/shared/models/nom-data.interface`
- `features/score-types/nom/services/nom-api.service`
- `main/screens/report/report-routing.module.ts`
- `../../features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component`
- `main/screens/report/components/score-cards/report-score-cards.component.ts`
- `features/score-types/nom/components/score-card/nom-score-card.component`
- `main/services/report.service.ts`

Output excerpt; full output in JSON tool 9:

~~~text
main/state/scoring.facade.ts:31:import { NomData } from "features/score-types/nom/shared/models/nom-data.interface";
main/state/scoring.facade.ts:32:import { NomApiService } from "features/score-types/nom/services/nom-api.service";
main/state/scoring.facade.ts:88:  private readonly nomApiService = inject(NomApiService);
main/state/scoring.facade.ts:582:  public processNomScore$(nomData: NomData): Observable<ScoringData> {
main/state/scoring.facade.ts:583:    return this.processScore$(nomData, (.
~~~

### API request 9

Recorded at 2026-10-09T12:49:36.796Z, +35.97 s from session start. Context 51813 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1360,"cache_read_input_tokens":50451,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1360},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
## Summary

NOM telemetry belongs in the existing Amplitude layer, and no event pipeline exists elsewhere. `main/features/amplitude/` already has typed events (`SCORE_TYPE_SUBMITTED`, `WIZARD_STEP_*`, `SCORE_CARD_TAB_VIEWED`, `REPORT_EXPORTED`). Most of them carry a `score_type` property or a `score_types` array, which is how score types are told apart. NOM has no tracking today: `grep` for amplitude/track in the NOM wizard and score card found only unrelated injections, with no `track` calls.

GE Advanced is the closest precedent. It wraps `AmplitudeService` in a per-score-type `GeAdvTelemetryService` (`features/score-types/ge-adv/services/ge-adv-telemetry.service.ts:11-100`). That service is provided in `providers/ge-adv.provider.ts:14` and called from its wizard (`ge-adv-wizard.component.ts:200,228,251,258`) and its score card (`ge-adv-score-card.component.ts:58`).

## Existing files and their roles

**Telemetry model (FR-52)**
- `main/features/amplitude/models/amplitude.model.ts`: holds the `InseerEventTypes`, `InseerEventProperties` and `EventPropertyMap` types. NOM already has a value in `ToolType` (`main/models/Scoring.ts:121`).
  - **Wizard completion** already has a shared event: `SCORE_TYPE_SUBMITTED` (`SCORE_TYPES: ToolType[]`, `WIZARD_TYPE: WizardType`). NOM can reuse it with `[ToolType.nom]` and `WizardType.FullPage`, so no model change is needed for it.
  - **Scorecard view** can reuse `SCORE_CARD_TAB_VIEWED`, which carries `SCORE_TYPE` (`:301-311`). A tab name is required.
  - **Scorecard creation** can reuse `SCORE_TYPE_ADDED` or the `SCORE_TYPE_SUBMITTED` first-submission path. This is an assumption.
  - **Export** is the gap. `REPORT_EXPORTED` has only `report_id` and `export_type` (`:~270-273`), so it cannot show that an export involved NOM. It needs an optional `SCORE_TYPES` property, or a new NOM-specific event. FR-52 ("NOM-specific tracking in shared score-type events") points to extending the shared events with optional score-type properties.
- `main/features/amplitude/services/amplitude.service.ts`: has typed `track*` methods (`trackScoreTypesSubmitted` at `:566`, `trackReportExported` at `:623`, `trackScoreCardTabViewed`). `trackReportExported` needs an optional score-types parameter, and any new event needs a new method.
- `main/features/amplitude/services/amplitude.service.spec.ts`: covers the service and should get cases for the new or changed events.

**Where NOM events fire (FR-51)**
- `main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts`: `onSubmit()` (`:~262`) calls `processNomScore$` and then navigates away. This is the hook for creation and workflow completion, using `nomData()` or `scoringData()?.nomData` to tell a first submission from an edit. It also has `onCancel()` and the stepper, and it injects no telemetry today.
- `main/features/score-types/nom/components/score-card/nom-score-card.component.ts`: the scorecard view hook. It has no edit-opened tracking and injects `ReportFacade` as optional (`:91`). Telemetry would need the same optional treatment so Storybook and spec setups keep working.
- `main/screens/report/components/score-cards/report-score-cards.component.ts`: imports and hosts `NomScoreCardComponent` (`:13,38`). It is an alternative place to fire the view event.
- `main/services/report.service.ts`: `:1127-1133` submits NOM data in a second path (assumed to be the upload or bulk path). Lines `:412`, `:795` and `:823` call `trackReportExported` for share, screenshot and Excel.
- `main/screens/report/services/report-export.service.ts:82`: the PDF export call site for `trackReportExported`. These four call sites must pass the NOM flag or score types when the report contains NOM.
- `main/state/scoring.facade.ts:582`: `processNomScore$`. This is an alternative single hook for completion, and it sits closer to the API.

**Optional dedicated wrapper (assumption, following the GE Advanced pattern)**
- `main/features/score-types/nom/services/nom-telemetry.service.ts` (**proposed new**): a `NomTelemetryService` that wraps `AmplitudeService` with `ToolType.nom`.
- `main/features/score-types/nom/services/nom-telemetry.service.spec.ts` (**proposed new**): its spec.
- The wrapper would be injected in the wizard and score card. NOM has no provider file, so it could use `providedIn: "root"` instead.

**Specs and stories**
- `nom-wizard.component.spec.ts` and `nom-score-card.component.spec.ts` would need an Amplitude or telemetry mock.
- `nom-wizard.component.stories.ts` and `nom-score-card.component.stories.ts` may need one too, as GE Advanced's stories provide a `GeAdvTelemetryService` stub.
- `main/features/amplitude/mocks/amplitude-browser.mock.ts` is a possible shared mock.

## Assumptions
- Telemetry is client-side Amplitude only. I found no other telemetry backend.
- Export events need to identify NOM per report. I did not check how export call sites know which score types a report contains.
- I did not open the stories, the spec files or `report.service.ts:1127` in detail.
- Nothing was edited.

## Files
- main/features/amplitude/models/amplitude.model.ts
- main/features/amplitude/services/amplitude.service.ts
- main/features/amplitude/services/amplitude.service.spec.ts
- main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts
- main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.spec.ts
- main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.stories.ts
- main/features/score-types/nom/components/score-card/nom-score-card.component.ts
- main/features/score-types/nom/components/score-card/nom-score-card.component.spec.ts
- main/features/score-types/nom/components/score-card/nom-score-card.component.stories.ts
- main/screens/report/components/score-cards/report-score-cards.component.ts
- main/screens/report/services/report-export.service.ts
- main/services/report.service.ts
- main/state/scoring.facade.ts
- main/features/score-types/nom/services/nom-telemetry.service.ts (proposed new)
- main/features/score-types/nom/services/nom-telemetry.service.spec.ts (proposed new)
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/15_1241_curated-ambicode-with-prompt-sonnet-5-5/traces/exports/d939c97a-6044-49ae-9842-e8ec1aa9a24e/ENG-24/source.json): 2 artifact files.

Artifact checks (present/size/hash and ledger entry count): pass. Exact source → exported destination, byte count/hash and validation are in the attempt JSON.

Correct historical paths:

- `main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts`
- `main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.spec.ts`
- `main/features/score-types/nom/components/score-card/nom-score-card.component.ts`
- `main/features/score-types/nom/components/score-card/nom-score-card.component.spec.ts`
- `main/features/score-types/nom/services/nom-telemetry.service.ts`
- `main/features/score-types/nom/services/nom-telemetry.service.spec.ts`

Named non-truth paths:

- `main/features/amplitude/models/amplitude.model.ts`
- `main/features/amplitude/services/amplitude.service.ts`
- `main/features/amplitude/services/amplitude.service.spec.ts`
- `main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.stories.ts`
- `main/features/score-types/nom/components/score-card/nom-score-card.component.stories.ts`
- `main/screens/report/components/score-cards/report-score-cards.component.ts`
- `main/screens/report/services/report-export.service.ts`
- `main/services/report.service.ts`
- `main/state/scoring.facade.ts`

Final model answer:

~~~text
## Summary

NOM telemetry belongs in the existing Amplitude layer, and no event pipeline exists elsewhere. `main/features/amplitude/` already has typed events (`SCORE_TYPE_SUBMITTED`, `WIZARD_STEP_*`, `SCORE_CARD_TAB_VIEWED`, `REPORT_EXPORTED`). Most of them carry a `score_type` property or a `score_types` array, which is how score types are told apart. NOM has no tracking today: `grep` for amplitude/track in the NOM wizard and score card found only unrelated injections, with no `track` calls.

GE Advanced is the closest precedent. It wraps `AmplitudeService` in a per-score-type `GeAdvTelemetryService` (`features/score-types/ge-adv/services/ge-adv-telemetry.service.ts:11-100`). That service is provided in `providers/ge-adv.provider.ts:14` and called from its wizard (`ge-adv-wizard.component.ts:200,228,251,258`) and its score card (`ge-adv-score-card.component.ts:58`).

## Existing files and their roles

**Telemetry model (FR-52)**
- `main/features/amplitude/models/amplitude.model.ts`: holds the `InseerEventTypes`, `InseerEventProperties` and `EventPropertyMap` types. NOM already has a value in `ToolType` (`main/models/Scoring.ts:121`).
  - **Wizard completion** already has a shared event: `SCORE_TYPE_SUBMITTED` (`SCORE_TYPES: ToolType[]`, `WIZARD_TYPE: WizardType`). NOM can reuse it with `[ToolType.nom]` and `WizardType.FullPage`, so no model change is needed for it.
  - **Scorecard view** can reuse `SCORE_CARD_TAB_VIEWED`, which carries `SCORE_TYPE` (`:301-311`). A tab name is required.
  - **Scorecard creation** can reuse `SCORE_TYPE_ADDED` or the `SCORE_TYPE_SUBMITTED` first-submission path. This is an assumption.
  - **Export** is the gap. `REPORT_EXPORTED` has only `report_id` and `export_type` (`:~270-273`), so it cannot show that an export involved NOM. It needs an optional `SCORE_TYPES` property, or a new NOM-specific event. FR-52 ("NOM-specific tracking in shared score-type events") points to extending the shared events with optional score-type properties.
- `main/features/amplitude/services/amplitude.service.ts`: has typed `track*` methods (`trackScoreTypesSubmitted` at `:566`, `trackReportExported` at `:623`, `trackScoreCardTabViewed`). `trackReportExported` needs an optional score-types parameter, and any new event needs a new method.
- `main/features/amplitude/services/amplitude.service.spec.ts`: covers the service and should get cases for the new or changed events.

**Where NOM events fire (FR-51)**
- `main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts`: `onSubmit()` (`:~262`) calls `processNomScore$` and then navigates away. This is the hook for creation and workflow completion, using `nomData()` or `scoringData()?.nomData` to tell a first submission from an edit. It also has `onCancel()` and the stepper, and it injects no telemetry today.
- `main/features/score-types/nom/components/score-card/nom-score-card.component.ts`: the scorecard view hook. It has no edit-opened tracking and injects `ReportFacade` as optional (`:91`). Telemetry would need the same optional treatment so Storybook and spec setups keep working.
- `main/screens/report/components/score-cards/report-score-cards.component.ts`: imports and hosts `NomScoreCardComponent` (`:13,38`). It is an alternative place to fire the view event.
- `main/services/report.service.ts`: `:1127-1133` submits NOM data in a second path (assumed to be the upload or bulk path). Lines `:412`, `:795` and `:823` call `trackReportExported` for share, screenshot and Excel.
- `main/screens/report/services/report-export.service.ts:82`: the PDF export call site for `trackReportExported`. These four call sites must pass the NOM flag or score types when the report contains NOM.
- `main/state/scoring.facade.ts:582`: `processNomScore$`. This is an alternative single hook for completion, and it sits closer to the API.

**Optional dedicated wrapper (assumption, following the GE Advanced pattern)**
- `main/features/score-types/nom/services/nom-telemetry.service.ts` (**proposed new**): a `NomTelemetryService` that wraps `AmplitudeService` with `ToolType.nom`.
- `main/features/score-types/nom/services/nom-telemetry.service.spec.ts` (**proposed new**): its spec.
- The wrapper would be injected in the wizard and score card. NOM has no provider file, so it could use `providedIn: "root"` instead.

**Specs and stories**
- `nom-wizard.component.spec.ts` and `nom-score-card.component.spec.ts` would need an Amplitude or telemetry mock.
- `nom-wizard.component.stories.ts` and `nom-score-card.component.stories.ts` may need one too, as GE Advanced's stories provide a `GeAdvTelemetryService` stub.
- `main/features/amplitude/mocks/amplitude-browser.mock.ts` is a possible shared mock.

## Assumptions
- Telemetry is client-side Amplitude only. I found no other telemetry backend.
- Export events need to identify NOM per report. I did not check how export call sites know which score types a report contains.
- I did not open the stories, the spec files or `report.service.ts:1127` in detail.
- Nothing was edited.

## Files
- main/features/amplitude/models/amplitude.model.ts
- main/features/amplitude/services/amplitude.service.ts
- main/features/amplitude/services/amplitude.service.spec.ts
- main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts
- main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.spec.ts
- main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.stories.ts
- main/features/score-types/nom/components/score-card/nom-score-card.component.ts
- main/features/score-types/nom/components/score-card/nom-score-card.component.spec.ts
- main/features/score-types/nom/components/score-card/nom-score-card.component.stories.ts
- main/screens/report/components/score-cards/report-score-cards.component.ts
- main/screens/report/services/report-export.service.ts
- main/services/report.service.ts
- main/state/scoring.facade.ts
- main/features/score-types/nom/services/nom-telemetry.service.ts (proposed new)
- main/features/score-types/nom/services/nom-telemetry.service.spec.ts (proposed new)
~~~


