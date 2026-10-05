# Step 00 — Repair and instrument the evaluation harness

## Assignment

Prerequisite: current repository only. Own `evals/scripts/src/evals-bench.mjs`,
`eval-gate.mjs`, `naked-arm.mjs`, `run-validity.mjs`, their tests, reuse helper validation,
`package.json` eval scripts,
`evals/evals-core/README.md`, and measurement provenance. No route or product behavior.
Default spend $0; probes are separate authorized items. Read 00-README and 01-contracts.

Read v6/33 §0–2, §7; v6/30 §6; v6/41 step 0; evals-core README;
`withBaseline`, `runArgs`, `writeCase`, `harvestTraces`, `traceMetrics`,
`score`, `writeWalk`, `infrastructureError`, `buildNaked` and `invalidRuns` in the existing
harness and their tests. Eval optimizations from commit ae45901 are already implemented;
extend them rather than rebuilding or reverting them. Keep archived eval unchanged.

## Work in order

### 1. Validate the actual starting point

The four reuse helper/test files are tracked at the inspected HEAD. Read them, verify imports,
run their affected tests and the harness test, then `npm run verify`. Do not claim the historical
M22 failure is current without reproduction. If a file is absent on the dispatched revision,
inspect stash contents by path, identify the stash commit containing that exact file, and
restore only missing paths after checking for unrelated content. Never use a bare historical
ordinal, pop/drop a stash or overwrite a modified file.

Record current Claude version with a metadata-only command when available. Read baseline
metadata locally: partial flag, model, version, case/arm counts and normalization booleans only.
Working baseline: `evals/evals-core/results/eval-2026-10-04T19-44-56-791Z.json`:
Claude Code 2.1.289, claude-sonnet-5-5, naked plugin, 18 cases ×3 =54 runs, not partial.
The user authorized this replacement after v6 was written. The 2026-10-02 baseline remains
historical evidence; do not use its version or noise band as the current gate constants.
Do not echo prompts, tickets or case identities. Missing local baseline is a measurement
prerequisite, not a reason to synthesize a reference or run another baseline.

### 2. Reuse the implemented baseline and validity seams

Preserve `naked-arm.mjs`: it builds an empty plugin at .tmp/naked, excludes forced twins,
copies case files and maintains the scaffold's benchmark symlink. This control-copy mechanism
already exists and is distinct from section3's per-arm prompt transport inside the product
eval cases. Do not copy the naked plugin's machinery to introduce a second prompt switch.

Preserve `withBaseline` automatic reference-arm selection: a baseline whose plugin is naked
uses its recorded arm with as the logical no-plugin control; historical ordinary baselines use
without. Do not require --baseline-arm with for the new baseline. Printed provenance names
the actual source arm and baseline identity, so “without” is a comparison role, not a fabricated
claim that the harness executed a true without arm.

Keep prompt/model/version/case/partial/arm refusals and existing forced-to-neutral prompt checks
until twins are removed in section4. Tests preserve automatic naked selection and explicit
historical arm behavior. Later typed plugin prompts still record naked promptMarkdown for
compatibility and actual served pluginPromptMarkdown separately (section3).

**The historical 0-V bypass is superseded; version management remains pending.**
Check the baseline/tool versions before measurement and report the decision early.
No pin, install, downgrade or new paid baseline is authorized. If versions differ, A waits
for a new instruction; independent implementation continues. Do not implement --accept-baseline-version or a bypass
for 2.1.287. A run on a different version from the new baseline still refuses. Finish independent
work and report the mismatch; only the user may choose a version pin, another baseline or an
explicit separately scoped exception. Never silently update baseline or install an older binary.

Preserve the implemented error classification shared by score/gate and run-validity:
infrastructure failures (lost login, session quota, interrupted run, scaffold failure) are
absent measurements; the arm's own turn/time limit remains an arm outcome. Do not blanket-mark
every run.error absent or convert an infrastructure failure into recall 0.
Retain regression fixtures for both classes and their grader-evidence behavior. Trace/ledger
scoring additions must not overwrite this classification. Trigger execution keeps JSON
output and run-validity validation; step 03 retires evals:triggers:gate and later skill owners
convert their positive cases into negatives; a failed negative case is not a successful “nothing fired”.
The current classifier recognizes turn/timeout strings; new error shapes need synthetic
fixtures and an explicit decision about which class they represent, not an expanded regex
that hides infrastructure failures.

The user declined the paid naked-vs-true-without equivalence test. Do not run it, ask again,
or block model-free migration on it. Use the new baseline as the user-approved working reference
and report the equivalence assumption as unverified in every claim gate. Old/new recall agreement
is not proof of equivalence because versions and runs differ. Do not label this baseline a
validated true-without arm.
The operational README now records the user's refusal (updated with this hand-off); retain it.
Add `eval-gate.mjs` info output whenever the reference baseline plugin is `naked`:
“naked/without equivalence unverified”. Test that the notice appears for naked references
and is not claimed for ordinary historical baselines. This is a step 00 runtime deliverable.

Add `--benchmarks <absolute path>` to `naked-arm.mjs` through its existing builder API,
defaulting to its current location. Test with a synthetic external benchmark root. Use
00-README's PRIMARY protocol; no NDA generation or control-builder invocation in a worktree.

### 3. Per-arm prompt transport

Keep generated naked `prompt.md` bytes unchanged. Generate `prompt.with.md` for localize
cases: replace only the first body line with
`/ambicode:investigate --headless <original first body line>`; preserve remaining body and
front matter. No `--requirement`; sandbox uses args evidence.

Inspect local help/schema or authoritative platform documentation if needed for prompt-file
selection. Help is metadata only. **Do not execute plugin eval to discover schema support**:
unknown schema keys, failing scaffolds and `--max-cost-usd 0` are not a free dry run.

Use supported prompt-file selection if proven from those sources (Mechanism A).
Otherwise use the documented swap fallback (Mechanism B): generate byte-copy
`prompt.naked.md`; before plugin-only execution write a recovery marker and swap in with-prompt;
restore in `finally`. Interrupted swap is detected before a later run and restored from the
saved naked copy. Selection refuses an outstanding marker unless explicit `--regenerate`
recreates the cases. No copied eval directory; scaffolds depend on relative locations.

Refuse `run --prompt with` with a naked or two-arm ablation **before spawning**.
Capture the served body before swapping/restoring. After execution store naked body-after-front-
matter trim as `promptMarkdown` and actual served body as `pluginPromptMarkdown`;
record `suite.servedPrompt`. Do not obtain either text from the baseline.
Gate/walk reports state the served prompt, actual reference arm and baseline version;
naked/without equivalence remains an explicit unverified assumption.

Step 08 owns generating the review `prompt.with.md` through this exact transport; expose the
generator hook now and add a synthetic review test. Step 07 uses the same transport for task
cases. No agent creates another swap mechanism.

Extend `buildNaked` to exclude prompt.with.md, prompt.naked.md, swap markers and any
platform per-arm prompt key in case.yaml. Refuse to build while a source swap marker is
outstanding; recover it through the shared swap recovery before rebuilding. Test a synthetic
case carrying both prompt files and a per-arm key: its naked copy has the generator's
byte-identical prompt.md and no plugin prompt selector. Test outstanding-marker refusal
separately. The control copy must never serve an interrupted plugin prompt.

### 4. Remove forced twins and introduce true dry run

Delete forced review twins and forced scorer branches. Remove `--forced` from `select` and
all six curated eval scripts that pass it; a leftover flag refuses with a migration message.
Use `--regenerate` for interrupted-generation recovery, not a repurposed forced flag.
Preserve selection criteria and naked prompt generator. Curated selection is **18 cases**
(5 localize + 4 review per side), with 10 localize and 8 review. The current naked baseline
already contains these 18 neutral cases; the historical 26-case baseline included 8 twins.
Current select/decide still create forced twins: remove them without removing the new control
builder, neutral generator or reference-arm detection. The baseline npm script also still passes
--forced to select: remove that flag together with the other affected scripts. Compare current
cases against matching current baseline cases. Update operational counts/cost estimates.
Do not edit frozen v6's historical 26-case wording. This hand-off records the discrepancy.

For the proposed investigate-only decision, narrow execution with the existing tag filter
(`run … --tag localize`). The gate already reports per kind and withBaseline matches only
the run's own cases; add no new --kind flag. Test that localize-only results against the
18-case baseline yield localize checks only. Full curated generation remains 18; step 08
owns later live review measurement. The user confirms this population before paid decide.
Verify the existing walk tag combines with localize as an intersection; if the platform's
tag semantics differ, select the synthetic-tested walk/localize intersection through the
existing case-selection seam rather than accidentally running review cases.

Add `run --dry-run`: resolve cases, served prompts, argv, model, caps, ablation and trust
prerequisites; print a sanitized execution plan; exit without model/LLM grader/network spawn
or prompt mutation. Test with a runner that fails if called. Dry run cannot claim hook support.

### 5. Ledger and trace scoring

Extend `harvestTraces` with temp-then-rename copy of sandbox task ledgers alongside traces.
Preserve source provenance so slugs from distinct runs do not overwrite each other.
Add v6 fields: map-layers, map-pass2, route-steps separated by status, revises,
gates by class/via, **preanswers**, stop-blocked, check-red-green, envelope-builtFrom,
permission-denied, peak-context, cost, turns and no-route MCP spawn count when observable.
Absent kind/usage field = null; no empty-success values. Peak context comes from trace usage,
not ledger length. Red/green follows summary validity, not exit alone.
Use synthetic v6 records including instance/object binding. No live route exists yet.

### 6. Authorized launch probes and reviewer feasibility

Each probe requires its named ceiling in dispatch. Save only synthetic payload shapes and
redacted metadata. Record support separately, never infer all launch surfaces from one.

| Probe | Required observation | Downstream consequence |
|---|---|---|
| P37(a) | typed command expands and prompt hook fires interactively | user launch supported |
| P37(b) | same inside plugin-eval sandbox | acting sandbox preanswers trusted only if hook fires |
| P37(c) | same under `claude -p` user's prompt | S2/plan preanswer real-use path |
| P58 | per-run harness token reaches model Bash children; verify a synthetic authorized start | sandbox fallback may be harness channel only when validated |
| P47 | PreToolUse updatedInput actually changes command | optional task convenience; hard prerequisite if 0-S selects it for session transport |
| P-S | In interactive launch and P37 sandbox, determine whether environment binding, updatedInput or a hook-written association conveys session_id to a Bash child; record mechanism, never the value; test concurrent-session isolation | User chooses 0-S; no proven mechanism blocks routed CLI integration and paid walk/decide, not injected-session unit tests |
| 0-R | nested reviewer can authenticate with allowlisted env, or cannot | choose credential transport vs external live runner |

P-S shares the P37/P58 sandbox case and its ≤ $1 ceiling; it adds no implicit authorization.
Interactive coverage needs its own named ceiling if it adds calls.
P37/P58 share the same ≤ $1 sandbox case where possible; interactive/-p coverage that costs
extra must be separately capped, not silently covered by that $1. P47 ≤ $0.10 if authorized.
0-R feasibility ≤ $1 if authorized; never print credential values. Do not add inherited ambient
secrets beyond the existing reviewer allowlist. Default recommendation is the external runner
unless passthrough is proven and requires only the documented seam.

If probes are not authorized, report pending and continue sections 1–5 and 7.
A fallback start is CLI/untrusted until P58 proves harness transport. No spoofable
`--channel harness` option; 01-contracts specifies the boundary.

### 7. Measurement provenance

Re-run `measurements-2026-10-03/compare.mjs` only when its local snapshots/tools exist;
save redacted `compare.log`, counts/timings and command/environment. This is no model spend.
Do not install a new index dependency as part of this step. Missing tools/snapshots are pending
measurement inputs. Do not promote old unlogged figures to logged facts. Update its README
provenance, not frozen v6.

## Tests and acceptance

Tests prove: naked bytes unchanged; served/naked recorded separately; wrong ablation refuses;
swap recovery after thrown spawn and simulated interruption; dry run never spawns/mutates;
cached prompt/model/version mismatch still refuses; automatic naked reference-arm selection;
infrastructure failures absent and own-limit outcomes preserved; triggers fail on invalid runs;
no forced twins; 18 curated
count on synthetic selection inputs; ledger copy-out and null metrics; no NDA values tracked.
Run affected node:test files then `npm run verify`.

Hand off harness APIs, dry-run output, baseline metadata availability, prompt mechanism,
probe matrix and 0-R evidence, reused validity behavior and baseline equivalence limitation.
No walk/decide/baseline or naked-equivalence run belongs to this assignment.
Implementation may be ready while all paid probes remain pending.
