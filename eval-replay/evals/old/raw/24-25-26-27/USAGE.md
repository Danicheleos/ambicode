# Running the suite analysis script

`analyze.py` compares any number of saved plugin-eval suites. It requires Python 3.9 or newer and uses only the standard library. No credentials or network access are needed.

Run it from this directory:

```sh
python3 analyze.py suite_a suite_b \
  --source /path/to/runs \
  --baseline bare_suite \
  --output /path/to/new-analysis
```

Suite arguments can also be absolute paths, so suites can come from different output dates or parent directories:

```sh
python3 analyze.py \
  /path/to/date-one/suite_a \
  /path/to/date-two/suite_b \
  --baseline /path/to/bare_suite \
  --output /path/to/new-analysis
```

`--suites suite_a suite_b` is an alternative to positional arguments. Choose one form per invocation. `--baseline` is optional; its suite is included automatically and listed first. Without a baseline, the supplied order determines the direction of pairwise comparisons. Duplicate directory arguments are processed once, and suites with similar names keep distinct identities.

Each suite must contain `results/plugin-eval/aggregate-result.json`, in the same aggregate format as the original suites. Its `traces/` directory supplies optional traces, session logs and task ledgers. Missing traces and sessions are reported in `validation.json`; missing ledgers do not stop the analysis. Suites without a file-identification grader have `n/a` file-list overlap metrics.

Comparisons use the intersection of case names across every selected suite and average case means so unequal repetition counts do not change case weights. Full-suite and per-case statistics are retained separately. A single suite produces its full analysis without pairwise differences. If suites have no common cases, the report shows their individual full-suite statistics and omits pairwise comparisons. The report states that statistics combine the supplied arms, while individual sample rows retain the arm identity.

Custom selections default to `./suite-analysis` when `--output` is omitted. Explicitly choose an output directory to keep analyses separate. An output directory inside an input suite is rejected to prevent recursive collection. Reusing an output directory replaces generated reports and data exports; previously collected raw files may remain, but only source files present in the current inputs are analyzed.

The script saves Markdown and HTML reports, CSV and JSON metrics, the original evidence, hashes and reconciliation results. It does not execute any commands found in the captured traces.

To reproduce the original runs 22 and 24–27 comparison, with its built-in source directory:

```sh
python3 analyze.py --output /path/to/reproduced-analysis
```

Running without any arguments uses the original five suites and writes into the script's directory. To rerun from the already collected evidence, use its `raw` directory:

```sh
python3 analyze.py \
  --source ./raw \
  --baseline 22_0553_curated-naked-sonnet-5-5 \
  --suites \
    24_0648_curated-ambicode-with-prompt-sonnet-5-5 \
    25_0658_curated-ambicode-sonnet-5-5 \
    26_0720_curated-ambicode-with-prompt-sonnet-5-5 \
    27_0733_curated-ambicode-with-prompt-sonnet-5-5 \
  --output /path/to/reproduced-analysis
```

See all options with `python3 analyze.py --help`.

Run the CLI regression checks with `python3 test_analyze.py -v`. They cover suite selection, identity collisions, missing ledgers, disjoint cases, input validation and stale captures. When the original collected evidence is present beside the script, they also verify that its comparison metrics remain unchanged.
