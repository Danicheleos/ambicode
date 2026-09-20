# Reviewing a change

Written for developers using AMBICODE in a product repository.

`/ambicode:review` is the default. It pins what is being reviewed, mirrors it
into a snapshot, runs the checks the change affects, and puts the result to an
independent Claude Code process that can read only that snapshot.

There is no "quality only" switch and no "skip the checks" switch. What the
review does follows from what you give it.

## Quality review

```sh
ambicode review                 # uncommitted work
ambicode review --branch        # the branch, against the configured baseline
ambicode review --branch --base origin/release/1.2
```

With no requirement URL, the result is labelled `quality-review`. It judges the
change on its own terms: correctness, security and error paths, duplication,
unjustified complexity, dead surface, and the project policy that applies. It
does **not** establish that the change does what any ticket asked for, and the
result says so in its omissions.

## Requirement-based review

```sh
ambicode review \
  --requirement https://example.atlassian.net/browse/ORD-17 \
  --requirement https://example.atlassian.net/wiki/spaces/ENG/pages/42/Orders \
  --evidence .ambicode/reviews/evidence.json
```

`--requirement` is the one canonical way a requirement enters a review. It is
repeatable. The result is then labelled `requirement-based`.

**The helper never retrieves anything.** It has no Atlassian client, no
credentials and no MCP connection, by design. Your Claude session holds the MCP
connection, retrieves each URL, and writes the result into the evidence file
that `--evidence` points at. The `/ambicode:review` skill does this for you; its
`SKILL.md` documents the file's shape if you want to write one by hand.

Every `--requirement` URL must have an entry in that file, and the file must
hold nothing else. A URL whose entry says `forbidden`, `not-found` or
`unavailable` **stops the review**. It does not quietly become a quality review:
you asked whether the change meets a requirement, and "the requirement could not
be read" is the answer, not "nothing found".

Two requirements that contradict each other also stop the review, before any
check runs and before the model is called. Code detects the structural cases —
the same document retrieved twice with different content; the same id pointing
at two documents. Your session reports the ones only a reader can see, in the
evidence file's `conflicts` array. Neither claims to find every contradiction.

### Binding an MCP server

`.ambicode/config.yaml` names the server requirement retrieval uses:

```yaml
requirements:
  mcpServer: atlassian
```

`ambicode config` prints the current binding. While it is `null`, retrieval is
unpinned and the review records that in its omissions. If more than one
compatible server is connected, `/ambicode:init` asks which one this repository
should use rather than choosing. Evidence produced by a different server than
the binding names is refused.

## What the reviewer can do

A fresh `claude` process per review, started in the sanitized snapshot
directory, with:

- `Read`, `Grep` and `Glob`, and nothing else;
- `--safe-mode` and `--restricted`: no project `CLAUDE.md`, skills, hooks,
  settings files or customizations; no command-running tools;
- `--strict-mcp-config` with an empty MCP configuration: no MCP servers;
- `--no-session-persistence`: nothing written to a session on disk;
- no `--add-dir`, so the product checkout is not reachable;
- no GitLab or provider credential.

If the installed Claude Code stops offering one of the options that boundary is
built from, the review is refused with `reviewer-isolation-unavailable` rather
than run with less isolation than the result claims.

Code, requirements, and check output all reach the reviewer below a heading
marked `UNTRUSTED EVIDENCE`. Text in there cannot grant a tool, a permission or
a goal. It is data, whatever it claims about itself.

## What comes back

Four parts, in this order.

1. **What was reviewed.** Review id, mode, pinned target, measured input,
   snapshot location, the reviewer's model and tool set, the requirements with
   their versions and retrieval times, and content hashes for every prompt,
   policy pack, configuration file and requirement that went into it.
2. **Findings.** Each with risk, confidence, category, a validated location, an
   excerpt taken from the snapshot, an explanation, a suggested comment, and the
   rules or requirements it cites.
3. **Checks and verification evidence.** Per check: status, what was selected,
   whether the selection was complete, the exact argument vector, the exit code,
   limitations, and any file the command changed.
4. **Omissions, uncertainty and unavailable coverage.** What was excluded and
   why, what the reviewer said it could not assess, and every finding that was
   rejected for naming a file or line that is not in the change.

Results are written to `.ambicode/reviews/<id>/` — `result.json`, `report.txt`
and `reviewer-prompt.md` — which is gitignored. The snapshot lives outside the
repository.

### Reading the outcome honestly

**No findings is a valid result and not a clean bill of health.** It means the
reviewer identified nothing material within the scope and material it was given.

**A failed reviewer produced no finding list at all.** `status: error` with
`reviewer.status: failed` is a timeout, a spawn failure, or output that did not
survive validation. It is not a review that found nothing.

**A failed or skipped check does not block the review.** It narrows what was
verified, which makes the result `partial` and puts the reason in part 4. Only a
reviewer that produced nothing usable makes the result an `error`.

**A rejected finding is recorded.** If the reviewer named a path or a line that
is not in the pinned change, the finding is dropped and part 4 says so. Nothing
is repaired and no second model call is made.

## Evidence without a model

```sh
ambicode bundle          # same options as review
```

The same target, snapshot, requirements and check evidence, with no model
invoked. Its empty `findings` list means nothing ran, and the omissions say so.

## Nothing is published

Neither command posts anything anywhere. Publication to a merge request needs
the local selection page and a human submitting the form; that is P1.6 and is
not part of this command.
