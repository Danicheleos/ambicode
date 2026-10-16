# be-vs-5721-investigate: notation R3 (e-18w1Kb)

[Case comparison](../cases/notation/be-vs-5721-investigate.md) · [Complete data and tool outputs](e-18w1Kb.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/15_1241_curated-ambicode-with-prompt-sonnet-5-5/traces/e-18w1Kb.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.0975 + judge $0.0056 = total $0.1031. Harness turns 7, API requests 4, tool calls 6.

## Starting inputs

Prompt SHA256: `0dfa4da19a838ac97a3b2db208e9c7b84d468e3fd3866401c5056343ab6e76c2`. Normalized delivered-step SHA256: `686c1a3ff69def8b7d18f9cbf2b7fa28f4570c18225204cc8521373d849a6c33`. Contract SHA256: `edc68aaa9243b44ec0f5da41d77f8612643562db8efcd533ec8d73870b25b73e`.

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
Leads from the terms request, code, role, path, mark, snapshot, commands, explicit, working, directory, Deleting, current; then ReportController, are, addReport, addReportExternal, getReportRecord, getExternalReportRecord:
1. src/controllers/ReportController.ts:74 — contains "request"
2. src/api/Report.ts:4 — contains "request"
3. src/controllers/AuthController.ts:13 — contains "request"
4. src/api/middleware/permissions/permissions.middleware.ts:3 — contains "request"
5. src/api/middleware/verify-report-org.middleware.ts:7 — contains "request"
6. src/api/Auth.ts:13 — contains "request"
7. src/utils/ai-translations-helper.ts:28 — contains "code"
8. src/api/validators/PublicReportValidators.ts:3 — contains "are"
```

## Engine events in recorded order

The engine ledger and model trace use different clocks/events. Entries below retain timestamps; model calls follow in their own recorded order. No invented interleaving or internal model reasoning is assigned.

| # | UTC | Event | Input / output / state |
|---|---|---|---|
| 1 | 2026-10-09T12:43:27.979Z | route | {} |
| 2 | 2026-10-09T12:43:27.980Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 3 | 2026-10-09T12:43:27.980Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 4 | 2026-10-09T12:43:27.984Z | envelope | {} |
| 5 | 2026-10-09T12:43:28.482Z | map | {"bytes":5185} |
| 6 | 2026-10-09T12:43:28.521Z | policy | {"bytes":86} |
| 7 | 2026-10-09T12:43:28.550Z | policy | {"bytes":88} |
| 8 | 2026-10-09T12:43:28.551Z | step | {"step":"ground","actor":"code","status":"completed","ms":571} |
| 9 | 2026-10-09T12:43:28.552Z | step | {"step":"scope","actor":"human","status":"skipped"} |
| 10 | 2026-10-09T12:43:28.553Z | step | {"step":"read","actor":"model","status":"delivered","bytes":2049,"budget":{"modelSteps":1,"modelStepsAllowed":6}} |
| 11 | 2026-10-09T12:43:50.541Z | turn | {} |
| 12 | 2026-10-09T12:43:50.541Z | hook | {"ms":41} |
| 13 | 2026-10-09T12:43:50.562Z | note | {"note":"investigation","path":".ambicode/task/investigate-files-request-need-touch/investigation_2026-10-09T14-43.md"} |
| 14 | 2026-10-09T12:43:50.583Z | exit | {"reason":"done","budget":{"modelSteps":1,"wallMs":22604},"complete":true,"unverified":0} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "2bfbade9-4",
    "at": "2026-10-09T12:43:27.984Z",
    "route": "2bfbade9-1",
    "kind": "envelope",
    "sources": [
      {
        "key": "ARGS",
        "title": "Investigate which files this request would need to touch. Read the relevant cod…",
        "relation": "args",
        "derivedFrom": null,
        "bytes": 533
      }
    ],
    "builtFrom": "args",
    "asked": [],
    "missingAsked": [],
    "hash": "sha256:00b8114cbf01949fe5e1f369485b5087"
  },
  {
    "id": "2bfbade9-5",
    "at": "2026-10-09T12:43:28.482Z",
    "route": "2bfbade9-1",
    "kind": "map",
    "mode": "prompt",
    "layers": [
      {
        "name": "shortlist",
        "ms": 201,
        "hits": 20
      },
      {
        "name": "harvest",
        "ms": 7,
        "hits": 55
      },
      {
        "name": "shortlist",
        "ms": 157,
        "hits": 20
      }
    ],
    "layersSource": "default",
    "terms": {
      "pass1": [
        "request",
        "code",
        "role",
        "path",
        "mark",
        "snapshot",
        "commands",
        "explicit",
        "working",
        "directory",
        "Deleting",
        "current"
      ],
      "pass2": [
        "request",
        "code",
        "role",
        "path",
        "mark",
        "snapshot",
        "ReportController",
        "are",
        "addReport",
        "addReportExternal",
        "getReportRecord",
        "getExternalReportRecord"
      ]
    },
    "candidates": 29,
    "limitations": [
      "Co-change contributed nothing: 1 commit(s) in this repository touch the files the terms matched.",
      "52 matching file(s) are not listed: they fall outside projects[].shortlist in .ambicode/config.yaml (tests, styles, markup and data by default).",
      "135 further candidate(s) scored but are not listed; raise --limit to see them.",
      "61 matching file(s) are not listed: they fall outside projects[].shortlist in .ambicode/config.yaml (tests, styles, markup and data by default).",
      "193 further candidate(s) scored but are not listed; raise --limit to see them."
    ],
    "index": "none",
    "collisions": [],
    "bytes": 5185,
    "serialized": 29,
    "candidatePaths": [
      "src/controllers/ReportController.ts",
      "src/api/Report.ts",
      "src/controllers/AuthController.ts",
      "src/api/middleware/permissions/permissions.middleware.ts",
      "src/api/middleware/verify-report-org.middleware.ts",
      "src/api/Auth.ts",
      "src/utils/ai-translations-helper.ts",
      "src/api/validators/PublicReportValidators.ts",
      "src/features/score-types/est/est.controller.ts",
      "src/models/Auth.ts",
      "src/features/ai-custom-solutions/services/ai-custom-solutions-translation.service.ts",
      "src/controllers/OrganizationController.ts",
      "src/api/middleware/regex-injection/regex-injection.middleware.ts",
      "src/api/middleware/shared-report/shared-report.middleware.ts",
      "src/api/validators/ReportValidators.ts",
      "src/features/score-types/composite-rank/composite-rank.controller.ts",
      "src/dtos/AuthDtos.ts",
      "src/features/hard-delete/services/hard-delete.service.ts",
      "src/api/middleware/regex-injection/types/regex-injection.types.ts",
      "src/api/middleware/verify-access-token.middleware.ts"
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
        "src/controllers/ReportController.ts",
        "src/api/Report.ts",
        "src/controllers/AuthController.ts",
        "src/api/middleware/permissions/permissions.middleware.ts",
        "src/api/middleware/verify-report-org.middleware.ts",
        "src/api/Auth.ts",
        "src/utils/ai-translations-helper.ts",
        "src/api/validators/PublicReportValidators.ts"
      ],
      "feature": [],
      "bytes": 757,
      "hash": "4ba821429fc3"
    }
  },
  {
    "id": "2bfbade9-6",
    "at": "2026-10-09T12:43:28.521Z",
    "route": "2bfbade9-1",
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
    "id": "2bfbade9-7",
    "at": "2026-10-09T12:43:28.550Z",
    "route": "2bfbade9-1",
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

Recorded at 2026-10-09T12:43:32.411Z, +4.71 s from session start. Context 18515 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":11237,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":11237},"output_tokens":6,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 1: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-18w1Kb/home/cwd/repo && git ls-files | grep -iE \"user\" | head -50; grep -rliE \"registered.?users|deleteUser\" --include=*.ts --include=*.tsx --include=*.js --include=*.vue . --exclude-dir=node_modules | head -30"
}
```

Output: 812 UTF-8 bytes; 2624 ms; tool-error=false; SHA256 `dce0f494f96fcf57ccb3b224c057a73b7eb545154c9d8d38c0a7c0247585e403`.

Paths mentioned in output (a mention is not a source-body read):

- `src/libs/okta/users/create-user/index.ts`
- `src/libs/okta/users/create-user/types.ts`
- `src/libs/okta/users/delete-user/index.ts`
- `src/libs/okta/users/get-user-by-email/index.ts`
- `src/libs/okta/users/get-user-by-email/types.ts`
- `src/libs/okta/users/utils.ts`
- `src/models/ReportUserSetting.ts`

Output excerpt; full output in JSON tool 1:

~~~text
git: error: couldn't create cache file '/var/folders/nx/xb7v_m614s50z6c43bmbj5j40000gp/T/xcrun_db-gbK5WkA2' (errno=Operation not permitted)
2026-10-09 14:43:33.811 xcodebuild[54325:14730314]  DVTFilePathFSEvents: Failed to start fs event stream.
git: error: couldn't create cache file '/var/folders/nx/xb7v_m614s50z6c43bmbj5j40000gp/T/xcrun_db-m1i8kkoc' (errno=Operation not permitted)
2026-10-09 14:43:34.534 xcodebuild[54330:14730336]  DVTFilePathFSEvents: Failed to start fs event stream.
src/libs
~~~

### API request 2

Recorded at 2026-10-09T12:43:37.760Z, +10.06 s from session start. Context 19257 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":742,"cache_read_input_tokens":18513,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":742},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 2.

#### Tool 2: Grep (Grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "pattern": "deleteUser|delete-user|removeUser|DELETE.*user",
  "path": "/private/tmp/e-18w1Kb/home/cwd/repo/src",
  "-i": true,
  "output_mode": "content"
}
```

Output: 1873 UTF-8 bytes; 59 ms; tool-error=false; SHA256 `be91c893e3c0530e04fd22389b3de0063cfa6cabf2de938bfeca7642a063083f`.

Paths mentioned in output (a mention is not a source-body read):

- `src/controllers/ReportController.ts`
- `src/controllers/AuthController.ts`
- `src/controllers/OrganizationController.ts`
- `src/controllers/AuthController.spec.ts`
- `src/api/Auth.ts`
- `src/libs/okta/index.ts`
- `users/delete-user/index.js`
- `src/libs/okta/users/delete-user/index.ts`
- `src/features/hard-delete/services/hard-delete.service.ts`
- `src/utils/aws-helper.ts`

Output excerpt; full output in JSON tool 2:

~~~text
src/controllers/ReportController.ts:3314:          deletedBy: res?.locals?.user?._id ?? res?.locals?.externalClientApiKeyId,
src/controllers/AuthController.ts:1507:  static async removeUser(req: express.Request, res: express.Response): Promise<any> {
src/controllers/AuthController.ts:1508:    let deletedUser;
src/controllers/AuthController.ts:1511:        deletedUser = await Auth.findOneAndDelete({
src/controllers/AuthController.ts:1518:    return deletedUser;
src/controllers/AuthController.ts:1
~~~

#### Tool 3: Glob (Glob)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "pattern": "src/**/*{User,user}*",
  "path": "/private/tmp/e-18w1Kb/home/cwd/repo"
}
```

Output: 31 UTF-8 bytes; 52 ms; tool-error=false; SHA256 `8ae89e75042482ff60b2024b006085c1f77d1798758982fdf15e5fa953e620d0`.

Paths mentioned in output (a mention is not a source-body read):

- `src/models/ReportUserSetting.ts`

Output excerpt; full output in JSON tool 3:

~~~text
src/models/ReportUserSetting.ts
~~~

### API request 3

Recorded at 2026-10-09T12:43:40.612Z, +12.91 s from session start. Context 20441 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1184,"cache_read_input_tokens":19255,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1184},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 3.

#### Tool 4: Read (Read)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "file_path": "/private/tmp/e-18w1Kb/home/cwd/repo/src/api/Auth.ts",
  "offset": 70,
  "limit": 70
}
```

Output: 2472 UTF-8 bytes; 10 ms; tool-error=false; SHA256 `7a31e4d125ade5e5e0020db0b2a6c764584efa3585718bfe7439d25f860dc5f5`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/api/Auth.ts`

Output excerpt; full output in JSON tool 4:

~~~text
70	  }
71	);
72	
73	AuthRouter.post(
74	  "/getOutstandingAuths",
75	  verifyAccessToken,
76	  logRequest,
77	  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
78	    try {
79	      const users = await AuthController.getOutstandingAuths(req, res);
80	      return res.status(200).json({ users });
81	    } catch (e) {
82	      logger.error("ERROR FINDING AUTHS  " + e);
83	      res.status(500).send("ERROR FINDING AUTHS " + e);
84	    }
85	  }
86	);
87	
88	AuthR
~~~

#### Tool 5: Read (Read)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "file_path": "/private/tmp/e-18w1Kb/home/cwd/repo/src/controllers/AuthController.ts",
  "offset": 1495,
  "limit": 50
}
```

Output: 1568 UTF-8 bytes; 7 ms; tool-error=false; SHA256 `a7815fd53e82d50449880176e242c50623b710ce9b4b4479a75c02069c0f5850`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/controllers/AuthController.ts`

Output excerpt; full output in JSON tool 5:

~~~text
1495	            resetToken: 0,
1496	            lastLoginIp: 0,
1497	          }
1498	        );
1499	        return users;
1500	      }
1501	    } catch (e) {
1502	      logger.error("ERROR GETTING USERS " + e);
1503	      res.status(500).send("ERROR GETTING USERS " + e);
1504	    }
1505	  }
1506	
1507	  static async removeUser(req: express.Request, res: express.Response): Promise<any> {
1508	    let deletedUser;
1509	    try {
1510	      if (await PermissionHelper.hasAdminAccess(res)) {
1511	
~~~

#### Tool 6: Read (Read)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "file_path": "/private/tmp/e-18w1Kb/home/cwd/repo/src/controllers/AuthController.spec.ts",
  "offset": 80,
  "limit": 60
}
```

Output: 2094 UTF-8 bytes; 6 ms; tool-error=false; SHA256 `4df4d3cff404ca0db91da3bf09fe3d67cd51f9f756a0575afaf123e895ede08b`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/controllers/AuthController.spec.ts`

Output excerpt; full output in JSON tool 6:

~~~text
80	  //         locals: {
81	  //             user: {
82	  //                 _id: '51bb793aca2ab77a3200000d'
83	  //             }
84	  //         }
85	  //     });
86	
87	  //     const next = () => { return null; };
88	  //     const logoutRes = await AuthController.logoutAuth(req,res,next);
89	  //     assert.strictEqual(res, true);
90	  // });
91	
92	  it("should remove auth", async function () {
93	    sinon.stub(PermissionHelper, "hasAdminAccess").callsFake(() => Promise.resolve(true));
9
~~~

### API request 4

Recorded at 2026-10-09T12:43:48.600Z, +20.90 s from session start. Context 23550 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":3109,"cache_read_input_tokens":20439,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":3109},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
The cause is in the backend. The remove endpoint lets an admin delete their own account, and nothing stops it. This repo is backend only, and I found no frontend code for the "Admin - Registered Users" tab. I didn't run anything. This is from reading the code.

## Findings

- **Route:** `AuthRouter.post("/remove")` in `src/api/Auth.ts:88-97` validates only that `body.id` is a Mongo ID. It then calls `AuthController.removeUser` and returns 200.
- **Controller:** `AuthController.removeUser` in `src/controllers/AuthController.ts:1507-1519` checks `PermissionHelper.hasAdminAccess(res)`. It then runs `Auth.findOneAndDelete({_id: req.body.id})`.
- **The gap:** nothing compares `req.body.id` with the caller's own ID. The caller's ID is `res.locals.user._id`, which `src/api/Auth.ts` doesn't use here but `src/controllers/ReportController.ts:3314` and `src/controllers/OrganizationController.ts:931` do read.
- **Likely result:** the logged-in admin deletes their own `Auth` record. After that, their token or session points at a user that no longer exists. That is my inference for "breaks the entire env". I didn't trace the auth middleware to confirm it.
- **Same problem on disable:** `disableUser` (`src/controllers/AuthController.ts:1521-1536`, route at `src/api/Auth.ts:110-119`) also has no self-check. An admin can deactivate themselves.
- **Existing test:** `src/controllers/AuthController.spec.ts:92-110` covers only the happy path, where the ID is `"1234567"` and the caller is `"123456"`. It has no self-delete case.

## Assumptions

- The fix is a backend guard that rejects removal of your own account, with a 4xx response and a clear message.
- The fix does not need a schema or model change.
- A frontend change (hiding the delete button for the current user) would live in a separate repo, so I left it out of the list.
- The `src/libs/okta/users/delete-user` and `src/features/hard-delete` hits are about deleting an organization's users. They are unrelated to this endpoint.
- I didn't open the map's leads (`ReportController` and similar). They matched only on generic words.

## Files

All of these already exist. I propose creating and deleting nothing.

- `src/controllers/AuthController.ts`: add the self-removal check in `removeUser` (`:1507`), and in `disableUser` (`:1521`) if you want it covered too.
- `src/api/Auth.ts`: the `/remove` and `/disable` routes (`:88-119`). They need to return an error status when the controller rejects the request, because `/remove` currently always returns 200.
- `src/controllers/AuthController.spec.ts`: add a test that a self-delete is rejected, next to "should remove auth" (`:92`).
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/15_1241_curated-ambicode-with-prompt-sonnet-5-5/traces/exports/edbc5461-7073-413e-ba11-f1b50449e895/investigate-files-request-need-touch/source.json): 2 artifact files.

Artifact checks (present/size/hash and ledger entry count): pass. Exact source → exported destination, byte count/hash and validation are in the attempt JSON.

Correct historical paths:

- `src/controllers/AuthController.ts`
- `src/api/Auth.ts`
- `src/controllers/AuthController.spec.ts`

Named non-truth paths:

None.

Final model answer:

~~~text
The cause is in the backend. The remove endpoint lets an admin delete their own account, and nothing stops it. This repo is backend only, and I found no frontend code for the "Admin - Registered Users" tab. I didn't run anything. This is from reading the code.

## Findings

- **Route:** `AuthRouter.post("/remove")` in `src/api/Auth.ts:88-97` validates only that `body.id` is a Mongo ID. It then calls `AuthController.removeUser` and returns 200.
- **Controller:** `AuthController.removeUser` in `src/controllers/AuthController.ts:1507-1519` checks `PermissionHelper.hasAdminAccess(res)`. It then runs `Auth.findOneAndDelete({_id: req.body.id})`.
- **The gap:** nothing compares `req.body.id` with the caller's own ID. The caller's ID is `res.locals.user._id`, which `src/api/Auth.ts` doesn't use here but `src/controllers/ReportController.ts:3314` and `src/controllers/OrganizationController.ts:931` do read.
- **Likely result:** the logged-in admin deletes their own `Auth` record. After that, their token or session points at a user that no longer exists. That is my inference for "breaks the entire env". I didn't trace the auth middleware to confirm it.
- **Same problem on disable:** `disableUser` (`src/controllers/AuthController.ts:1521-1536`, route at `src/api/Auth.ts:110-119`) also has no self-check. An admin can deactivate themselves.
- **Existing test:** `src/controllers/AuthController.spec.ts:92-110` covers only the happy path, where the ID is `"1234567"` and the caller is `"123456"`. It has no self-delete case.

## Assumptions

- The fix is a backend guard that rejects removal of your own account, with a 4xx response and a clear message.
- The fix does not need a schema or model change.
- A frontend change (hiding the delete button for the current user) would live in a separate repo, so I left it out of the list.
- The `src/libs/okta/users/delete-user` and `src/features/hard-delete` hits are about deleting an organization's users. They are unrelated to this endpoint.
- I didn't open the map's leads (`ReportController` and similar). They matched only on generic words.

## Files

All of these already exist. I propose creating and deleting nothing.

- `src/controllers/AuthController.ts`: add the self-removal check in `removeUser` (`:1507`), and in `disableUser` (`:1521`) if you want it covered too.
- `src/api/Auth.ts`: the `/remove` and `/disable` routes (`:88-119`). They need to return an error status when the controller rejects the request, because `/remove` currently always returns 200.
- `src/controllers/AuthController.spec.ts`: add a test that a self-delete is rejected, next to "should remove auth" (`:92`).
~~~


