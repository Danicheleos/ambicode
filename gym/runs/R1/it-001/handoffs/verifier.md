# verifier handoff — it-001 (T3 re-record of the 8 curated review cases)

HEAD 1a693baf257ffee405415ce655eb4533988cbcdf (= `gym/R1/it-000`). Working tree before and after: `?? gym/runs/R1/it-001/` only. No eval, no `evals:record`, no claude command, no spend.

## Ran
- `npm run verify` (re-run, $0; output filtered in a shell variable) → exit 0. tests 752, pass 751, fail 0, skipped 1; "Validation passed"; Archive sha256 c8c5b7b3f57e8785fb26207e4beac2aea8f00eaaa3dc8ee61591f08c0efdec7f.
- `node check-line-endings.mjs` → exit 0, "480 tracked text file(s)".
- `cat` of `it-001/scratch/record-1.log`, `record-2.log`, `record-3.log`, `g2.log`; filtered grep of `it-001/verify.log` (ANSI stripped) → exit 0.
- `git diff gym/R1/it-000 -- . ':!gym' | wc -l` → 0. `wc -c it-001/diff.patch` → 0 bytes. `git diff --stat 6bde81c HEAD -- prompts policies src/review | wc -l` → 0. `git rev-parse gym/R1/it-000 HEAD` → both 1a693baf…
- `shasum -a 256` of `benchmarks/reviewer-recordings.json` and `gym/runs/R1/archive/benchmarks__reviewer-recordings.json` → exit 0.
- jq over both recordings files (case, model, recordedFrom, snapshotId, findings length) → exit 0.
- `grep`/`sed` over `evals/scripts/src/evals-record-core.mjs` (how the file is merged) and `gym/plan/01-*.md` (baseline cost range) → exit 0.
- `ls evals/evals-core/cases | grep review` → 8 review case directories.
- One stray no-op: a `mkdir -p /dev/null` that I typed by mistake; it created nothing (`/dev/null` exists), and the it-001 listing after it shows no new entry.

## Numbers
| field | value | source |
|---|---|---|
| G1 (lead's log) | 752 / 751 / 0 / 0 cancelled / 1 skipped, duration_ms 20694.22, `exit=0 seconds=26`, Validation passed, sha c8c5b7b3…efdec7f | `it-001/verify.log:1033-1068` |
| G1 (my re-run) | 752 / 751 / 0 / 1, exit 0, same sha | `npm run verify` |
| G2 | last line: "Reproducible: 50 files, ... identical zip sha256 (c8c5b7b3f57e8785fb26207e4beac2aea8f00eaaa3dc8ee61591f08c0efdec7f) across two independent runs." | `it-001/scratch/g2.log` |
| G3 | exit 0, 480 files | my run; metrics.json says 480 |
| plugin diff | `git diff gym/R1/it-000 -- . ':!gym'` 0 lines; `diff.patch` 0 bytes; `git diff --stat 6bde81c HEAD -- prompts policies src/review` empty | git |
| log exits | record-1 exit=0 seconds=201; record-2 exit=0 seconds=213; record-3 exit=0 seconds=104 (sum 518) | logs |
| log write lines | each: "wrote 8 recording(s) ...; refused 0"; 0 rejections on every case line | logs |
| new recordings | 8 + 8 + 3 = 19 | log case lines |
| summed cost per log | record-1 $0.82; record-2 $0.82; record-3 $0.39; total $2.03 (recorder prints 2 decimals) | log arithmetic |
| summed per-case seconds | record-1 804; record-2 852; record-3 312 (per-case sum 1968; the 518 above is the wall clock at `-j 4`) | log arithmetic |
| recordings in `benchmarks/reviewer-recordings.json` | 8 (8 distinct cases, all of `evals/evals-core/cases/*review*`), model sonnet in all, keys `recordings` and `schemaVersion` | jq |
| sha256 of that file | 6b7157a5bdfbc58b7050546211da14b15c0b3884b8778d64b6b7703596d0463c (= metrics `fileSha256After`) | shasum |
| baseline copy sha256 | c6022188b670773cc15e27d254270e87ed3ec3fa5ae4ef8932b9442a0ac666af (unchanged; rollback source intact) | shasum |

Per case (order in logs: baseline recording where one exists, then record-1, record-2, record-3 for the three FE cases; costs and seconds are the new recordings only):
| case | findings | median | new $ | new s | file entry findings / recordedFrom time | last log line | match |
|---|---|---|---|---|---|---|---|
| be-vs-3571-review-1128-957b6388 | 4, 2, 6 | 4 | 0.14, 0.18 | 87, 104 | 6 / 02:58:52Z | record-2: 6 | yes |
| be-vs-5075-review-1054-3b24bb74 | 4, 4, 5 | 4 | 0.07, 0.06 | 87, 80 | 5 / 02:59:29Z | record-2: 5 | yes |
| be-vs-5546-review-996-d520e3ca | 6, 6, 5 | 6 | 0.10, 0.07 | 80, 80 | 5 / 02:58:31Z | record-2: 5 | yes |
| be-vs-6261-review-1141-f14493f1 | 1, 2, 2 | 2 | 0.09, 0.07 | 101, 90 | 2 / 02:59:21Z | record-2: 2 | yes |
| fe-vs-6253-review-2557-1b0a7eaf | 6, 3, 4 | 4 | 0.07, 0.10 | 114, 123 | 4 / 03:00:26Z | record-2: 4 | yes |
| fe-vs-6086-review-2553-d1f112e5 | 3, 2, 5 | 3 | 0.12, 0.10, 0.10 | 121, 133, 104 | 5 / 03:02:29Z | record-3: 5 | yes |
| fe-vs-6086-review-2553-d7c43dc5 | 4, 3, 2 | 3 | 0.09, 0.10, 0.10 | 114, 133, 104 | 2 / 03:03:25Z | record-3: 2 | yes |
| fe-vs-6292-review-2537-3a49a0d3 | 2, 2, 5 | 2 | 0.14, 0.14, 0.19 | 100, 109, 104 | 5 / 03:02:48Z | record-3: 5 | yes |

All eight recordedFrom strings read "evals-record-core 2026-09-29T… plugin 0.3.4 --exclude main/assets/i18n/**". The baseline five are recording #1 = 4, 4, 6, 1, 6 (baseline `metrics.json` T3.perCase, and the archived file). Every per-case findings array, median, newCostUsd and newSeconds in `it-001/metrics.json` equals my values above. Medians: 4, 4, 6, 2, 4, 3, 3, 2.

Snapshot ids: the five baseline recordings and the five new entries carry the same snapshotId per case (36f3d9d0…, cb56dcae…, 6b833f10…, aeb14693…, f215ecac…), so `--exclude` did not change them. `evals-record-core.mjs:139-152` keeps recordings in a Map keyed by snapshotId, so each run replaces the entry for a case, which is why the write lines say 8 and not 13.

Baseline cost range cited in the notes ($0.33–0.67, 126–772 s) appears at `gym/plan/01-*.md:97`, citing `cache/record-2.log`; I did not open that log.

## Could not do
- Could not compare the content of any recording other than the last per case: recordings 1 and 2 (and for the 5 baseline cases, recording #1 in the live file) exist in the repo only as finding counts in the logs. The baseline #1 for the five cases survives in the archive copy.
- Costs are the recorder's 2-decimal log values; nothing more precise exists (recorder writes no cost JSON), so the $2.03 total is good to about ±$0.10 as the notes say.
- The 3-5x cost and time drop against baseline was not investigated (out of scope). Note it is confounded by concurrency: these runs used `-j 4`; I did not check the concurrency of the baseline recording.
- Did not run T1, T2, T4 (skipped by the brief; none applicable).

## Disagreements
| field | lead's value | yours | source of difference |
|---|---|---|---|
| brief claim "3 recordings per case" (and metrics `T3.recordingsPerCase: 3`) | 3 per case | 3 recorder runs per case, but the artifact holds 1 per case | `benchmarks/reviewer-recordings.json` has 8 recordings, one per case: recordings are keyed by snapshotId and each run overwrites (`evals-record-core.mjs:140-152`). Only the last of the 3 per case is stored; the other two survive as finding counts in the logs. Any T2 review with-arm sweep replays one recording per case. The number of recordings that exist and can be replayed is 8, not 24. Claim "8/8 recorded": agree. |

All other metrics.json fields agree: G1, G2, G3 (480), T3 newRecordings 19, reusedRecordings 5, per-case findings/medians/costs/seconds, refused 0, rejections 0, costUsd 2.03, seconds 518, fileSha256After, and the empty plugin diff.

The metrics note "recordings replaced 5 old ones, not 13" and "the file holds record-2's for 5 cases and record-3's for 3" both agree with the file.

## Claims without evidence
- "A 3–5× drop with the reviewer code unchanged is unexplained": the arithmetic is right in the logs (baseline $0.33–0.67 vs new $0.06–0.19), the explanation is not established, and the drop may include effects of `--exclude` and of concurrency.
- "the recorder deletes its temp dirs, so the per-review usage is gone": not checked.
- metrics `models.agent: null` and `models.judge: null`: recorder logs do not name either.
