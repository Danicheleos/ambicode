# be-vs-5721-investigate: notation R2 (e-2Bfk7S)

[Case comparison](../cases/notation/be-vs-5721-investigate.md) · [Complete data and tool outputs](e-2Bfk7S.json) · [Raw trace](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/15_1241_curated-ambicode-with-prompt-sonnet-5-5/traces/e-2Bfk7S.jsonl)

Terminal model result: completed; engine exit: done, complete=true. Agent $0.1237 + judge $0.0049 = total $0.1286. Harness turns 8, API requests 6, tool calls 7.

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
| 1 | 2026-10-09T12:43:25.240Z | route | {} |
| 2 | 2026-10-09T12:43:25.242Z | step | {"step":"template","actor":"code","status":"skipped"} |
| 3 | 2026-10-09T12:43:25.242Z | step | {"step":"fetch","actor":"model","status":"skipped"} |
| 4 | 2026-10-09T12:43:25.246Z | envelope | {} |
| 5 | 2026-10-09T12:43:25.781Z | map | {"bytes":5185} |
| 6 | 2026-10-09T12:43:25.813Z | policy | {"bytes":86} |
| 7 | 2026-10-09T12:43:25.839Z | policy | {"bytes":88} |
| 8 | 2026-10-09T12:43:25.840Z | step | {"step":"ground","actor":"code","status":"completed","ms":597} |
| 9 | 2026-10-09T12:43:25.841Z | step | {"step":"scope","actor":"human","status":"skipped"} |
| 10 | 2026-10-09T12:43:25.842Z | step | {"step":"read","actor":"model","status":"delivered","bytes":2049,"budget":{"modelSteps":1,"modelStepsAllowed":6}} |
| 11 | 2026-10-09T12:43:49.473Z | turn | {} |
| 12 | 2026-10-09T12:43:49.474Z | hook | {"ms":266} |
| 13 | 2026-10-09T12:43:49.500Z | note | {"note":"investigation","path":".ambicode/task/investigate-files-request-need-touch/investigation_2026-10-09T14-43.md"} |
| 14 | 2026-10-09T12:43:49.532Z | exit | {"reason":"done","budget":{"modelSteps":1,"wallMs":24292},"complete":true,"unverified":0} |

The complete map terms, candidates, decisions, profile/tuning, delivered paths/hash, policy receipts, gates and review/check data remain in the JSON ledger. The map consumes requirement/args text plus the tracked repository inventory; the model receives only its serialized delivery.

## Model calls and exact tool I/O

Context is input + cache-creation + cache-read tokens in the API request, not source bytes. Multiple tools in one request are one model wave. Each tool output has its own elapsed time; overlapping times cannot be added to obtain wall time. Raw result text is preserved without truncation in the JSON.

### Exact engine grounding and receipts

Requirements/args → envelope; tracked paths + terms → ranked/delivered map; pack rules → policy stages; accepted/defaulted gates → route state; actual CLI read spans → search receipts. These fields are recorded engine data. The tool-class regex can miss shell-variable CLI invocations; prefer engine reader receipts for those calls.

```json
[
  {
    "id": "bdbbd4e7-4",
    "at": "2026-10-09T12:43:25.246Z",
    "route": "bdbbd4e7-1",
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
    "hash": "sha256:786039a48f5286501fabdce9705f8165"
  },
  {
    "id": "bdbbd4e7-5",
    "at": "2026-10-09T12:43:25.781Z",
    "route": "bdbbd4e7-1",
    "kind": "map",
    "mode": "prompt",
    "layers": [
      {
        "name": "shortlist",
        "ms": 255,
        "hits": 20
      },
      {
        "name": "harvest",
        "ms": 8,
        "hits": 55
      },
      {
        "name": "shortlist",
        "ms": 146,
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
    "id": "bdbbd4e7-6",
    "at": "2026-10-09T12:43:25.813Z",
    "route": "bdbbd4e7-1",
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
    "id": "bdbbd4e7-7",
    "at": "2026-10-09T12:43:25.839Z",
    "route": "bdbbd4e7-1",
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

Recorded at 2026-10-09T12:43:28.411Z, +3.44 s from session start. Context 18581 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":11303,"cache_read_input_tokens":7276,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":11303},"output_tokens":4,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 1: Bash (grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "command": "cd /private/tmp/e-2Bfk7S/home/cwd/repo 2>/dev/null && pwd && ls && grep -rniE \"deleteUser|delete.*user|removeUser\" src --include=*.ts -l | head -30",
  "description": "Locate user deletion code in repo"
}
```

Output: 192 UTF-8 bytes; 246 ms; tool-error=false; SHA256 `9c49b254c2166d35dd83960ff84319d43835716a8540926d6723ff3c3afb1501`.

Output excerpt; full output in JSON tool 1:

~~~text
/private/tmp/e-2Bfk7S/home/cwd/repo
README.md
appspec.yml
ci
example.env
package-lock.json
package.json
renovate.json
src
test-setup.ts
tsconfig.json
(eval):1: no matches found: --include=*.ts
~~~

### API request 2

Recorded at 2026-10-09T12:43:30.647Z, +5.68 s from session start. Context 18995 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":414,"cache_read_input_tokens":18579,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":414},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 2: Grep (Grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "pattern": "deleteUser|delete.*User|removeUser|softDelete|isDeleted|deletedAt",
  "path": "/private/tmp/e-2Bfk7S/home/cwd/repo/src",
  "output_mode": "content",
  "-i": true,
  "head_limit": 60
}
```

Output: 1873 UTF-8 bytes; 81 ms; tool-error=false; SHA256 `8ca95e49ca66ae74b1965b569a7f9825bdf06f308651407194fa304b8d7dd608`.

Paths mentioned in output (a mention is not a source-body read):

- `src/controllers/AuthController.spec.ts`
- `src/controllers/AuthController.ts`
- `src/controllers/OrganizationController.ts`
- `src/controllers/ReportController.ts`
- `src/features/hard-delete/services/hard-delete.service.ts`
- `src/utils/aws-helper.ts`
- `src/libs/okta/index.ts`
- `users/delete-user/index.js`
- `src/libs/okta/users/delete-user/index.ts`
- `src/api/Auth.ts`

Output excerpt; full output in JSON tool 2:

~~~text
src/controllers/AuthController.spec.ts:108:    const response = await AuthController.removeUser(req, res);
src/controllers/AuthController.ts:1507:  static async removeUser(req: express.Request, res: express.Response): Promise<any> {
src/controllers/AuthController.ts:1508:    let deletedUser;
src/controllers/AuthController.ts:1511:        deletedUser = await Auth.findOneAndDelete({
src/controllers/AuthController.ts:1518:    return deletedUser;
src/controllers/AuthController.ts:1522:    let delete
~~~

### API request 3

Recorded at 2026-10-09T12:43:32.718Z, +7.75 s from session start. Context 20048 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":1053,"cache_read_input_tokens":18993,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1053},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 3.

#### Tool 3: Read (Read)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "file_path": "/private/tmp/e-2Bfk7S/home/cwd/repo/src/api/Auth.ts",
  "offset": 60,
  "limit": 90
}
```

Output: 3065 UTF-8 bytes; 9 ms; tool-error=false; SHA256 `6e82316abb0dce62bcca6219b3dff47bad98ca183f6622cb33bd696175395157`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/api/Auth.ts`

Output excerpt; full output in JSON tool 3:

~~~text
60	);
61	
62	AuthRouter.post(
63	  "/getUsers",
64	  verifyAccessToken,
65	  validateRequest(...AuthValidators.orgIdMongoValidator),
66	  logRequest,
67	  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
68	    const users = await AuthController.getUsers(req, res);
69	    return res.status(200).json({ users });
70	  }
71	);
72	
73	AuthRouter.post(
74	  "/getOutstandingAuths",
75	  verifyAccessToken,
76	  logRequest,
77	  async (req: express.Request, res: expre
~~~

#### Tool 4: Read (Read)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "file_path": "/private/tmp/e-2Bfk7S/home/cwd/repo/src/controllers/AuthController.ts",
  "offset": 1495,
  "limit": 50
}
```

Output: 1568 UTF-8 bytes; 11 ms; tool-error=false; SHA256 `a7815fd53e82d50449880176e242c50623b710ce9b4b4479a75c02069c0f5850`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/controllers/AuthController.ts`

Output excerpt; full output in JSON tool 4:

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

#### Tool 5: Read (Read)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "file_path": "/private/tmp/e-2Bfk7S/home/cwd/repo/src/controllers/AuthController.spec.ts",
  "offset": 85,
  "limit": 50
}
```

Output: 1799 UTF-8 bytes; 10 ms; tool-error=false; SHA256 `82addeb65d7b27efb72fdd4450c94d1b2a82280af8bfce6f342380786acc027f`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/controllers/AuthController.spec.ts`

Output excerpt; full output in JSON tool 5:

~~~text
85	  //     });
86	
87	  //     const next = () => { return null; };
88	  //     const logoutRes = await AuthController.logoutAuth(req,res,next);
89	  //     assert.strictEqual(res, true);
90	  // });
91	
92	  it("should remove auth", async function () {
93	    sinon.stub(PermissionHelper, "hasAdminAccess").callsFake(() => Promise.resolve(true));
94	    sinon.mock(Auth).expects("findOneAndDelete").resolves({ name: "testOrg" });
95	    const request = {
96	      body: {
97	        id: "1234567",

~~~

### API request 4

Recorded at 2026-10-09T12:43:36.312Z, +11.34 s from session start. Context 23313 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":3265,"cache_read_input_tokens":20046,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":3265},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 6: Grep (Grep)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "pattern": "verifyAccessToken\\s*=|function verifyAccessToken|export .*verifyAccessToken",
  "path": "/private/tmp/e-2Bfk7S/home/cwd/repo/src",
  "output_mode": "content"
}
```

Output: 105 UTF-8 bytes; 53 ms; tool-error=false; SHA256 `f0fb99c807f16b515a3692bb4dbad9b693419bee0f42c84cd520787339092f0f`.

Paths mentioned in output (a mention is not a source-body read):

- `src/api/middleware/verify-access-token.middleware.ts`

Output excerpt; full output in JSON tool 6:

~~~text
src/api/middleware/verify-access-token.middleware.ts:11:export const verifyAccessToken = async function (
~~~

### API request 5

Recorded at 2026-10-09T12:43:38.061Z, +13.09 s from session start. Context 23686 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":373,"cache_read_input_tokens":23311,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":373},"output_tokens":16,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 1.

#### Tool 7: Read (Read)

Responsible path: Host tool selected by model; hook guard/policy surrounds the call.

Input:

```json
{
  "file_path": "/private/tmp/e-2Bfk7S/home/cwd/repo/src/api/middleware/verify-access-token.middleware.ts"
}
```

Output: 5039 UTF-8 bytes; 6 ms; tool-error=false; SHA256 `3c9276c9b9b6dedc8d64c19b5f6dfb2c6b5d8ce5f9058af6b244bdd4f4b77fe2`.

Inferred requested paths (operands, not proof all bodies were returned):

- `src/api/middleware/verify-access-token.middleware.ts`

Paths mentioned in output (a mention is not a source-body read):

- `../../utils/OriginHelper.js`
- `../../controllers/AuthController.js`
- `../../loaders/logger.js`
- `../../models/Auth.js`
- `verify-refresh-token.middleware.js`

Output excerpt; full output in JSON tool 7:

~~~text
1	import * as Sentry from "@sentry/node";
2	import express from "express";
3	import jsonwebtoken from "jsonwebtoken";
4	
5	import { OriginHelper } from "../../utils/OriginHelper.js";
6	import { AuthController, ENVIRONMENT } from "./../../controllers/AuthController.js";
7	import { logger } from "./../../loaders/logger.js";
8	import { Auth, AuthTokenPayload } from "./../../models/Auth.js";
9	import { verifyRefreshToken } from "./verify-refresh-token.middleware.js";
10	
11	export const verifyAccess
~~~

### API request 6

Recorded at 2026-10-09T12:43:45.153Z, +20.18 s from session start. Context 25866 tokens. Usage: `{"input_tokens":2,"cache_creation_input_tokens":2180,"cache_read_input_tokens":23684,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":2180},"output_tokens":3,"service_tier":"standard","inference_geo":"not_available"}`. Tools in this wave: 0.

Model text in this wave:

~~~text
## Investigation: deleting the current user on Admin → Registered Users

Nothing was edited. All findings below were read from the code.

### Likely cause
- **Self-delete has no guard.** `POST /remove` calls `AuthController.removeUser` (`src/api/Auth.ts:88-97`). `removeUser` only checks `PermissionHelper.hasAdminAccess(res)`, then runs `Auth.findOneAndDelete({_id: req.body.id})` (`src/controllers/AuthController.ts:1507-1519`). Nothing compares `req.body.id` with `res.locals.user._id`, so an admin can delete their own account.
- **The session survives the delete.** `verifyAccessToken` verifies the JWT, then runs `const user = await Auth.findOne({_id: userId})` followed by `if (user !== undefined) res.locals.user = user;` (`src/api/middleware/verify-access-token.middleware.ts:33-34`). Mongoose's `findOne` returns `null` for a missing document, not `undefined`. After the user is deleted, `res.locals.user` therefore becomes `null` and `next()` still runs. Every later handler that reads `res.locals.user._id` or `.organization` is then working with a deleted user.
- **Inference, not verified by running it:** this is the most likely mechanism for "breaks the entire env". The refresh branch of the same middleware already returns 401 when the user isn't found (`verify-access-token.middleware.ts:78-80`). The main branch doesn't.
- **Not confirmed in the code:** the frontend (the Admin tab) isn't in this repo. Whether it logs the user out after a delete is an assumption. The ticket's UI behaviour would need the client side checked separately.
- **Related gap, not part of the ticket:** `/disable` (`src/api/Auth.ts:110-119`, `AuthController.ts:1521-1536`) also has no self-check. It only sets `isActive: false` and doesn't delete the record.

### Files to touch (existing, edits)
- `src/controllers/AuthController.ts`: the main fix. In `removeUser`, reject the request when `req.body.id` equals `res.locals.user._id` (for example a 400/403 with a message). Optionally apply the same guard to `disableUser`.
- `src/api/Auth.ts`: the `/remove` handler always returns `200 { removedUser }` (lines 94-95). If `removeUser` starts rejecting, the handler needs to propagate the error status. `removeUser` currently swallows errors and returns `undefined`.
- `src/api/middleware/verify-access-token.middleware.ts`: harden the access-token path. Return 401 when `user` is `null` instead of assigning it to `res.locals.user`. This covers other ways a session can outlive its user, such as deletion from another session or the hard-delete flow.
- `src/controllers/AuthController.spec.ts`: the existing `should remove auth` test (lines 92-110) stubs `hasAdminAccess` and mocks `findOneAndDelete`. Add a test that deleting your own id is refused and `findOneAndDelete` isn't called.

### Possibly needed (assumptions)
- A spec for `verify-access-token.middleware.ts`. I didn't search for an existing one. If none exists, it would be a new file, e.g. `src/api/middleware/verify-access-token.middleware.spec.ts`.

### Not needed
- `src/libs/okta/users/delete-user/index.ts` and `src/features/hard-delete/services/hard-delete.service.ts`. These are the org-level hard-delete flow and not the admin tab's `/remove` path.
- `src/api/Report.ts` and `src/controllers/ReportController.ts` (the map's keyword leads). They are unrelated to user deletion.

No files need to be created or deleted, apart from the optional middleware spec above.

## Files
- src/controllers/AuthController.ts
- src/api/Auth.ts
- src/api/middleware/verify-access-token.middleware.ts
- src/controllers/AuthController.spec.ts
- src/api/middleware/verify-access-token.middleware.spec.ts
~~~

## Artifact data leaving the route

The final investigation answer is copied to an investigation note; plans are scored from the captured plan artifact; tasks from the captured patch. Review scores use the grader/review contract, not the investigation file extractor.

- [Export provenance](../../../../../../ambicode-evals-assets/outputs/core/2026-10-09/15_1241_curated-ambicode-with-prompt-sonnet-5-5/traces/exports/076a271b-8a70-4247-bbad-f32265999143/investigate-files-request-need-touch/source.json): 2 artifact files.

Artifact checks (present/size/hash and ledger entry count): pass. Exact source → exported destination, byte count/hash and validation are in the attempt JSON.

Correct historical paths:

- `src/controllers/AuthController.ts`
- `src/api/Auth.ts`
- `src/controllers/AuthController.spec.ts`

Named non-truth paths:

- `src/api/middleware/verify-access-token.middleware.ts`
- `src/api/middleware/verify-access-token.middleware.spec.ts`

Final model answer:

~~~text
## Investigation: deleting the current user on Admin → Registered Users

Nothing was edited. All findings below were read from the code.

### Likely cause
- **Self-delete has no guard.** `POST /remove` calls `AuthController.removeUser` (`src/api/Auth.ts:88-97`). `removeUser` only checks `PermissionHelper.hasAdminAccess(res)`, then runs `Auth.findOneAndDelete({_id: req.body.id})` (`src/controllers/AuthController.ts:1507-1519`). Nothing compares `req.body.id` with `res.locals.user._id`, so an admin can delete their own account.
- **The session survives the delete.** `verifyAccessToken` verifies the JWT, then runs `const user = await Auth.findOne({_id: userId})` followed by `if (user !== undefined) res.locals.user = user;` (`src/api/middleware/verify-access-token.middleware.ts:33-34`). Mongoose's `findOne` returns `null` for a missing document, not `undefined`. After the user is deleted, `res.locals.user` therefore becomes `null` and `next()` still runs. Every later handler that reads `res.locals.user._id` or `.organization` is then working with a deleted user.
- **Inference, not verified by running it:** this is the most likely mechanism for "breaks the entire env". The refresh branch of the same middleware already returns 401 when the user isn't found (`verify-access-token.middleware.ts:78-80`). The main branch doesn't.
- **Not confirmed in the code:** the frontend (the Admin tab) isn't in this repo. Whether it logs the user out after a delete is an assumption. The ticket's UI behaviour would need the client side checked separately.
- **Related gap, not part of the ticket:** `/disable` (`src/api/Auth.ts:110-119`, `AuthController.ts:1521-1536`) also has no self-check. It only sets `isActive: false` and doesn't delete the record.

### Files to touch (existing, edits)
- `src/controllers/AuthController.ts`: the main fix. In `removeUser`, reject the request when `req.body.id` equals `res.locals.user._id` (for example a 400/403 with a message). Optionally apply the same guard to `disableUser`.
- `src/api/Auth.ts`: the `/remove` handler always returns `200 { removedUser }` (lines 94-95). If `removeUser` starts rejecting, the handler needs to propagate the error status. `removeUser` currently swallows errors and returns `undefined`.
- `src/api/middleware/verify-access-token.middleware.ts`: harden the access-token path. Return 401 when `user` is `null` instead of assigning it to `res.locals.user`. This covers other ways a session can outlive its user, such as deletion from another session or the hard-delete flow.
- `src/controllers/AuthController.spec.ts`: the existing `should remove auth` test (lines 92-110) stubs `hasAdminAccess` and mocks `findOneAndDelete`. Add a test that deleting your own id is refused and `findOneAndDelete` isn't called.

### Possibly needed (assumptions)
- A spec for `verify-access-token.middleware.ts`. I didn't search for an existing one. If none exists, it would be a new file, e.g. `src/api/middleware/verify-access-token.middleware.spec.ts`.

### Not needed
- `src/libs/okta/users/delete-user/index.ts` and `src/features/hard-delete/services/hard-delete.service.ts`. These are the org-level hard-delete flow and not the admin tab's `/remove` path.
- `src/api/Report.ts` and `src/controllers/ReportController.ts` (the map's keyword leads). They are unrelated to user deletion.

No files need to be created or deleted, apart from the optional middleware spec above.

## Files
- src/controllers/AuthController.ts
- src/api/Auth.ts
- src/api/middleware/verify-access-token.middleware.ts
- src/controllers/AuthController.spec.ts
- src/api/middleware/verify-access-token.middleware.spec.ts
~~~


