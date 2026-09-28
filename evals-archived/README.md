# Archived evaluation cases

- `typescript/`: the 13-case TypeScript suite, archived 2026-09-28 when
  `evals/` became the benchmark suite. It has its own README and runs with
  `npm run evals:archived`.
- The Python cases below.

The six Python review cases, moved out of `evals/` on 2026-09-27 while the
suite focuses on TypeScript. `claude plugin eval` collects every
`evals/**/case.yaml`, so they had to leave that tree to stop running.

They are unchanged. Their fixtures (`py-*` in `fixtures/definitions.mjs`) stay
in use by the unit tests. The scaffolds resolve `fixtures/` as `../..`, so
`git mv evals-archived/<case> evals/<case>` restores a case as it was.

Known before restoring `regression-py`: `init` wires no unit check for pytest,
because pytest cannot say which tests a change affects (`checkFor`,
`src/config/init.ts`). The scaffold installs pytest but supplies no mapping,
so AMBICODE never runs the unchanged test the case grades. Checked 2026-09-27
by running the archived scaffold: `commands.unit` is `./.venv/bin/python -m
pytest -- {files}`, `checks.unit` is null.

| Case | Category | Fixture |
|---|---|---|
| clean-py | Clean or trivial change | `py-clean-docstring` |
| correctness-py | A defect in the changed lines | `py-none-guard` |
| regression-py | Source-only change breaking an unchanged test | `py-source-regression` |
| requirement-py | Code contradicts the stated requirement | `py-requirement-mismatch` |
| complexity-py | Unjustified complexity | `py-complexity` |
| degraded-py | Evidence is missing | `py-no-runner` |
