# fe-vs-5164-review: 17 R3 (e-z5UvSe)

[Case comparison](../cases/17/fe-vs-5164-review.md) · [Complete data and tool outputs](e-z5UvSe.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/17_1451_walk-ambicode-with-prompt-sonnet-5-5/traces/e-z5UvSe.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.1224 + judge $0.0060 = total $0.1284. Harness turns 6, API requests 6, tool calls 5.

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
| 1 | 2026-10-09T14:55:39.711Z | route | {} |
| 2 | 2026-10-09T14:55:39.712Z | preanswer | {"gate":"estimate"} |
| 3 | 2026-10-09T14:55:39.713Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 4 | 2026-10-09T14:55:39.713Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 5 | 2026-10-09T14:55:39.713Z | step | {"step":"ground","actor":"code","status":"skipped"} |
| 6 | 2026-10-09T14:55:41.053Z | step | {"step":"estimate-step","actor":"code","status":"completed","ms":1339} |
| 7 | 2026-10-09T14:55:41.054Z | gate | {"gate":"estimate"} |
| 8 | 2026-10-09T14:55:41.054Z | acceptance | {"gate":"estimate","answer":"run"} |
| 9 | 2026-10-09T14:55:44.670Z | review | {"reviewId":"local_2026-10-09T16-55","result":".ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-55/result.json","status":"partial"} |
| 10 | 2026-10-09T14:55:44.690Z | step | {"step":"review-run","actor":"code","status":"completed","ms":1} |
| 11 | 2026-10-09T14:55:44.691Z | step | {"step":"readback","actor":"model","status":"delivered","bytes":2104,"budget":{"modelSteps":1,"modelStepsAllowed":6}} |
| 12 | 2026-10-09T14:55:44.691Z | step | {"step":"readback","actor":"model","status":"completed"} |
| 13 | 2026-10-09T14:55:44.691Z | step | {"step":"view","actor":"model","status":"delivered","bytes":2104} |
| 14 | 2026-10-09T14:55:44.709Z | command | {"ms":1646} |
| 15 | 2026-10-09T14:56:04.368Z | turn | {} |
| 16 | 2026-10-09T14:56:04.369Z | hook | {"ms":31} |
| 17 | 2026-10-09T14:56:04.386Z | step | {"step":"view","actor":"model","status":"completed"} |
| 18 | 2026-10-09T14:56:04.387Z | exit | {"reason":"done","budget":{"modelSteps":2,"wallMs":24676},"complete":true,"unverified":1} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "5f90afd6-2",
    "at": "2026-10-09T14:55:39.712Z",
    "route": "5f90afd6-1",
    "kind": "preanswer",
    "gate": "estimate",
    "option": "run",
    "via": "prompt",
    "trusted": true
  },
  {
    "id": "5f90afd6-8",
    "at": "2026-10-09T14:55:41.054Z",
    "route": "5f90afd6-1",
    "kind": "acceptance",
    "gate": "estimate",
    "instance": "5f90afd6-7",
    "answer": "run",
    "via": "prompt",
    "preanswer": "5f90afd6-2",
    "trusted": true
  },
  {
    "id": "080f4d34-1",
    "at": "2026-10-09T14:55:44.670Z",
    "route": "5f90afd6-1",
    "session": "5f90afd6-fb17-4a61-8564-f7503fa249d3",
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

Recorded at 2026-10-09T14:55:42.761Z, +3.32 s from session start. Context 17821 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":10543,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":10543},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 1: Bash (ambicode review)

Responsible path: Review pipeline/replay → review result → engine read-back.

Input:

```json
{
  "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" review --task review-uncommitted-change-repo-identify"
}
```

Output: 11914 UTF-8 bytes; 1959 ms; tool-error=false; SHA256 `6c2bb9c29e43adb8ff2b97262825e5548f733cf7f78a1e4ef8ae4d6da030ce6e`.

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

Recorded at 2026-10-09T14:55:46.460Z, +7.01 s from session start. Context 22478 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":4657,"cache_read_input_tokens":17819,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":4657},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 2: Bash (ambicode view)

Responsible path: View server → URL/background task output.

Input:

```json
{
  "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" view --review local_2026-10-09T16-55",
  "run_in_background": true
}
```

Output: 299 UTF-8 bytes; 103 ms; tool-error=false; SHA256 `104e227488dbbf48861356422c194a2e7e9dcb44031dcdb6cb7d80f4da6ec8c2`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`

Paths mentioned in output (a mention is not a source-body read):

- `/private/tmp/e-z5UvSe/tmp/claude-502/-private-tmp-e-z5UvSe-home-cwd/96ada122-5b52-4dde-a72f-b57e04a9cada/tasks/bmm2tvr1v.output`

Output excerpt; full output in JSON tool 2:

~~~text
Command running in background with ID: bmm2tvr1v. Output is being written to: /private/tmp/e-z5UvSe/tmp/claude-502/-private-tmp-e-z5UvSe-home-cwd/96ada122-5b52-4dde-a72f-b57e04a9cada/tasks/bmm2tvr1v.output. You will be notified when it completes. To check interim output, use Read on that file path.
~~~

### API request 3

Recorded at 2026-10-09T14:55:47.989Z, +8.54 s from session start. Context 22774 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":296,"cache_read_input_tokens":22476,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":296},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 3: Read (Read)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "file_path": "/private/tmp/e-z5UvSe/tmp/claude-502/-private-tmp-e-z5UvSe-home-cwd/96ada122-5b52-4dde-a72f-b57e04a9cada/tasks/bmm2tvr1v.output"
}
```

Output: 234 UTF-8 bytes; 61 ms; tool-error=false; SHA256 `cbdbbe97944d83bc79d874bbf07c13f712f1d6bc9b85e69a3d7083ee1db854f7`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/private/tmp/e-z5UvSe/tmp/claude-502/-private-tmp-e-z5UvSe-home-cwd/96ada122-5b52-4dde-a72f-b57e04a9cada/tasks/bmm2tvr1v.output`

Output excerpt; full output in JSON tool 3:

~~~text
1	error [review-not-found]: No saved review at /private/tmp/e-z5UvSe/home/.ambicode/reviews/local_2026-10-09T16-55.
2	  at: --review
3	  - Run `ambicode review` first, or check the id in the review report.
4	
5	[exited with code 2]
6	
~~~

### API request 4

Recorded at 2026-10-09T14:55:50.447Z, +11.00 s from session start. Context 23811 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1037,"cache_read_input_tokens":22772,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1037},"output_tokens":4,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 4: Bash (ambicode view)

Responsible path: View server → URL/background task output.

Input:

```json
{
  "command": "cd /private/tmp/e-z5UvSe/home/cwd/repo && timeout 20 node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" view --review local_2026-10-09T16-55 --task review-uncommitted-change-repo-identify 2>&1 | head -20"
}
```

Output: 140 UTF-8 bytes; 308 ms; tool-error=false; SHA256 `25653d7fe98efff181ec48c636646bfd5b5299b068ad0ae036e69cbd9bb53e48`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`

Output excerpt; full output in JSON tool 4:

~~~text
error [bad-argument]: Unknown option for "view": Unknown option '--task'.
error [bad-argument]: Unknown option for "view": Unknown option '--task'.
  at: view
  - Options: --review <value>
  - Flags: --json, --open
~~~

### API request 5

Recorded at 2026-10-09T14:55:52.416Z, +12.97 s from session start. Context 24246 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":435,"cache_read_input_tokens":23809,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":435},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 5: Bash (ambicode view)

Responsible path: View server → URL/background task output.

Input:

```json
{
  "command": "timeout 20 node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" view --review local_2026-10-09T16-55 2>&1 | head -20"
}
```

Output: 293 UTF-8 bytes; 383 ms; tool-error=false; SHA256 `da786093998a23d1a40e2c5e0a94f77a17731e382df512f8a65ac375c1cf8e30`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`

Output excerpt; full output in JSON tool 5:

~~~text
unexpected failure: Error: listen EPERM: operation not permitted 127.0.0.1:45831
    at Server.setupListenHandle [as _listen2] (node:net:1986:21)
    at listenInCluster (node:net:2065:12)
    at node:net:2274:7
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
~~~

### API request 6

Recorded at 2026-10-09T14:56:04.209Z, +24.76 s from session start. Context 24583 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":337,"cache_read_input_tokens":24244,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":337},"output_tokens":776,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
# Review read-back

## 1. What was reviewed
- Review `local_2026-10-09T16-55`, mode quality-review, target: the uncommitted working tree of `repo/` (`working-907eb4777db3814a`).
- **The review is partial.** The reviewer answer was replayed from a recording, so no model reviewed the change in this run. The recording is the sonnet answer for `fe-vs-5164-review`, made for this exact snapshot.
- Measured size: 4 files, 355 lines.
- No requirements were supplied.
- Result file: `repo/.ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-55/result.json`

## 2. Findings
1. **[medium/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:169`
   - The fire-and-forget `saveDraftToStorage()` in `ngOnDestroy` has no catch, so a storage failure becomes an unhandled rejection.
   - It also rewrites the draft on destroy whenever a debounce or save is pending. On cancel, `removeDraftFromStorage` is awaited and the wizard is then destroyed. A pending debounce at that point makes `ngOnDestroy` write the draft back and undo the removal.
   - Suggested fix: a `discarded` flag set by `removeDraftFromStorage` that skips the destroy save, plus a `.catch`.
2. **[medium/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:98`
   - The draft read from IndexedDB goes into `form.reset` unvalidated. A draft saved under an older form shape can put stale or mismatched values into the form.
   - Suggested fix: validate or version the stored draft.
3. **[medium/medium] correctness** — `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts:195`
   - `maybeRestoreAndTrackWizardProgress()` returns a promise that is neither awaited nor caught inside the subscribe callback, so a localforage failure is an unhandled rejection.
   - The callback runs on every emission of `geAdvDataAvailable$`. Each emission resets the form from the DTO and then restores the draft over it again, which makes ordering and repetition hard to reason about.
   - Suggested fix: handle the failure and consider restoring only once.
4. **[low/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:118`
   - Each save does an unserialized read-modify-write of the whole drafts collection. `switchMap` cannot cancel the previous promise, and the destroy save can overlap too, so concurrent saves can overwrite each other.
   - Suggested fix: chain saves and removals through a queue.
5. **[low/medium] complexity** — `main/features/score-types/shared/services/form-progress-saving.service.ts:133`
   - The overloaded `saveDraftToStorage`, with optional parameters and `??` fallbacks, exists only so `ngOnDestroy` can call it with no arguments. The fallback `formValue ?? this._form?.value` also fires on a null value.
   - Suggested fix: one method taking `(key, value)`, with `ngOnDestroy` passing the current values explicitly.
6. **[low/low] tests** — `main/features/score-types/shared/services/form-progress-saving.service.spec.ts:97`
   - The `ngOnDestroy` tests check that `localforage.getItem` was called, which pins an implementation detail. They never assert that the data was saved or that errors are handled.
   - Suggested fix: assert that `setItem` receives the expected draft after destroy.

## 3. Checks and verification evidence
- `app/e2e`, `app/lint` and `app/unit` were all **skipped**. Each is set to null in the configuration, so none is a pass.
- Nothing was executed.
- The reviewer ran with no tools, from a replayed recording, so the findings above are unverified by this run.

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

## Review page
The page did not start, so there is no link.
- My first attempt, from the wrong directory, failed with `review-not-found`.
- The retry from `repo/` failed with `listen EPERM ... 127.0.0.1`. The sandbox blocks local port binding.
- To get the page, set `sandbox.network.allowLocalBinding: true` in your settings, then run `ambicode view --review local_2026-10-09T16-55` from `repo/`. I haven't changed any sandbox settings.

I didn't edit any code, and nothing was published.
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/17_1451_walk-ambicode-with-prompt-sonnet-5-5/traces/exports/96ada122-5b52-4dde-a72f-b57e04a9cada/review-uncommitted-change-repo-identify/source.json): 1 artifact files.

Artifact checks (present/size/hash and ledger entry count): pass. Exact source → exported destination, byte count/hash and validation are in the attempt JSON.

Correct historical paths:

None.

Named non-truth paths:

None.

Review path arrays above are deliberately empty: file-list scoring is not used for review. The raw grader results and replay ledger in JSON retain the review evidence.

Final model answer:

~~~text
# Review read-back

## 1. What was reviewed
- Review `local_2026-10-09T16-55`, mode quality-review, target: the uncommitted working tree of `repo/` (`working-907eb4777db3814a`).
- **The review is partial.** The reviewer answer was replayed from a recording, so no model reviewed the change in this run. The recording is the sonnet answer for `fe-vs-5164-review`, made for this exact snapshot.
- Measured size: 4 files, 355 lines.
- No requirements were supplied.
- Result file: `repo/.ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-55/result.json`

## 2. Findings
1. **[medium/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:169`
   - The fire-and-forget `saveDraftToStorage()` in `ngOnDestroy` has no catch, so a storage failure becomes an unhandled rejection.
   - It also rewrites the draft on destroy whenever a debounce or save is pending. On cancel, `removeDraftFromStorage` is awaited and the wizard is then destroyed. A pending debounce at that point makes `ngOnDestroy` write the draft back and undo the removal.
   - Suggested fix: a `discarded` flag set by `removeDraftFromStorage` that skips the destroy save, plus a `.catch`.
2. **[medium/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:98`
   - The draft read from IndexedDB goes into `form.reset` unvalidated. A draft saved under an older form shape can put stale or mismatched values into the form.
   - Suggested fix: validate or version the stored draft.
3. **[medium/medium] correctness** — `main/features/score-types/ge-adv/components/wizard/ge-adv-wizard.component.ts:195`
   - `maybeRestoreAndTrackWizardProgress()` returns a promise that is neither awaited nor caught inside the subscribe callback, so a localforage failure is an unhandled rejection.
   - The callback runs on every emission of `geAdvDataAvailable$`. Each emission resets the form from the DTO and then restores the draft over it again, which makes ordering and repetition hard to reason about.
   - Suggested fix: handle the failure and consider restoring only once.
4. **[low/medium] correctness** — `main/features/score-types/shared/services/form-progress-saving.service.ts:118`
   - Each save does an unserialized read-modify-write of the whole drafts collection. `switchMap` cannot cancel the previous promise, and the destroy save can overlap too, so concurrent saves can overwrite each other.
   - Suggested fix: chain saves and removals through a queue.
5. **[low/medium] complexity** — `main/features/score-types/shared/services/form-progress-saving.service.ts:133`
   - The overloaded `saveDraftToStorage`, with optional parameters and `??` fallbacks, exists only so `ngOnDestroy` can call it with no arguments. The fallback `formValue ?? this._form?.value` also fires on a null value.
   - Suggested fix: one method taking `(key, value)`, with `ngOnDestroy` passing the current values explicitly.
6. **[low/low] tests** — `main/features/score-types/shared/services/form-progress-saving.service.spec.ts:97`
   - The `ngOnDestroy` tests check that `localforage.getItem` was called, which pins an implementation detail. They never assert that the data was saved or that errors are handled.
   - Suggested fix: assert that `setItem` receives the expected draft after destroy.

## 3. Checks and verification evidence
- `app/e2e`, `app/lint` and `app/unit` were all **skipped**. Each is set to null in the configuration, so none is a pass.
- Nothing was executed.
- The reviewer ran with no tools, from a replayed recording, so the findings above are unverified by this run.

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

## Review page
The page did not start, so there is no link.
- My first attempt, from the wrong directory, failed with `review-not-found`.
- The retry from `repo/` failed with `listen EPERM ... 127.0.0.1`. The sandbox blocks local port binding.
- To get the page, set `sandbox.network.allowLocalBinding: true` in your settings, then run `ambicode view --review local_2026-10-09T16-55` from `repo/`. I haven't changed any sandbox settings.

I didn't edit any code, and nothing was published.
~~~


