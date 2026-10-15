# Rule migration and disposition

AMBICODE resolves policy from YAML packs in `policies/` and `.ambicode/policies/`
and from nothing else. A rule written only in a Markdown document is not in
effect, however clearly it is stated. Getting a team's rules onto the pack
format is therefore a real step, and this document is both halves of it:

- **[Migrating your own rules](#migrating-your-own-rules)** — the supported path,
  `/ambicode:rules`, for a team adopting AMBICODE.
- **The disposition tables below** — the worked example. They record, rule by
  rule, what became of the legacy packs the built-ins were distilled from: what
  was retained, what was dropped, and why. That is the shape of judgement your
  own migration has to reproduce, so read it before running yours.

Doc 05 gives the intended migration for the built-ins; the tables record what
was actually written and, where the two differ, why. The source content was read
from `grahpt/assets/rule-packs`. Nothing was copied unchanged to preserve a
filename, that repository was not modified, and no released file refers to its
path.

## Migrating your own rules

Run `/ambicode:rules`. It is a setup-time skill: it runs once when you adopt
AMBICODE, and again when the team's rules change. Nothing on a per-call path
ever reads a Markdown rule source or infers a scope.

It reads the sources you point it at — `CLAUDE.md` and nested ones,
`CONTRIBUTING.md`, `docs/**`, `.cursor/rules/**`, `.github/instructions/**`, or
a Confluence page through the bound MCP server — and then, with you:

1. classifies each rule as global or scoped to a path pattern, deriving the glob
   from your repository's **actual** layout and verifying what it matches;
2. drafts one pack per coherent scope into `.ambicode/policies/drafts/<id>.yaml`.
   Each rule carries `source.quote`, a verbatim passage, and `source.location`,
   the file or page it came from; nothing in `drafts/` is in force;
3. validates the drafts with `ambicode policy check --drafts` and loops until
   clean. The check confirms every quote is in its source and reports a glob that
   matches nothing. A rule whose quote cannot be found is not migrated;
4. shows you a table with one row per rule, applied or not migrated and why, and
   asks: Apply all, Apply with changes, or Discard drafts;
5. on Apply all only, `ambicode rules apply` moves each draft to
   `.ambicode/policies/<id>.yaml` and adds it to the project's `policyFiles`,
   preserving the rest of `.ambicode/config.yaml`, then probes a covered and an
   uncovered path.

The route's first step runs `skills/rules/scripts/discover.mjs`, which only lists
the files that usually hold rules (agent instructions, contribution guides,
ADRs, `docs/`); it reads none of them into rules. You then name the sources in
your own words or take the listed ones.

`ambicode policy check <file...>` is usable on its own, for a pack you wrote by
hand. It validates a candidate file that nothing references yet — the schema,
and every load-time rule the schema cannot express — and exits nonzero on an
error:

```sh
ambicode policy check --project web .ambicode/policies/team-components.yaml
```

It does not count what a glob matches: a glob that matches nothing validates,
gets enabled, and never applies to anything, so derive it from the real layout.

`init` does not read those sources itself. Its own candidates (the scout's
conventions, a web search, the user's answers) take the same road: init drafts
them into `.ambicode/policies/drafts/`, and the route above checks and applies
them. A rule is never written into `config.yaml`; a config that still has a
`rules` key is refused and points here. The authority follows the source: a rule
a project document states is `team`, a scout inference is `observed`, a web
practice is `inherited` (its URL quote is flagged `pack-quote-unchecked`). The
check rejects a draft rule whose id or instruction equals a rule already in
force, so a built-in and a draft never state the same thing twice.

Two things the skill deliberately does not carry over, for the reasons the
worked example gives below: a rule that encodes one team's structural choice
rather than a defect (see [the layering note](#common)), and a rule naming a
specific framework API (see [the one deviation](#the-one-deviation-worth-arguing-about)).
It asks you about the first and drops the second.

See [policy authoring](policy-authoring.md) for what `authority` and `replaces`
actually change.

## The one deviation worth arguing about

**Framework-API and version-sensitive rules were dropped, not migrated.**

Doc 05 allows framework presets but requires that framework API and style
expectations be validated against the installed version before they are
asserted. AMBICODE has no installed-version validation in Phase 1. A rule that
names a specific Angular or Express API would therefore be stated with more
confidence than the evidence supports, and a reviewer repeating it would produce
findings that are wrong on a project one major version away.

They were dropped rather than carried with a caveat. Each affected pack records
the reason in its own `source.location`, so the omission is visible where the
rules are, not only here.

What survived from those packs is the part that does not depend on a version:
responsibility, ownership, error semantics, and boundary typing.

## Common

| Old file | Retained as | Disposition |
|---|---|---|
| `common-quality-foundation.md` | `common-design/need`, `/cohesion`, `/unjustified-complexity` | Retained. The unconditional ban on single-use abstractions is **gone**: `unjustified-complexity` asks for evidence that the complexity is unnecessary, because a boundary adapter with one caller can be correct. |
| `common-quality-code-craft.md` | `common-code/naming`, `/effects`, `/comment-reasons`, `/dead-surface`, and `common-design/explicit-surface` | Retained as behaviour guidance. Formatting preferences dropped: style belongs to the project's configured linter, not to a reviewer's opinion. |
| `common-quality-architecture.md` | `common-design/ownership-and-direction`, `common-security/data-boundary` | Retained as questions about ownership and direction. The prescribed layer structure is **gone**; one layering scheme is not a defect in a project that chose another. |
| `common-quality-verification-and-reliability.md` | `common-verification/test-behavior`, `/test-determinism`, `/honest-gaps`, and `common-errors/error-honesty` | Retained. Affected-test selection moved out of prose and into the check adapters, where it is executable rather than advisory. |
| `common-quality-delivery.md` | Not a rule pack | Task and report scope guidance. Kept out of the review path so it is not injected for every edited file. |
| `common-quality-review-smells.md` | Not a rule pack | Its `before-review` stage was never delivered by any code path, so the prompt file was deleted. |
| `common-code-review-etiquette.md` | Not a rule pack | Concise, constructive, deduplicated comments were kept in a reviewer prompt that nothing loads any more, so the file was deleted. Thread resolution, merge blocking and follow-up actions were **removed** earlier: AMBICODE does not perform them. |
| `common-reuse-before-reimplementing.md` | `common-design/reuse-before-reimplementing` | Retained. Justified boundary adapters and wrappers are explicitly permitted. |

`common-checks` carries no rules. It exists to declare command policy — which of
the project's own configured checks may run — and nothing else.

## Angular (chosen by init when `package.json` names `@angular/core`)

| Pack | Rules | Disposition |
|---|---|---|
| `angular-components` | `component-responsibility`, `component-size`, `template-duplication` | Responsibility and size guidance retained. Component API conventions dropped: version-sensitive. |
| `angular-architecture` | `follow-declared-structure`, `shared-code-placement` | Reframed around what the project already declares. The unrequested-migration concern is now `common-design/scope`. |
| `angular-state` | `state-owner`, `representation-conversions` | Retained. Named state libraries dropped: a project's choice is not a defect. Subscription lifetime is covered by `common-code/effects`. |
| `angular-http` | `duplicate-requests`, `cross-cutting-http-concerns` | Retained as transport concerns that hold across versions. Specific `HttpClient` API expectations dropped. Response validation and error semantics are covered by `common-security/data-boundary` and `common-errors/error-honesty`. |
| `angular-style` | `honest-types` | Lint-restating and shape-mapping rules dropped (`common-code/naming`, `common-security/data-boundary` cover them). Folder-naming conventions dropped. |

## Express (chosen by init when `package.json` names `express`)

Doc 05 asks for general HTTP safety to be separated from Express- and
version-specific assumptions. That split is the reason there are three packs. `express-style` (its one rule, `untrusted-boundary-typing`) was dropped: `common-security/data-boundary` and `angular-style/honest-types` cover it.

| Pack | Rules | Disposition |
|---|---|---|
| `express-http` | `authorization-on-scoped-routes`, `single-response`, `security-middleware-order`, `handler-responsibility` | General HTTP correctness, retained. Runtime request validation is `common-security/data-boundary`. |
| `express-errors` | `classified-errors`, `no-synchronous-io-on-request-path` | Retained. Secrets, logging and outbound timeouts moved to `common-security/no-secret-exposure`, `common-errors/configured-logger`, `/outbound-timeouts`. |
| `express-persistence` | `bounded-reads`, `write-conflict-behaviour`, `client-controlled-shapes`, `persistence-types-stay-internal` | Retained as ORM-independent. The required ORM and the feature-slice migration are **gone**, per doc 05. Query-input safety is `common-security/untrusted-input-allowlist`. |

## Python (new)

Written from scratch. Doc 05 is explicit that TypeScript framework rules must not
be translated mechanically, and none were.

| Pack | Rules |
|---|---|
| `python-quality` | `exception-specificity`, `resource-lifetime`, `mutable-default-arguments`, `async-blocking-calls`, `import-side-effects` |

`mutable-default-arguments` and `import-side-effects` have no TypeScript
counterpart; they exist because the language makes those mistakes easy.

## `common-quality` was split into purpose packs

`common-quality` (16 rules) no longer exists. The 16 keep their ids, checks and
instructions, so a rule ref such as `common-quality/need` is now
`common-design/need`. Exceptions: `ownership-and-direction` lost its last sentence,
and `investigate` is dropped everywhere. Rules narrowed to `plan` and `review`
(`need`, `cohesion`, `unjustified-complexity`, `explicit-surface`,
`ownership-and-direction`) or to `review` (`honest-gaps`) no longer reach `task`;
`data-boundary` no longer reaches `task`, and the `common-code`, `common-errors`
and `common-verification` rules no longer reach `plan`. Eight rules are new:
`scope`, `callers`, `no-secret-exposure`, `untrusted-input-allowlist`,
`outbound-timeouts`, `configured-logger`, `no-check-evasion`, `unobserved-async`. Built-in packs now live in
folders by ecosystem (`policies/common/`, `angular/`, `express/`, `python/`); the
folder is not part of the id, which is still `builtin/<id>`. `config packs`
mirrors the folder: `.ambicode/policies/common/common-design.yaml`.

| New pack | Rules (formerly `common-quality/<rule>`) |
|---|---|
| `common-design` | `need`, `fix-the-cause`, `cohesion`, `reuse-before-reimplementing`, `unjustified-complexity`, `explicit-surface`, `ownership-and-direction`, `scope` |
| `common-code` | `dead-surface`, `naming`, `effects`, `comment-reasons`, `callers` |
| `common-errors` | `error-honesty`, `unobserved-async`, `outbound-timeouts`, `configured-logger` |
| `common-security` | `data-boundary`, `no-secret-exposure`, `untrusted-input-allowlist` |
| `common-verification` | `test-behavior`, `test-determinism`, `no-check-evasion`, `honest-gaps` |

A config that enabled `builtin/common-quality` must enable the five packs instead
(`pack-missing`). An old `.ambicode/policies/common-quality.yaml` copy with
`replaces: builtin/common-quality` is an error (`pack-replaces-missing`): remove it
from `policyFiles` and run `ambicode config packs`.

## How to change any of this

Packs are YAML in `policies/` (built-in) and `.ambicode/policies/` (yours). `ambicode
config packs` copies each built-in a project names in `packs` (a command the project
does not declare counts as unavailable) to `.ambicode/policies/<folder>/<id>.yaml` and lists it in `policyFiles`, so
the built-in rules are yours to read and edit. Editing a rule, adding one, or disabling a pack
for a project needs no TypeScript change and no rebuild. A project can replace a
built-in pack wholesale with `replaces: builtin/<id>`; replacement is explicit
and whole-pack, because a half-overridden checklist is impossible to reason
about.
