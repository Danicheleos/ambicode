# What relies on the change

A reviewer that sees only the diff cannot see a caller the change breaks without touching.
`ambicode review` already gives the reviewer unchanged source files that mention a name the
change adds, removes or renames (a name search, listed in part 4 of the report). Add what a
type-aware search finds, before you run the review. Local targets only: `--mr` reviews code
that is not in the checkout, and `--context` is refused for it.

1. `ToolSearch select:LSP`. If `ambicode config` shows `requirements.lsp` and no LSP tool
   loads, stop: say LSP is required and give `claude plugin install <plugin> --scope user`.
   Do not fall back to Grep. With `requirements.lsp` empty, a name search is acceptable;
   say in the reply that LSP was not used.
2. List what the change removes, renames, re-signs or whose behaviour it alters, from the diff
   (`git diff` for the target): exported functions, classes, types, constants, route paths.
3. `findReferences` on each. A reference in a file the diff does not touch is a dependent.
   Skip tests and files the report will not list anyway (generated, vendored). Until the
   server has loaded the project (about 5 s from the first LSP call on 500 files) it answers
   from the files it has open, with no warning: start with one `documentSymbol` on a changed
   file, and call again any `findReferences` that lists only the defining file.
4. Run the review with `--context <path>` for each dependent, at most eight, most-used first.
   They are mirrored beside the change and the reviewer is told to check them. A file that
   cannot be included is named in part 4; report it as unchecked, not as fine.

Report the dependents you passed and the LSP operations used. Zero references to a removed
name, confirmed by a second call, is a result worth stating: it means nothing outside the
diff uses it.
