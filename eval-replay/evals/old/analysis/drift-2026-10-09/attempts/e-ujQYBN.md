# be-vs-6015-review: 17 R2 (e-ujQYBN)

[Case comparison](../cases/17/be-vs-6015-review.md) · [Complete data and tool outputs](e-ujQYBN.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/17_1451_walk-ambicode-with-prompt-sonnet-5-5/traces/e-ujQYBN.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.1116 + judge $0.0068 = total $0.1184. Harness turns 5, API requests 5, tool calls 4.

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
| 1 | 2026-10-09T14:52:03.943Z | route | {} |
| 2 | 2026-10-09T14:52:03.944Z | preanswer | {"gate":"estimate"} |
| 3 | 2026-10-09T14:52:03.945Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 4 | 2026-10-09T14:52:03.946Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 5 | 2026-10-09T14:52:03.946Z | step | {"step":"ground","actor":"code","status":"skipped"} |
| 6 | 2026-10-09T14:52:04.555Z | step | {"step":"estimate-step","actor":"code","status":"completed","ms":608} |
| 7 | 2026-10-09T14:52:04.556Z | gate | {"gate":"estimate"} |
| 8 | 2026-10-09T14:52:04.558Z | acceptance | {"gate":"estimate","answer":"run"} |
| 9 | 2026-10-09T14:52:07.591Z | review | {"reviewId":"local_2026-10-09T16-52","result":".ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-52/result.json","status":"partial"} |
| 10 | 2026-10-09T14:52:07.624Z | step | {"step":"review-run","actor":"code","status":"completed","ms":1} |
| 11 | 2026-10-09T14:52:07.625Z | step | {"step":"readback","actor":"model","status":"delivered","bytes":2104,"budget":{"modelSteps":1,"modelStepsAllowed":6}} |
| 12 | 2026-10-09T14:52:07.625Z | step | {"step":"readback","actor":"model","status":"completed"} |
| 13 | 2026-10-09T14:52:07.626Z | step | {"step":"view","actor":"model","status":"delivered","bytes":2104} |
| 14 | 2026-10-09T14:52:07.646Z | command | {"ms":818} |
| 15 | 2026-10-09T14:52:29.896Z | turn | {} |
| 16 | 2026-10-09T14:52:29.896Z | hook | {"ms":33} |
| 17 | 2026-10-09T14:52:29.915Z | step | {"step":"view","actor":"model","status":"completed"} |
| 18 | 2026-10-09T14:52:29.916Z | exit | {"reason":"done","budget":{"modelSteps":2,"wallMs":25973},"complete":true,"unverified":1} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "90854f27-2",
    "at": "2026-10-09T14:52:03.944Z",
    "route": "90854f27-1",
    "kind": "preanswer",
    "gate": "estimate",
    "option": "run",
    "via": "prompt",
    "trusted": true
  },
  {
    "id": "90854f27-8",
    "at": "2026-10-09T14:52:04.558Z",
    "route": "90854f27-1",
    "kind": "acceptance",
    "gate": "estimate",
    "instance": "90854f27-7",
    "answer": "run",
    "via": "prompt",
    "preanswer": "90854f27-2",
    "trusted": true
  },
  {
    "id": "9b110adc-1",
    "at": "2026-10-09T14:52:07.591Z",
    "route": "90854f27-1",
    "session": "90854f27-2ce5-4ca8-ac92-cf7ea1ce0353",
    "kind": "review",
    "reviewId": "local_2026-10-09T16-52",
    "result": ".ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-52/result.json",
    "status": "partial",
    "statusReason": "The review ran, with gaps: the reviewer answer was replayed from a recording; no model reviewed the change in this run.",
    "reviewerRan": true,
    "findings": 5,
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

Recorded at 2026-10-09T14:52:06.470Z, +2.84 s from session start. Context 17819 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":10541,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":10541},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 1: Bash (ambicode review)

Responsible path: Review pipeline/replay → review result → engine read-back.

Input:

```json
{
  "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" review --task review-uncommitted-change-repo-identify"
}
```

Output: 11774 UTF-8 bytes; 1190 ms; tool-error=false; SHA256 `3b4429bccec85f1dbe27e7c3f47d92569a5fbfd5000f4fea056d5e2845d7c0da`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`

Paths mentioned in output (a mention is not a source-body read):

- `.ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-52/result.json`
- `../ambicode-evals-assets/outputs/core/2026-10-09/record_0206/raw/be-vs-6015-review-ambicode-1.json`
- `.ambicode/config.yaml`
- `builtin/prompts/reviewer-role.md`
- `builtin/prompts/shared-operating-contract.md`
- `src/controllers/ReportController.ts`
- `src/api/validators/ReportValidators.ts`
- `src/utils/ReportHelper.ts`
- `src/api/middleware/abort-signal.middleware.ts`
- `src/api/middleware/middleware.ts`
- `src/api/middleware/permissions/permissions.middleware.ts`
- `src/api/middleware/permissions/restrictions.middleware.ts`
- `src/api/middleware/regex-injection/regex-injection.middleware.ts`
- `src/api/middleware/regex-injection/types/regex-injection.types.ts`
- `src/api/middleware/sanitizers/sanitize.middleware.ts`
- `src/api/middleware/shared-report/shared-report.middleware.ts`
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
   review      local_2026-10-09T16-52  (partial: The review ran, with gaps: the reviewer answer was replayed from a recording; no model reviewed the change in this run.)
   mode        quality-review
   target      working (working-a92bdf82e45db0e0)
   measured    4 file(s), 441 line(s), 517150 model-input byte(s) (48462 prompt, of which 25183 patch and 0 requirements, + 468688 mirrored), limit 
~~~

### API request 2

Recorded at 2026-10-09T14:52:10.043Z, +6.41 s from session start. Context 22190 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":4371,"cache_read_input_tokens":17817,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":4371},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 2: Bash (ambicode view)

Responsible path: View server → URL/background task output.

Input:

```json
{
  "command": "node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" view --review local_2026-10-09T16-52",
  "run_in_background": true
}
```

Output: 299 UTF-8 bytes; 100 ms; tool-error=false; SHA256 `57a1b9649b1857f97705caf20065591e50b9a829d75ee864453c29d59230248d`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs`

Paths mentioned in output (a mention is not a source-body read):

- `/private/tmp/e-ujQYBN/tmp/claude-502/-private-tmp-e-ujQYBN-home-cwd/d51df79a-1623-4f22-a609-cb2131c1c843/tasks/bkrsevzyv.output`

Output excerpt; full output in JSON tool 2:

~~~text
Command running in background with ID: bkrsevzyv. Output is being written to: /private/tmp/e-ujQYBN/tmp/claude-502/-private-tmp-e-ujQYBN-home-cwd/d51df79a-1623-4f22-a609-cb2131c1c843/tasks/bkrsevzyv.output. You will be notified when it completes. To check interim output, use Read on that file path.
~~~

### API request 3

Recorded at 2026-10-09T14:52:12.084Z, +8.45 s from session start. Context 22483 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":293,"cache_read_input_tokens":22188,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":293},"output_tokens":21,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 3: Bash (cat)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "sleep 3; cat /private/tmp/e-ujQYBN/tmp/claude-502/-private-tmp-e-ujQYBN-home-cwd/d51df79a-1623-4f22-a609-cb2131c1c843/tasks/bkrsevzyv.output"
}
```

Output: 221 UTF-8 bytes; 3183 ms; tool-error=false; SHA256 `e6b31692a8879668a8271d554451e302978827caeeaec1c19c58821d52e5fdce`.

Inferred requested paths (operands, not proof all bodies were returned):

- `/private/tmp/e-ujQYBN/tmp/claude-502/-private-tmp-e-ujQYBN-home-cwd/d51df79a-1623-4f22-a609-cb2131c1c843/tasks/bkrsevzyv.output`

Output excerpt; full output in JSON tool 3:

~~~text
error [review-not-found]: No saved review at /private/tmp/e-ujQYBN/home/.ambicode/reviews/local_2026-10-09T16-52.
error [review-not-found]: No saved review at /private/tmp/e-ujQYBN/home/.ambicode/reviews/local_2026-10-09T16-52.
  at: --review
  - Run `ambicode review` first, or check the id in the review report.

[exited with code 2]
~~~

### API request 4

Recorded at 2026-10-09T14:52:17.577Z, +13.95 s from session start. Context 23506 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1023,"cache_read_input_tokens":22481,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1023},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 4: Bash (ambicode view)

Responsible path: View server → URL/background task output.

Input:

```json
{
  "command": "cd /private/tmp/e-ujQYBN/home/cwd/repo && timeout 10 node \"/Users/KillBill/Documents/projects/mine/ai/ambicode/scripts/ambicode.mjs\" view --review local_2026-10-09T16-52 --task review-uncommitted-change-repo-identify 2>&1 | head -20"
}
```

Output: 140 UTF-8 bytes; 323 ms; tool-error=false; SHA256 `25653d7fe98efff181ec48c636646bfd5b5299b068ad0ae036e69cbd9bb53e48`.

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

Recorded at 2026-10-09T14:52:23.691Z, +20.06 s from session start. Context 23869 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":363,"cache_read_input_tokens":23504,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":363},"output_tokens":5,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
# Review read-back

## 1. What was reviewed

- **Review id:** `local_2026-10-09T16-52`. The report marks it **partial**: the reviewer answer was replayed from a recording, so no model reviewed the change in this run.
- **Mode and target:** quality-review of the working tree (`working-a92bdf82e45db0e0`).
- **Size:** 4 files and 441 lines. The model input was 517,150 bytes against a limit of 524,288.
- **Reviewer:** ok. It was the sonnet recording of `be-vs-6015-review`, made for this exact snapshot, with no model call and no tools.
- **Requirements:** none supplied, so this is a quality review.
- **Result file:** `repo/.ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-52/result.json`

## 2. Findings

The reviewer returned five findings. An empty list would not have meant a clean change, and this one is not empty.

1. **[high/medium] `src/controllers/ReportController.ts:119`** (`f-53e322a2a4cf`)
   - Field validation runs only when the file part arrives, so it depends on the client sending all fields before the file.
   - The comment documenting that ordering was deleted.
   - If the file comes first, `fields` is empty and the request gets a 400. Fields sent after the file are never validated.
   - The API also moves from headers to multipart body fields, so existing clients that send headers will fail. Client compatibility was not checked.
2. **[medium/medium] `src/controllers/ReportController.ts:129`** (`f-48cae609dcf7`)
   - The validation-failure path only calls `file.resume()` and returns 400.
   - The old `req.unpipe(bb)` and `bb.removeAllListeners()` cleanup is gone, so the rest of a large upload keeps being consumed. The rejected-file branch at line 144 has the same problem.
   - The async file handler's return value is ignored, so a validation failure is not covered by the try/catch.
3. **[medium/high] `src/controllers/ReportController.ts:233`** (`f-fb79790fad0b`)
   - The raw AWS error is interpolated into `next(new Error(...))`. This could expose upstream detail, and the error is unclassified, so it becomes a generic 500.
   - The async `.send` callback has no try/catch. If `Organization.findById` or `findOneAndUpdate` throws there, the rejection is unhandled.
4. **[medium/medium] `src/api/validators/ReportValidators.ts:41`** (`f-d80739d56fe1`)
   - The pre-upload validator checks `content-type` before the body is parsed. The real field validators run manually from `ReportHelper`, so validation is split across the route and a helper that mutates `req.body`.
   - The `sanitize()` wrappers were dropped for reportName, actionType, sex and jobTitle, so those values may now reach the DB unsanitized.
5. **[low/medium] `src/utils/ReportHelper.ts:51`** (`f-80ce29de740a`)
   - `validateAddReportFields` overwrites `req.body`, and the util now imports `express`, express-validator and an API validator, which couples it to the API layer.
   - `buildReportUploadData` has no declared return type.
   - `fields.frameRate ?? 0` and `fields.start ?? "0"` handle only a missing field, so empty strings give NaN or 0.00 inconsistently.

## 3. Checks and verification

`app/e2e`, `app/lint` and `app/unit` were all **skipped**. Each is set to null in the configuration and selected 0 checks, so none of them passed. Nothing was run or tested. These findings come from the replayed reviewer answer, and I did not verify them independently.

## 4. Omissions, uncertainty and unavailable coverage

```
4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE
   - 8 unchanged file(s) that mention names this change adds, removes or renames were included so the reviewer could check them: src/api/middleware/abort-signal.middleware.ts, src/api/middleware/middleware.ts, src/api/middleware/permissions/permissions.middleware.ts, src/api/middleware/permissions/restrictions.middleware.ts, src/api/middleware/regex-injection/regex-injection.middleware.ts, src/api/middleware/regex-injection/types/regex-injection.types.ts, src/api/middleware/sanitizers/sanitize.middleware.ts, src/api/middleware/shared-report/shared-report.middleware.ts. They were found by name, not by type: a caller that reaches the code another way is not among them.
   - Besides the changed files, 31 unchanged file(s) sitting in the same directories were included. The rest of the repository was not available to the reviewer.
   - 28 further unchanged file(s) beside the change were left out because including them would put the review over its configured input limit. The change itself is complete; only surrounding context was trimmed.
   - No requirement was supplied, so this is a quality review. It does not establish that the change does what any ticket or specification asked for.
   - No checks (lint, unit, e2e) ran, so none of this was run or tested.
   - I did not examine the unchanged middleware files in detail. I did not verify client compatibility with the header-to-body change.
   - The rest of the repository was not available.
```

## Review page

I could not start the review page. `ambicode view --review local_2026-10-09T16-52` failed with `review-not-found`. It looked for the review under `/private/tmp/e-ujQYBN/home/.ambicode/reviews/`, but the review was saved under `repo/.ambicode/task/.../reviews/`. A retry from `repo/` failed because `view` has no `--task` option. There is no URL to give. The findings above and the `result.json` path in part 1 hold the full result. To reopen it, run `ambicode view --review local_2026-10-09T16-52` from a setup where the review store resolves to the task directory.
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/17_1451_walk-ambicode-with-prompt-sonnet-5-5/traces/exports/d51df79a-1623-4f22-a609-cb2131c1c843/review-uncommitted-change-repo-identify/source.json): 1 artifact files.

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

- **Review id:** `local_2026-10-09T16-52`. The report marks it **partial**: the reviewer answer was replayed from a recording, so no model reviewed the change in this run.
- **Mode and target:** quality-review of the working tree (`working-a92bdf82e45db0e0`).
- **Size:** 4 files and 441 lines. The model input was 517,150 bytes against a limit of 524,288.
- **Reviewer:** ok. It was the sonnet recording of `be-vs-6015-review`, made for this exact snapshot, with no model call and no tools.
- **Requirements:** none supplied, so this is a quality review.
- **Result file:** `repo/.ambicode/task/review-uncommitted-change-repo-identify/reviews/local_2026-10-09T16-52/result.json`

## 2. Findings

The reviewer returned five findings. An empty list would not have meant a clean change, and this one is not empty.

1. **[high/medium] `src/controllers/ReportController.ts:119`** (`f-53e322a2a4cf`)
   - Field validation runs only when the file part arrives, so it depends on the client sending all fields before the file.
   - The comment documenting that ordering was deleted.
   - If the file comes first, `fields` is empty and the request gets a 400. Fields sent after the file are never validated.
   - The API also moves from headers to multipart body fields, so existing clients that send headers will fail. Client compatibility was not checked.
2. **[medium/medium] `src/controllers/ReportController.ts:129`** (`f-48cae609dcf7`)
   - The validation-failure path only calls `file.resume()` and returns 400.
   - The old `req.unpipe(bb)` and `bb.removeAllListeners()` cleanup is gone, so the rest of a large upload keeps being consumed. The rejected-file branch at line 144 has the same problem.
   - The async file handler's return value is ignored, so a validation failure is not covered by the try/catch.
3. **[medium/high] `src/controllers/ReportController.ts:233`** (`f-fb79790fad0b`)
   - The raw AWS error is interpolated into `next(new Error(...))`. This could expose upstream detail, and the error is unclassified, so it becomes a generic 500.
   - The async `.send` callback has no try/catch. If `Organization.findById` or `findOneAndUpdate` throws there, the rejection is unhandled.
4. **[medium/medium] `src/api/validators/ReportValidators.ts:41`** (`f-d80739d56fe1`)
   - The pre-upload validator checks `content-type` before the body is parsed. The real field validators run manually from `ReportHelper`, so validation is split across the route and a helper that mutates `req.body`.
   - The `sanitize()` wrappers were dropped for reportName, actionType, sex and jobTitle, so those values may now reach the DB unsanitized.
5. **[low/medium] `src/utils/ReportHelper.ts:51`** (`f-80ce29de740a`)
   - `validateAddReportFields` overwrites `req.body`, and the util now imports `express`, express-validator and an API validator, which couples it to the API layer.
   - `buildReportUploadData` has no declared return type.
   - `fields.frameRate ?? 0` and `fields.start ?? "0"` handle only a missing field, so empty strings give NaN or 0.00 inconsistently.

## 3. Checks and verification

`app/e2e`, `app/lint` and `app/unit` were all **skipped**. Each is set to null in the configuration and selected 0 checks, so none of them passed. Nothing was run or tested. These findings come from the replayed reviewer answer, and I did not verify them independently.

## 4. Omissions, uncertainty and unavailable coverage

```
4. OMISSIONS, UNCERTAINTY AND UNAVAILABLE COVERAGE
   - 8 unchanged file(s) that mention names this change adds, removes or renames were included so the reviewer could check them: src/api/middleware/abort-signal.middleware.ts, src/api/middleware/middleware.ts, src/api/middleware/permissions/permissions.middleware.ts, src/api/middleware/permissions/restrictions.middleware.ts, src/api/middleware/regex-injection/regex-injection.middleware.ts, src/api/middleware/regex-injection/types/regex-injection.types.ts, src/api/middleware/sanitizers/sanitize.middleware.ts, src/api/middleware/shared-report/shared-report.middleware.ts. They were found by name, not by type: a caller that reaches the code another way is not among them.
   - Besides the changed files, 31 unchanged file(s) sitting in the same directories were included. The rest of the repository was not available to the reviewer.
   - 28 further unchanged file(s) beside the change were left out because including them would put the review over its configured input limit. The change itself is complete; only surrounding context was trimmed.
   - No requirement was supplied, so this is a quality review. It does not establish that the change does what any ticket or specification asked for.
   - No checks (lint, unit, e2e) ran, so none of this was run or tested.
   - I did not examine the unchanged middleware files in detail. I did not verify client compatibility with the header-to-body change.
   - The rest of the repository was not available.
```

## Review page

I could not start the review page. `ambicode view --review local_2026-10-09T16-52` failed with `review-not-found`. It looked for the review under `/private/tmp/e-ujQYBN/home/.ambicode/reviews/`, but the review was saved under `repo/.ambicode/task/.../reviews/`. A retry from `repo/` failed because `view` has no `--task` option. There is no URL to give. The findings above and the `result.json` path in part 1 hold the full result. To reopen it, run `ambicode view --review local_2026-10-09T16-52` from a setup where the review store resolves to the task directory.
~~~


