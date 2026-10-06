# Data gaps in `evals/benchmarks/`

The side of a case is its benchmark project (`BE` → `BE-express`, `FE` → `FE-angular`). Every generator reads:

```text
<benchmarks>/<project>/.git/                        history (task and reuse base scaffolds)
<benchmarks>/<project>/project/<code root>/         the code (`src/` for BE-express, `main/` for FE-angular)
<benchmarks>/<project>/project/.ambicode/config.yaml
<benchmarks>/<project>/assets/<ticket>.md           ticket text + true related code
<benchmarks>/<project>/reviews/<ticket>/<version>/  prepared review versions
<benchmarks>/<project>/cases/                       the generated full set
```

Still missing on disk:

| Missing | Needed by | Effect |
| --- | --- | --- |
| `BE-express/project/.ambicode/config.yaml`, `FE-angular/project/.ambicode/config.yaml` (python has one) | every snapshot scaffold and `generate`/`select` | the scaffold's `cp "$SIDE/.ambicode/config.yaml"` fails; `generate` refuses the project |
| `<project>/reviews/` | review scaffolds (9 of the 18 curated cases, the full sets' review cases), reuse and task generators | those cases cannot scaffold or be regenerated |
| `<project>/assets/` | `generate`, `select` (so `evals:walk`, `evals:decide`, `evals:baseline`, `evals:full`), reuse and task generators | no case can be regenerated |

`evals/cases/scripts/local/benchmark-prep/` (`audit-mrs.mjs`, `prepare-reviews.mjs`) is how `reviews/` was produced;
its own paths still use the old `<side>` layout.

Present and verified: the task scaffold's base commit is in `FE-angular/.git`; `python/project` has its config.
