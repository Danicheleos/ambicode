# it-003 — WP2 requirements envelope: pin the MCP server, CLI-stamped `receivedAt`, per-file size pre-flight in `prepare`
WP: WP2 (01 §4), items 1–3 in one iteration; item 4 (cache per `updatedAt`) dropped, reason below
Base: `gym/R1/it-002` (`34284c4`); campaign HEAD at brief time `01f626f` (campaign files only since the tag)
Seams:
- item 1 (pin `requirements.mcpServer` after the first answer): `src/cli/commands/init.ts:10` (`INIT_OPTIONS`), `src/config/init.ts:117-126` (`updateExisting`, which already writes the config and keeps comments); `skills/shared/requirements-mcp.md` step 1
- item 2 (the CLI records `receivedAt`; the session never has to supply a `retrievedAt`): `src/contracts/requirements.ts:11`; `src/requirements/normalize.ts:16-17,184-253`; the consumers `src/review/report.ts:88`, `src/review/prompt.ts:219`, `src/page/view-model.ts:62,246`, `templates/review.eta:88`; `skills/shared/requirements-mcp.md` envelope example
- item 3 (per-file size pre-flight in `prepare` for positional paths and `git status` paths): `src/cli/commands/prepare.ts:40-45,73,371` (`notices`), the ceiling `MAX_SNAPSHOT_FILE_BYTES` and the refusal text at `src/snapshot/snapshot.ts:53-78`

## Why one iteration for three items
02 §3.1 wants one seam per iteration, and splitting is allowed. The L-009 answer ($250, 2026-09-29T03:24:22Z) buys one T2 control for WP2: L-009 costed one WP2 iteration at ≈ $85, and ≈ $144 is left under the $225 stop. The WP2 row names T2 as a must-not-move control, and 0 of 19 T2 cases mention a requirement URL, Jira or Confluence (`grep -rliE 'jira|confluence' evals/evals-core/cases | wc -l` → 0; `grep -rlE -e '--requirement|--evidence|atlassian\.net|/browse/' …` → 0). So T2 can exercise item 3 only. If each item had its own iteration, items 1 and 2 would go without a measured control, or cost ≈ $85 each. Here they share the one control sweep, on a commit that holds all three. The cost is attribution: a T2 regression rejects all three, and the rerun splits them.

## Item 4 dropped
A cache of fetched sources keyed by `updatedAt` cannot reduce fetches. The session learns `updatedAt` only by fetching (the CLI never fetches: `src/requirements/normalize.ts:16-17`). The one writing command that sees the envelope, `review`, runs after the fetch. `prepare` promises to write nothing (07 K3). `skills/shared/requirements-mcp.md` "There is no evidence file to own" forbids the session from keeping the envelope on disk. A cache that skips the fetch would serve stale requirements without checking them, which trades one T4 metric (re-fetches, report-only in 01 §1) for the correctness of the review. This goes into `decision.md` as an explicit drop (02 §7 WP exit).

## Claim
T4 only (03 §4 row 1): fabricated provenance fields 4/4 sessions → 0; refused review launches 1 per task session → 0; MCP-server questions 3/4 → 0 after the first answer. T4 cannot be measured until a human-run cycle exists (01 §3 T4, 01 §1 item 6), so what this iteration measures is each claim reproduced as a failing test that then passes (CLAUDE.md "Reproduce before you fix"):
1. `ambicode init --mcp-server <name>` on an existing config sets `requirements.mcpServer` and keeps comments. Same value again: no change. A different bound value: refused, the binding is not overwritten.
2. An envelope with no `retrievedAt` normalizes, and every source carries `receivedAt` = the injected clock. An envelope that supplies `receivedAt` is refused. Report, prompt and page print "received … by AMBICODE", and print `retrievedAt` only when the session supplied one.
3. `prepare` with a positional path, or a `git status` path, larger than 262,144 bytes emits a notice. The notice names the path and its byte count and gives the `--exclude "<path>"` line the review refusal would give. Paths under `review.excludePaths` are not flagged. `prepare` still writes nothing.
G1 `tests` ≥ cp-1 + 3 = **755** (cp-2 criterion; cp-1 = 752, `it-002/metrics.json`).

## Must not move
T2 localize with-arm F1 and review with-arm recall/`helper-ran` within noise of cp-0 (01 §3 signal rules; without-arm as the drift control); T1 (7 scored cases 1.0, `url-bare` investigate 3/3); T3 median findings per case within ±2 of cp-1; G2, G3.

## Measurement plan (02 §3.5), in order
1. G1–G3 ($0) → `verify.log`.
2. T1 (≈ $4.2), because `skills/**` changes (02 §4). No `SKILL.md` frontmatter is touched.
3. `npm run evals:preflight` (≈ $0.4).
4. T2 at **3 runs/arm directly, with no screening sweep**, `--model claude-opus-5-5` (≈ $59, from the baseline's per-run costs). Why no screening: the screening sweep exists so a decision sweep is not spent on a change that already lost (02 §3.5 step 3). The only T2-visible change is a notice that appears only when a file is over 262,144 bytes, so a loss is unlikely. Going direct costs $59 instead of $78.7 when the result is a go, and it keeps the decision free of the optional-stopping bias that folding a screening run into it would add. L-002's "economize" instruction applies. Comparisons of review with-arm numbers name the recording swap of it-001 (its brief, "Known side effect").
5. T3 re-record, 3 recordings × 8 cases, `--exclude 'main/assets/i18n/**'` (≈ $2–3 at it-001's per-recording cost), because `src/review/` changes (02 §3.5 step 4).
6. T4: `null` (no new human-run cycle); L-* entries filed for the first human cycle after this build (cp-2).
The verifier re-runs G1 and re-extracts every T number before the decision.

Budget for this iteration: **$90** (T1 4.2 + preflight 0.4 + T2 59 + T3 3 + worker/verifier/lead ≈ 12, rounded up; S2 stops at 2× = $180).
Files allowed to change: `src/contracts/requirements.ts`, `src/requirements/**`, `src/review/report.ts`, `src/review/prompt.ts`, `src/page/view-model.ts`, `templates/review.eta`, `src/cli/commands/init.ts`, `src/config/init.ts`, `src/cli/commands/prepare.ts`, `src/snapshot/**` (only to share the size check with the refusal), `src/testing/**`, `**/*.test.ts` beside these, `skills/shared/requirements-mcp.md`, `docs/**`. `templates/` is not in the list of 02 §3.3, and it is not in that list's "never" set either. It is the page view of the same field item 2 changes, so it is named here rather than left printing `retrieved null`.
Rollback: the plugin is not changed on the campaign branch until the decision, because the worker works in its own worktree. So a reject discards the worker branch and worktree, and commits only the campaign files. If the diff has already been applied: `git reset --hard 01f626f` (that is `gym/R1/it-002` plus campaign-file commits `ef73df7`, `01f626f`; `git diff --stat gym/R1/it-002 01f626f -- . ':!gym'` is empty), and only after `git diff --stat` shows nothing but this change.

## Addendum (2026-09-29, after the worker's first diff, before the gate)
The globs above missed two call sites of the change they allow. The lead adds them here, with the reason, rather than respawning the worker (04 §5 row 4), because in both cases the defect is the lead's brief, not scope creep:
- `src/review/bundle.ts`: +1 line, `clock: runtime.clock`. `normalizeRequirements` is called from `prepare.ts` and `bundle.ts`, and item 2 gives it a required clock.
- `src/cli/main.ts`: the `USAGE` lines for `init --mcp-server`. Every declared option has a help line there. Without one, item 1's option is undocumented in `ambicode --help`.
Not added: `skills/init/SKILL.md` (T1 surface; its "write that name" text still works). `src/git/git.ts` (the existing `status()` already runs `--porcelain -z --untracked-files=all`, `src/git/git.ts:104-106`).
