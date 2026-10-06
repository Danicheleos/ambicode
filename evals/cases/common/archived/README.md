# Archived evaluation cases

- `typescript/`: the 13-case TypeScript suite, archived 2026-09-28 when
  `evals/` became the benchmark suite. It has its own README and runs with
  `npm run evals:archived`.
- The Python cases below.

The six Python review cases, archived on 2026-09-27 while the suite focuses on
TypeScript. `claude plugin eval` collects every `<eval dir>/**/case.yaml`, so
they stay out of every eval dir a script or the manifest names:
`evals:archived` runs `evals/cases/evals-archived/typescript/` and a bare
`claude plugin eval .` runs `evals/cases/evals-triggers/`, neither of which holds them.

They are unchanged apart from their scaffold paths. Their fixtures (`py-*` in
`fixtures/definitions.mjs`) stay in use by the unit tests. The scaffolds
resolve `fixtures/` as `../../..`; to restore a case, move it into an eval dir
and add one `../` per level it moved down — `evals-suite.test.mjs` fails on
any tracked scaffold that no longer reaches the repository root.

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
