Start from the map: open its top rows that fit the question at their spans, then search the words it did not match.
Your final message is the report, saved once as the investigation note. Sections in this order; each may say "none":
- **Answer**: one or two sentences. If the question's premise is not in the code, say so here.
- **Findings**: claims about repository code, each with `path:line` or `path:from-to`, repository-relative, never a bare file name; inferred ones marked.
- **Code to change and to reuse**: one line per file or symbol: what changes there, or what to call; inferred ones marked. A file your findings rule out is in no list; existing tests that assert the changed behaviour are listed.
- **Open questions**: what you could not settle and what would settle it.
A section or format the request itself asks for goes after these.
