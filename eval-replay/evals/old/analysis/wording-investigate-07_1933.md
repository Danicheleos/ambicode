# Read-step wording run, investigate, 2026-10-08 (07_1933)

Change: `routes/investigate/read.md` opens the map's leads in one `read` call before any search; no Read or cat.
Run: plugin arm, Sonnet 5.5, effort low, 20 cases x 3, vs baseline.lock. Log: `wording-investigate-run.log`.

```
                     prev (06_1853)   this (07_1933)   lock (bare)
gate                 PASS             FAIL (cost)
recall               0.520            0.529            0.494   (band 0.056)
precision            0.672            0.697            0.709
f1                   0.524            0.551            0.530
cost / run           $0.215           $0.253           $0.219  -> 1.1538x (budget 1.1x)
turns                9.4              10.3             10.1
peak context         38,348           43,644
ambicode read / run  0.45             1.73
Read tool / run      0.60             0.03
Grep tool / run      1.42             0.97
```
Cost-case flags: 6 cases at 1.29-1.47x (previous run: 1 at 1.24x).
