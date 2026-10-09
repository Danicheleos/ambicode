# fe-vs-5164-review: 17 R1 (e-amr6gr)

[Case comparison](../cases/17/fe-vs-5164-review.md) · [Complete data and tool outputs](e-amr6gr.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/17_1451_walk-ambicode-with-prompt-sonnet-5-5/traces/e-amr6gr.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.1147 + judge $0.0062 = total $0.1209. Harness turns 5, API requests 5, tool calls 4.

## Starting inputs

Prompt SHA256: `487e3cdd832e2286f19240826368d29eb183403ee0a04603814c9e9ce17fa4ef`. Normalized delivered-step SHA256: `da095ecd03c90a100a2feafb0a0c69ab65f8532c5db71ea1a618bd0657c743fa`. Contract SHA256: `41521b1cb6e391b5089f71332cdeb878a433ecf87f385df4a23d9150719fb704`.

The exact prompt lives in the immutable eval result linked from the main report; the complete initial route delivery and contract text are in this attempt JSON.

```text
[ambicode] review · task review-uncommitted-change-repo-identify · step review-run (6/8)
Now: Run `node "/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs" review --task review-uncommitted-change-repo-identify`
Then: its output brings the next step
Route: estimate-step (done) · estimate (done) · review-run (now) · readback (if needed) · view (if needed)

Mode: headless (set by the user).
```

## Engine events in recorded order

The engine ledger and model trace use different clocks/events. Entries below retain timestamps; model calls follow in their own recorded order. No invented interleaving or internal model reasoning is assigned.

| # | UTC | Event | Input / output / state |
|---|---|---|---|
| 1 | 2026-10-09T14:54:56.249Z | route | {} |
| 2 | 2026-10-09T14:54:56.249Z | preanswer | {"gate":"estimate"} |
| 3 | 2026-10-09T14:54:56.250Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 4 | 2026-10-09T14:54:56.251Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 5 | 2026-10-09T14:54:56.251Z | step | {"step":"ground","actor":"code","status":"skipped"} |
| 6 | 2026-10-09T14:54:57.885Z | step | {"step":"estimate-step","actor":"code","status":"completed","ms":1634} |
| 7 | 2026-10-09T14:54:57.886Z | gate | {"gate":"estimate"} |
| 8 | 2026-10-09T14:54:57.887Z | acceptance | {"gate":"estimate","answer":"run"} |
| 9 | 2026-10-09T14:55:01.658Z | review | {"reviewId":"local_2026-10-09T16-55","result":".ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-55/result.json","status":"partial"} |
| 10 | 2026-10-09T14:55:01.678Z | step | {"step":"review-run","actor":"code","status":"completed","ms":1} |
| 11 | 2026-10-09T14:55:01.678Z | step | {"step":"readback","actor":"model","status":"delivered","bytes":2104,"budget":{"modelSteps":1,"modelStepsAllowed":6}} |
| 12 | 2026-10-09T14:55:01.679Z | step | {"step":"readback","actor":"model","status":"completed"} |
| 13 | 2026-10-09T14:55:01.679Z | step | {"step":"view","actor":"model","status":"delivered","bytes":2104} |
| 14 | 2026-10-09T14:55:01.696Z | command | {"ms":1699} |
| 15 | 2026-10-09T14:55:23.347Z | turn | {} |
| 16 | 2026-10-09T14:55:23.348Z | hook | {"ms":36} |
| 17 | 2026-10-09T14:55:23.369Z | step | {"step":"view","actor":"model","status":"completed"} |
| 18 | 2026-10-09T14:55:23.370Z | exit | {"reason":"done","budget":{"modelSteps":2,"wallMs":27121},"complete":true,"unverified":1} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "fa906912-2",
    "at": "2026-10-09T14:54:56.249Z",
    "route": "fa906912-1",
    "kind": "preanswer",
    "gate": "estimate",
    "option": "run",
    "via": "prompt",
    "trusted": true
  },
  {
    "id": "fa906912-8",
    "at": "2026-10-09T14:54:57.887Z",
    "route": "fa906912-1",
    "kind": "acceptance",
    "gate": "estimate",
    "instance": "fa906912-7",
    "answer": "run",
    "via": "prompt",
    "preanswer": "fa906912-2",
    "trusted": true
  },
  {
    "id": "b096430a-1",
    "at": "2026-10-09T14:55:01.658Z",
    "route": "fa906912-1",
    "session": "fa906912-7d02-4ee2-957c-8a3bd17b96df",
    "kind": "review",
    "reviewId": "local_2026-10-09T16-55",
    "result": ".ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-55/result.json",
    "status": "partial",
    "statusReason": "The review ran, with gaps: the reviewer answer was replayed from a recording; no model reviewed the change in this run.",
    "reviewerRan": true,
    "findings": 6,
    "omissions": 7,
    "checks": [
      {
        "projectId": "app",
        "commandId": "(none)",
        "status": "skipped",
        "exitCode": null
      },
      {
        "projectId": "app",
        "commandId": "(none)",
        "status": "skipped",
        "exitCode": null
      },
      {
        "projectId": "app",
        "commandId": "(none)",
        "status": "skipped",
        "exitCode": null
      }
    ],
    "waiting": []
  }
]
```

### API request 1

Recorded at 2026-10-09T14:54:59.689Z, +3.81 s from session start. Context 17755 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":10477,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":10477},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 1: Bash (ambicode review)

Responsible path: Review pipeline/replay → review result → engine read-back.

Input:

```json
{
  "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" review --task review-uncommitted-change-repo-identify"
}
```

Output: 11914 UTF-8 bytes; 2018 ms; tool-error=false; SHA256 `ca89ec1cd320f126f2132fab75182fead34e60cb56dd372a00df2c02b993ec80`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`

Paths mentioned in output (a mention is not a source-body read):

- `.ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-55/result.json`
- `../ambicode-evals-assets/outputs/core/2026-10-09/record_0206/raw/fe-vs-5164-review-ambicode-1.json`
- `.ambicode/config.yaml`
- `builtin/prompts/reviewer-role.md`
- `builtin/prompts/shared-operating-contract.md`
- `main/features/score-types/shared/services/form-progress-saving.service.ts`
- `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts`
- `main/features/score-types/shared/services/form-progress-saving.service.spec.ts`
- `main/features/score-types/hal/components/hal-effort-form/hal-effort-form.component.ts`
- `main/utils/forms/abstract-control-accessor.ts`
- `main/state/gdpr.facade.ts`
- `main/components/datadisplays/D3Components/D3DAMetrics/D3HorizontalMetrics/D3HorizontalMetrics.component.ts`
- `main/components/ReportComponent/Report.component.ts`
- `main/components/ui/steppers/services/stepper-selection-tracker.service.ts`
- `main/features/score-types/shared/services/tab-selection-tracker/tab-selection-tracker.service.ts`
- `main/features/score-types/ge-adv/services/ge-adv-wizard-auto-launch.service.ts`
- `references/outcomes.md`
- `references/merge-request.md`
- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`

Output excerpt; full output in JSON tool 1:

~~~text
[ambicode] review · task review-uncommitted-change-repo-identify · step readback (7/8)
Now: Review read-back
Then: write your final message; no route command is needed
Route: estimate-step (done) · estimate (done) · review-run (done) · readback (now) · view (if needed)
config-schema-old: schemaVersion 1 read with v3 defaults; init --apply writes v3
1. WHAT WAS REVIEWED
   review      local_2026-10-09T16-55  (partial: The review ran, with gaps: the reviewer answer was replayed from a recording; no model reviewed the change in this run.)
   mode        quality-review
   target      working (working-907eb4777db3814a)
   measured    4 file(s), 355 line(s), 312147 model-input byte(s) (42004 prompt, of which 14886 patch and 0 requirements, + 270143 mirrored), limit 
~~~

### API request 2

Recorded at 2026-10-09T14:55:03.397Z, +7.51 s from session start. Context 22410 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":4655,"cache_read_input_tokens":17753,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":4655},"output_tokens":17,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 2: Bash (ambicode view)

Responsible path: View server → URL/background task output.

Input:

```json
{
  "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" view --review local_2026-10-09T16-55",
  "run_in_background": true
}
```

Output: 299 UTF-8 bytes; 76 ms; tool-error=false; SHA256 `89ce48ec8d1029ea84c5c6dd6f80aee9c22ceee278cca5aa37afaec9c2c2f800`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`

Paths mentioned in output (a mention is not a source-body read):

- `/private/tmp/e-amr6gr/tmp/claude-502/-private-tmp-e-amr6gr-home-cwd/7fe2fb58-7417-4847-ac70-294b4f80e2fd/tasks/b3ma6ydbe.output`

Output excerpt; full output in JSON tool 2:

~~~text
Command running in background with ID: b3ma6ydbe. Output is being written to: /private/tmp/e-amr6gr/tmp/claude-502/-private-tmp-e-amr6gr-home-cwd/7fe2fb58-7417-4847-ac70-294b4f80e2fd/tasks/b3ma6ydbe.output. You will be notified when it completes. To check interim output, use Read on that file path.
~~~

### API request 3

Recorded at 2026-10-09T14:55:05.162Z, +9.28 s from session start. Context 22706 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":296,"cache_read_input_tokens":22408,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":296},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 3: Bash (cat)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "sleep 3; cat /private/tmp/e-amr6gr/tmp/claude-502/-private-tmp-e-amr6gr-home-cwd/7fe2fb58-7417-4847-ac70-294b4f80e2fd/tasks/b3ma6ydbe.output"
}
```

Output: 221 UTF-8 bytes; 3191 ms; tool-error=false; SHA256 `84ff33034f7b354f73d80c3e284fc370af5e7c56dba2596dc537347c0cd28d63`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/private/tmp/e-amr6gr/tmp/claude-502/-private-tmp-e-amr6gr-home-cwd/7fe2fb58-7417-4847-ac70-294b4f80e2fd/tasks/b3ma6ydbe.output`

Output excerpt; full output in JSON tool 3:

~~~text
error [review-not-found]: No saved review at /private/tmp/e-amr6gr/home/.ambicode/reviews/local_2026-10-09T16-55.
error [review-not-found]: No saved review at /private/tmp/e-amr6gr/home/.ambicode/reviews/local_2026-10-09T16-55.
  at: --review
  - Run `ambicode review` first, or check the id in the review report.

[exited with code 2]
~~~

### API request 4

Recorded at 2026-10-09T14:55:10.745Z, +14.86 s from session start. Context 23731 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1025,"cache_read_input_tokens":22704,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1025},"output_tokens":4,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 4: Bash (ambicode view)

Responsible path: View server → URL/background task output.

Input:

```json
{
  "command": "cd /private/tmp/e-amr6gr/home/cwd/repo && timeout 20 node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" view --review local_2026-10-09T16-55 2>&1 | head -20"
}
```

Output: 293 UTF-8 bytes; 361 ms; tool-error=false; SHA256 `da786093998a23d1a40e2c5e0a94f77a17731e382df512f8a65ac375c1cf8e30`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`

Output excerpt; full output in JSON tool 4:

~~~text
unexpected failure: Error: listen EPERM: operation not permitted 127.0.0.1:45831
    at Server.setupListenHandle [as _listen2] (node:net:1986:21)
    at listenInCluster (node:net:2065:12)
    at node:net:2274:7
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
~~~

### API request 5

Recorded at 2026-10-09T14:55:23.182Z, +27.30 s from session start. Context 24201 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":470,"cache_read_input_tokens":23729,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":470},"output_tokens":787,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
## 1. What was reviewed

- **Review:** `local_2026-10-09T16-55`. It is **partial**: the reviewer answer was replayed from a recording of `fe-vs-5164-review`, made for this exact snapshot. No model reviewed the change in this run.
- **Mode and target:** quality review of the uncommitted working-tree change (`working-907eb4777db3814a`).
- **Size:** 4 files, 355 lines.
- **Requirements:** none supplied.
- **Reviewer:** ok (model sonnet, replayed, no tools, took 0s).
- **Result file:** `repo/.ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-55/result.json`

## 2. Findings

Paths below are as printed in the report.

1. **[medium/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:169`
   - `ngOnDestroy` runs a fire-and-forget `saveDraftToStorage()` with no catch, so a storage failure becomes an unhandled promise rejection.
   - It also rewrites the draft on destroy whenever a debounce or save is pending. In the cancel flow, `removeDraftFromStorage` is awaited and then the wizard is destroyed. A pending debounce at that point makes `ngOnDestroy` write the draft back, which undoes the removal.
   - Suggestion: add a `discarded` flag set by `removeDraftFromStorage` that skips the destroy save, and add a `.catch`.

2. **[medium/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:98`
   - The draft read from IndexedDB goes straight into `form.reset(draft)` without validation. A draft saved under an older form shape can put stale or mismatched values into the form.
   - Suggestion: validate or version the draft.

3. **[medium/medium] correctness** — `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts:195`
   - `maybeRestoreAndTrackWizardProgress()` returns a promise that is neither awaited nor caught inside the subscribe callback, so a localforage failure is an unhandled rejection.
   - The callback runs on every `geAdvDataAvailable$` emission. Each emission resets the form from the DTO and then restores the draft over it, which makes ordering and repetition hard to reason about.
   - Suggestion: handle the failure and consider restoring only once.

4. **[low/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:118`
   - Each save does an unserialized read-modify-write of the whole drafts collection.
   - `switchMap` cannot cancel the previous save's promise, and the `ngOnDestroy` save can overlap too, so concurrent saves can overwrite each other.
   - Suggestion: chain `saveDraftToStorage` and `removeDraftFromStorage` through a queue.

5. **[low/medium] complexity** — `main/features/score-types/shared/services/form-progress-saving.service.ts:133`
   - The overloaded `saveDraftToStorage`, with optional parameters and `??` fallbacks, exists only so `ngOnDestroy` can call it with no arguments.
   - The fallback `formValue ?? this._form?.value` also fires on a null value.
   - Suggestion: use one method taking `(key, value)`.

6. **[low/low] tests** — `main/features/score-types/shared/services/form-progress-saving.service.spec.ts:97`
   - The `ngOnDestroy` tests check that `localforage.getItem` was called, which pins an implementation detail. They never assert that the data was saved or that errors are handled.
   - Suggestion: assert that `setItem` receives the expected draft.

## 3. Verification

- **Checks:** `app/e2e`, `app/lint` and `app/unit` were all skipped. They are set to null in the configuration, so they are intentionally unavailable. A skipped check is not a pass, and nothing was run.
- **Reviewer evidence:** the findings come from a replayed recording, not from a fresh model call.
- **Review page:** I could not start it.
  - The first attempt reported `review-not-found` under `~/.ambicode/reviews`.
  - Retrying from `repo/` failed with `listen EPERM` on 127.0.0.1. The sandbox does not allow local port binding. You can allow it with `sandbox.network.allowLocalBinding: true` in your settings, then run `ambicode view --review local_2026-10-09T16-55` from `repo/`.
  - There is no review page link.

## 4. Omissions, uncertainty and unavailable coverage

```
4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE
   - 8 unchanged file(s) that mention names this change adds, removes or renames were included so the reviewer could check them: main/features/score-types/hal/components/hal-effort-form/hal-effort-form.component.ts, main/utils/forms/abstract-control-accessor.ts, main/state/gdpr.facade.ts, main/components/datadisplays/D3Components/D3DAMetrics/D3HorizontalMetrics/D3HorizontalMetrics.component.ts, main/components/ReportComponent/Report.component.ts, main/components/ui/steppers/services/stepper-selection-tracker.service.ts, main/features/score-types/shared/services/tab-selection-tracker/tab-selection-tracker.service.ts, main/features/score-types/ge-adv/services/ge-adv-wizard-auto-launch.service.ts. They were found by name, not by type: a caller that reaches the code another way is not among them.
   - Besides the changed files, 21 unchanged file(s) sitting in the same directories were included. The rest of the repository was not available to the reviewer.
   - No requirement was supplied, so this is a quality review. It does not establish that the change does what any ticket or specification asked for.
   - Nothing was run; the lint, unit and e2e checks were skipped as unconfigured.
   - I did not trace whether the wizard's successful-save path removes the draft. Only the cancel path appears in the diff.
   - I did not check the order in which Angular runs ngOnDestroy and DestroyRef callbacks.
   - I did not read the unchanged dependent files in depth.
```
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/17_1451_walk-ambicode-with-prompt-sonnet-5-5/traces/exports/7fe2fb58-7417-4847-ac70-294b4f80e2fd/review-uncommitted-change-repo-identify/source.json): 1 artifact files.

Artifact checks (present/size/hash and ledger entry count): pass. Exact source → exported destination, byte count/hash and validation are in the attempt JSON.

Correct historical paths:

None.

Named non-truth paths:

None.

Review path arrays above are deliberately empty: file-list scoring is not used for review. The raw grader results and replay ledger in JSON retain the review evidence.

Final model answer:

~~~text
## 1. What was reviewed

- **Review:** `local_2026-10-09T16-55`. It is **partial**: the reviewer answer was replayed from a recording of `fe-vs-5164-review`, made for this exact snapshot. No model reviewed the change in this run.
- **Mode and target:** quality review of the uncommitted working-tree change (`working-907eb4777db3814a`).
- **Size:** 4 files, 355 lines.
- **Requirements:** none supplied.
- **Reviewer:** ok (model sonnet, replayed, no tools, took 0s).
- **Result file:** `repo/.ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-55/result.json`

## 2. Findings

Paths below are as printed in the report.

1. **[medium/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:169`
   - `ngOnDestroy` runs a fire-and-forget `saveDraftToStorage()` with no catch, so a storage failure becomes an unhandled promise rejection.
   - It also rewrites the draft on destroy whenever a debounce or save is pending. In the cancel flow, `removeDraftFromStorage` is awaited and then the wizard is destroyed. A pending debounce at that point makes `ngOnDestroy` write the draft back, which undoes the removal.
   - Suggestion: add a `discarded` flag set by `removeDraftFromStorage` that skips the destroy save, and add a `.catch`.

2. **[medium/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:98`
   - The draft read from IndexedDB goes straight into `form.reset(draft)` without validation. A draft saved under an older form shape can put stale or mismatched values into the form.
   - Suggestion: validate or version the draft.

3. **[medium/medium] correctness** — `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts:195`
   - `maybeRestoreAndTrackWizardProgress()` returns a promise that is neither awaited nor caught inside the subscribe callback, so a localforage failure is an unhandled rejection.
   - The callback runs on every `geAdvDataAvailable$` emission. Each emission resets the form from the DTO and then restores the draft over it, which makes ordering and repetition hard to reason about.
   - Suggestion: handle the failure and consider restoring only once.

4. **[low/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:118`
   - Each save does an unserialized read-modify-write of the whole drafts collection.
   - `switchMap` cannot cancel the previous save's promise, and the `ngOnDestroy` save can overlap too, so concurrent saves can overwrite each other.
   - Suggestion: chain `saveDraftToStorage` and `removeDraftFromStorage` through a queue.

5. **[low/medium] complexity** — `main/features/score-types/shared/services/form-progress-saving.service.ts:133`
   - The overloaded `saveDraftToStorage`, with optional parameters and `??` fallbacks, exists only so `ngOnDestroy` can call it with no arguments.
   - The fallback `formValue ?? this._form?.value` also fires on a null value.
   - Suggestion: use one method taking `(key, value)`.

6. **[low/low] tests** — `main/features/score-types/shared/services/form-progress-saving.service.spec.ts:97`
   - The `ngOnDestroy` tests check that `localforage.getItem` was called, which pins an implementation detail. They never assert that the data was saved or that errors are handled.
   - Suggestion: assert that `setItem` receives the expected draft.

## 3. Verification

- **Checks:** `app/e2e`, `app/lint` and `app/unit` were all skipped. They are set to null in the configuration, so they are intentionally unavailable. A skipped check is not a pass, and nothing was run.
- **Reviewer evidence:** the findings come from a replayed recording, not from a fresh model call.
- **Review page:** I could not start it.
  - The first attempt reported `review-not-found` under `~/.ambicode/reviews`.
  - Retrying from `repo/` failed with `listen EPERM` on 127.0.0.1. The sandbox does not allow local port binding. You can allow it with `sandbox.network.allowLocalBinding: true` in your settings, then run `ambicode view --review local_2026-10-09T16-55` from `repo/`.
  - There is no review page link.

## 4. Omissions, uncertainty and unavailable coverage

```
4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE
   - 8 unchanged file(s) that mention names this change adds, removes or renames were included so the reviewer could check them: main/features/score-types/hal/components/hal-effort-form/hal-effort-form.component.ts, main/utils/forms/abstract-control-accessor.ts, main/state/gdpr.facade.ts, main/components/datadisplays/D3Components/D3DAMetrics/D3HorizontalMetrics/D3HorizontalMetrics.component.ts, main/components/ReportComponent/Report.component.ts, main/components/ui/steppers/services/stepper-selection-tracker.service.ts, main/features/score-types/shared/services/tab-selection-tracker/tab-selection-tracker.service.ts, main/features/score-types/ge-adv/services/ge-adv-wizard-auto-launch.service.ts. They were found by name, not by type: a caller that reaches the code another way is not among them.
   - Besides the changed files, 21 unchanged file(s) sitting in the same directories were included. The rest of the repository was not available to the reviewer.
   - No requirement was supplied, so this is a quality review. It does not establish that the change does what any ticket or specification asked for.
   - Nothing was run; the lint, unit and e2e checks were skipped as unconfigured.
   - I did not trace whether the wizard's successful-save path removes the draft. Only the cancel path appears in the diff.
   - I did not check the order in which Angular runs ngOnDestroy and DestroyRef callbacks.
   - I did not read the unchanged dependent files in depth.
```
~~~


