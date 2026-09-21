# Release-owner and pilot-owner checklists

This is the handoff for the two roles doc 08 names but this environment
cannot fill: the release owner (publishes the private marketplace) and the
pilot owner (runs the two-repository value-gate pilot). Neither role's
work can be faked with a fixture; both are recorded here as concrete,
sequenced steps against evidence that already exists, not as open-ended
advice.

## Release owner checklist

- [ ] Read `docs/installation.md` in full; it is the source of truth for
  every command below.
- [ ] Decide and record: who is the named release owner, and which two
  repositories are the pilot repositories (doc 08, "Owners and evidence").
- [ ] From a clean checkout: `npm ci && npm run build && npm run typecheck
  && npm run test:unit && npm run validate:plugin && npm run
  package:candidate && npm run package:reproducible`. All must pass before
  anything below.
- [ ] Host `dist/ambicode-<version>.zip` at a URL your organization
  controls. Record the exact URL and the SHA-256 from
  `dist/ambicode-<version>.zip.sha256` in the release notes (doc 08 requires
  both).
- [ ] Edit `marketplace/ambicode-team/.claude-plugin/marketplace.json`:
  replace the placeholder `owner`, `source.url` and `source.sha256` with the
  real values. Re-run `claude plugin validate
  marketplace/ambicode-team/.claude-plugin/marketplace.json --strict`.
- [ ] Publish the marketplace directory (or a repository containing it) at a
  URL your team can run `/plugin marketplace add` against.
- [ ] Have a second developer — not the person who built the candidate —
  install it in a fresh environment using only `docs/installation.md`, and
  complete one working-tree review end to end. Doc 08 makes this mandatory
  before promoting a candidate; it is **pending** as of this record, because
  it needs a person other than this session.
- [ ] Tag the source commit that the artifact was built from. `claude plugin
  tag <path>` creates a `{name}--v{version}` git tag and checks that
  `plugin.json` and the marketplace entry agree — run it, but only once the
  marketplace entry's `version` has been bumped for this release; do not tag
  with the placeholder `0.1.0` twice.
- [ ] Copy the dated acceptance record's summary into your organization's
  own release tracker if it has one; this repository's copy under
  `docs/acceptance/` is the source of truth either way.

## Pilot owner checklist

The value gate (doc 08) needs two real repositories, real reviews, and
honest adjudication — nothing here can be produced without them.

- [ ] Confirm one TypeScript and one Python pilot repository, each with an
  owner who can approve policy content for it (doc 08, "Owners and
  evidence").
- [ ] Confirm authorized model access for the pilot's own usage (separate
  from, and likely more than, the one E02 smoke case — see below).
- [ ] Confirm `glab` is installed and authenticated against each pilot
  repository's GitLab host, and that publishing test comments there is
  acceptable — never pilot against a repository where an accidental
  duplicate comment would be a real incident.
- [ ] Run at least 12 paired review sessions across the two repositories
  (doc 08's minimum), collecting at least 30 distinct offered findings.
  Use the case/measurement fields doc 07 "Measurement and records" lists:
  case/release/model IDs, prompt/policy hashes, target SHA, selected
  checks, elapsed time, findings, human labels.
- [ ] Adjudicate each finding as actionable or not, independently of who
  ran the review. Compute actionable precision, known-defect detection
  against the frozen cases, median human review effort versus the
  ordinary-prompting baseline, and rework. Doc 08's targets are the release
  bar, not a research claim to hit approximately.
- [ ] Write the comparative evaluation report doc 10's final-handover
  checklist requires, with distributions and per-language results, not only
  one aggregate number, and with uncertainty stated rather than omitted.
- [ ] If the results are negative or inconclusive: hold Phase 2 expansion,
  diagnose the smallest responsible component, and record that decision
  explicitly (doc 08, "Value gate"). Do not reinterpret the thresholds to
  make a disappointing pilot look adequate.

## Finishing what this session left pending

Every item below has an exact prerequisite and an exact next command; none
of them needed a bigger framework, only access this environment does not
have.

| Pending item | Exact prerequisite | Exact next step |
| --- | --- | --- |
| M05–M09 (live GitLab sandbox scenarios) | A private test GitLab project, an MR with added/renamed/deleted lines, an authenticated `glab` | Follow doc 07's manual scenario table M05–M09 against that project; record the discussion links it produces |
| M10 (hostile input through a real browser), M12 (real browser idle/reopen/disable/reinstall) | A browser on the machine running the page | Run `ambicode view --review <id>` and drive the scenarios in doc 07 by hand; `curl`/Fastify-injection evidence already exists but does not substitute |
| M06 executable-check portion, M10 isolation portion | A running Docker daemon and a digest-pinned image | Start the daemon, configure `remoteChecks.image`, rerun the relevant fixture review |
| M13 and its Phase 2 evaluation | Phase 2 is explicitly on hold pending the Phase 1 value gate (see below) | Do not start; revisit only after the value gate has a real result |
| E02 (one authorized eval smoke case) | Authorized, budgeted model access for `claude plugin eval` | `claude plugin eval . --scaffold --allow-tools Bash --runs 1 --max-cost-usd <budget>` on one case; inspect the trace for skill routing *and* the packaged helper actually running, per doc 07 |
| The comparative evaluation / value gate | Two pilot repositories, pilot owner, authorized model access at pilot scale | See "Pilot owner checklist" above |
| Second-developer packaged install | Any second person | Hand them `docs/installation.md` and the hosted artifact once it exists; record their result in a new dated acceptance record |
| Real marketplace hosting and the real `source.url`/`sha256` | A named release owner and an org-controlled URL | See "Release owner checklist" above |
| A real rollback between two published versions | A first real release to exist | Repeat this session's rollback mechanism test against that real prior version once it exists |

Nothing in this table is described as done elsewhere in this repository's
documentation. Where a status line says "pending," it means exactly that.
