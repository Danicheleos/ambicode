# Local-install and pilot-owner checklists

AMBICODE is installed and used locally (doc 08, "Distribution"): there is no
hosted, public, or private remote marketplace, no organization endpoint to
publish to, and no release-owner hosting task. This is the handoff for the
one role doc 08 still names that this environment cannot fill — the pilot
owner, who runs the two-repository value-gate pilot. That work cannot be
faked with a fixture; it is recorded here as concrete, sequenced steps
against evidence that already exists, not as open-ended advice.

## Local-install checklist

- [ ] Read `docs/installation.md` in full; it is the source of truth for
  every command below.
- [ ] From a clean checkout: `npm ci && npm run build && npm run typecheck
  && npm run test:unit && npm run validate:plugin && npm run
  package:candidate && npm run package:reproducible`. All must pass before
  anything below.
- [ ] Install the candidate into the normal Claude configuration with
  `node install-local.mjs install dist/ambicode-<version>`; use the named
  `--config-dir <dir>` option only for an intentionally isolated test. Confirm
  ordinary `claude plugin list` and
  `claude plugin details ambicode@ambicode-team` report all five
  skills (`init`, `review`, `investigate`, `plan`, `task`) and the four hooks
  (`Hooks (4)  PostToolUse, SessionStart, PostCompact, SessionEnd`, doc 04
  P2.4 correction G) before relying on it.
- [ ] Run `npm run smoke:install-local` (doc 04 P2.2 correction A, and the
  failure-safety rewrite of doc 04 P2.3 correction A): proves install,
  inspect, durability after the candidate directory used for install is
  deleted (checked from fresh `claude` processes, not the one that ran the
  install), and uninstall without that candidate directory — not merely
  that the commands exist.
- [ ] Run `node --test install-local.test.mjs` (included in `npm run
  test:unit`): proves install/uninstall failure-safety against a fake
  native-command adapter — a marketplace-update or plugin-update failure
  during an upgrade preserves the old installation, a plugin-uninstall or
  marketplace-removal failure preserves the durable source, and a
  wrong-scope uninstall is refused — without shelling out to `claude`.
- [ ] On a real Windows host, run `npm run verify`,
  `npm run package:reproducible`, and `npm run smoke:install-local`; then load
  the plugin from a target repository and exercise one hook. The implementation
  no longer depends on OS `zip`, `/bin/sh`, or `.venv/bin`, but macOS evidence
  is not Windows acceptance evidence.
- [ ] For each pilot language, install the official LSP plugin and server from
  `docs/installation.md`, then record one real definition/reference operation
  from `/ambicode:investigate`, `/ambicode:plan`, or `/ambicode:task`. Record a
  fallback reason if the current session exposes no LSP tools.
- [ ] Have a second developer — not the person who built the candidate —
  install it in a fresh environment using only `docs/installation.md`, and
  complete one working-tree review end to end. Doc 08 makes this mandatory
  before promoting a candidate; it is **pending** as of this record, because
  it needs a person other than this session.
- [ ] Record the candidate's version, inventory file, and (if the zip is
  kept) its SHA-256 in the release notes, so a given candidate is traceable
  back to the exact source commit and lockfile it was built from — there is
  no remote artifact URL to record instead.
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
| M13 and its Phase 2 evaluation | A connected Jira/Confluence MCP server, an authenticated `glab`, and a GitLab sandbox project — P2.1's code (`/ambicode:investigate`), P2.2's (`/ambicode:plan`), and P2.3's (`/ambicode:task`) were explicitly authorized to start and are implemented despite the Phase 1 value gate still being pending; only the *evaluation* against real external services remains gated on these prerequisites | Follow doc 07's M13 procedure once the prerequisites exist; record model/MCP/GitLab cases as pending until they are actually executed with authorized access, never as passed from a unit-test fixture |
| I01–I08 (P2.1 fixed investigation cases) | Authorized model access; I02–I05/I07 additionally need a connected Jira/Confluence MCP server; I08 needs a configured diagnostic command | Follow doc 07's "P2.1 fixed investigation cases" table |
| PL01–PL10 (P2.2 fixed plan cases) | Authorized model access; PL02–PL05 additionally need a connected Jira/Confluence MCP server; PL06 needs a prior investigation (note or same-session) | Follow doc 07's "P2.2 fixed plan cases" table |
| T01–T11 (P2.3 fixed task cases) | Authorized model access with a fixture project whose configured checks actually run; T03 needs a previously accepted plan; T05 needs a fixture with no configured reproduction mechanism; T06 needs a configured `propose` command or an over-limit selection; T09 needs a deliberately planted scope-expanding finding | Follow doc 07's "P2.3 fixed task cases" table |
| E02 (one authorized eval smoke case) | Authorized, budgeted model access for `claude plugin eval` | `claude plugin eval . --scaffold --allow-tools Bash --runs 1 --max-cost-usd <budget>` on one case; inspect the trace for skill routing *and* the packaged helper actually running, per doc 07. The suite now has 18 cases (12 Phase-1 plus the 6 P2.4 correction-I cases); the zero-cost load check covers all 18 across both arms, but no case has actually been run with model access. |
| A live authenticated Claude Code session confirming a disabled plugin's skills are unavailable (doc 04 P2.4, "Disable / re-enable" in `docs/installation.md`) | A developer's own authenticated Claude Code session (the isolated sandbox used for this candidate has no credentials in it deliberately) | Disable the plugin (`claude plugin disable ambicode@ambicode-team -s user`) in a real session and confirm no `/ambicode:*` skill is offered |
| The comparative evaluation / value gate | Two pilot repositories, pilot owner, authorized model access at pilot scale | See "Pilot owner checklist" above |
| Second-developer packaged install | Any second person | Hand them `docs/installation.md` and the packaged candidate; record their result in a new dated acceptance record |
| A real rollback between two independently built candidates | A second, later candidate to roll back from | Repeat this session's rollback mechanism test (see `docs/installation.md`, "Rollback") against that later candidate once it exists |

Nothing in this table is described as done elsewhere in this repository's
documentation. Where a status line says "pending," it means exactly that.
