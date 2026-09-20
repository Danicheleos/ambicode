# Rule migration and disposition

What became of the legacy rule packs, rule by rule. Doc 05 gives the intended
migration; this records what was actually written and, where the two differ, why.

The source content was read from `grahpt/assets/rule-packs`. Nothing was copied
unchanged to preserve a filename, that repository was not modified, and no
released file refers to its path.

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
| `common-quality-foundation.md` | `common-quality/need`, `/cohesion`, `/unjustified-complexity` | Retained. The unconditional ban on single-use abstractions is **gone**: `unjustified-complexity` asks for evidence that the complexity is unnecessary, because a boundary adapter with one caller can be correct. |
| `common-quality-code-craft.md` | `common-quality/naming`, `/effects`, `/comment-reasons`, `/explicit-surface`, `/dead-surface` | Retained as behaviour guidance. Formatting preferences dropped: style belongs to the project's configured linter, not to a reviewer's opinion. |
| `common-quality-architecture.md` | `common-quality/ownership-and-direction`, `/data-boundary` | Retained as questions about ownership and direction. The prescribed layer structure is **gone**; one layering scheme is not a defect in a project that chose another. |
| `common-quality-verification-and-reliability.md` | `common-quality/test-behavior`, `/test-determinism`, `/honest-gaps`, `/error-honesty` | Retained. Affected-test selection moved out of prose and into the check adapters, where it is executable rather than advisory. |
| `common-quality-delivery.md` | Not a rule pack | Task and report scope guidance. Kept out of the review path so it is not injected for every edited file. |
| `common-quality-review-smells.md` | `policies/prompts/review-smells.md` | Reviewer-only vocabulary. Rewritten so a label is a prompt to look, never evidence that something is wrong. |
| `common-code-review-etiquette.md` | `prompts/reviewer-role.md` | Concise, constructive, deduplicated comments retained. Thread resolution, merge blocking and follow-up actions **removed**: AMBICODE does not perform them, so instructing a reviewer to do them would describe a capability that does not exist. |
| `common-reuse-before-reimplementing.md` | `common-quality/reuse-before-reimplementing` | Retained. Justified boundary adapters and wrappers are explicitly permitted. |

`common-checks` carries no rules. It exists to declare command policy — which of
the project's own configured checks may run — and nothing else.

## Angular (optional, opt-in per project root)

| Pack | Rules | Disposition |
|---|---|---|
| `angular-components` | `component-responsibility`, `component-size`, `template-duplication` | Responsibility and size guidance retained. Component API conventions dropped: version-sensitive. |
| `angular-architecture` | `follow-declared-structure`, `shared-code-placement`, `no-unrequested-migration` | Reframed around what the project already declares. `no-unrequested-migration` is new: the old packs told reviewers to propose standalone-component and signal migrations, which is unrequested work. |
| `angular-state` | `state-owner`, `subscription-lifetime`, `representation-conversions` | Retained. Named state libraries dropped: a project's choice is not a defect. |
| `angular-http` | `response-validation`, `error-semantics`, `duplicate-requests`, `cross-cutting-http-concerns` | Retained as transport concerns that hold across versions. Specific `HttpClient` API expectations dropped. |
| `angular-style` | `configured-style`, `honest-types`, `distinct-shapes` | `configured-style` defers to the project's linter rather than restating it. Folder-naming conventions dropped. |

## Express (optional, opt-in per project root)

Doc 05 asks for general HTTP safety to be separated from Express- and
version-specific assumptions. That split is the reason there are four packs.

| Pack | Rules | Disposition |
|---|---|---|
| `express-http` | `authorization-on-scoped-routes`, `runtime-request-validation`, `single-response`, `security-middleware-order`, `handler-responsibility` | General HTTP correctness, retained. |
| `express-errors` | `classified-errors`, `no-secret-exposure`, `use-the-configured-logger`, `outbound-timeouts`, `no-synchronous-io-on-request-path` | Retained. `use-the-configured-logger` names no logger; the old packs did. |
| `express-persistence` | `query-input-allowlist`, `bounded-reads`, `write-conflict-behaviour`, `client-controlled-shapes`, `persistence-types-stay-internal` | Retained as ORM-independent. The required ORM and the feature-slice migration are **gone**, per doc 05. |
| `express-style` | `configured-style`, `untrusted-boundary-typing`, `declared-return-types` | Style defers to the project's linter. |

## Python (new)

Written from scratch. Doc 05 is explicit that TypeScript framework rules must not
be translated mechanically, and none were.

| Pack | Rules |
|---|---|
| `python-quality` | `exception-specificity`, `resource-lifetime`, `mutable-default-arguments`, `typing-at-boundaries`, `async-blocking-calls`, `project-configured-style`, `import-side-effects` |

`mutable-default-arguments` and `import-side-effects` have no TypeScript
counterpart; they exist because the language makes those mistakes easy.

## How to change any of this

Packs are YAML in `policies/`. Editing a rule, adding one, or disabling a pack
for a project needs no TypeScript change and no rebuild. A project can replace a
built-in pack wholesale with `replaces: builtin/<id>`; replacement is explicit
and whole-pack, because a half-overridden checklist is impossible to reason
about.
