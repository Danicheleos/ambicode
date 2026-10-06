// Shared contracts and constants used across areas: zod schemas, their inferred types and port/engine interfaces.
// Top level: cross-cutting contracts; platform/: L0 contracts; modules/: contracts of the L1 modules.

// primitives.ts: shared enums (risk, status, ecosystem, provider ids, …) as zod schemas and types.
export { Risk, Confidence, ReviewStatus, CheckStatus, PublicationState, Authority, RuleCategory, Activity, PromptStage, CommandAction, COMMAND_ACTION_PRECEDENCE, Ecosystem, AdapterId, TargetKind, ProviderId } from './primitives.ts';

// defaults.ts: default values, size limits and directory names.
export { DEFAULTS, TEST_EXCLUDES, SEARCH_LAYER_DEFAULTS, INDEX_DRIFT_FILES, MAX_COMMAND_OUTPUT_BYTES, MAX_EVIDENCE_BYTES, MAX_SNAPSHOT_FILE_BYTES, UNLIMITED_CONTEXT_BUDGET_BYTES, MAX_SNAPSHOT_TOTAL_BYTES, MAX_REVIEWED_DISCUSSIONS, MAX_DISCUSSION_CONTEXT_BYTES, MAX_DISCUSSION_NOTE_BYTES, PROMPT_EVIDENCE_RESERVE_BYTES, CONFIG_FILE, REVIEWS_DIR, TASKS_DIR, REVIEWS_LEAF, INDEX_DIR, IGNORE_ENTRIES, GITIGNORE_ENTRIES } from './defaults.ts';

// composition.ts: Runtime and Workspace composition contracts.
export type { Runtime, Workspace } from './composition.ts';

// cli.ts: option name lists for the prepare and route-start commands.
export { PREPARE_OPTIONS, ROUTE_START_OPTIONS } from './cli.ts';

// prepare.ts: prepare output, policy, navigation and compact-output schemas.
export { PreparePolicy, PrepareContextBudget, PrepareSharedContract, PrepareNavigation, PrepareTask, PrepareOutput, PrepareCompactOutput } from './prepare.ts';
export type { PrepareCompactRule } from './prepare.ts';

// harness.ts: route, step, gate, handler and engine contracts.
export { EXITS, HANDLER_NAMES, MARKER, RAISED_BY } from './harness.ts';
export type { Exit, Qualified, Call, Revise, OnError, When, GateDef, Answer, ReviewTargetArgs, RouteArgs, StepDef, RouteDef, RouteRegistry, StartChannel, CommandName, Cause, AcceptanceEntry, RouteView, ConsentResult, RouteContextPort, StartInput, AdvanceInput, StepMessage, Position, Engine, HandlerInput, HandlerResult, Handler, HandlerRegistry, ActiveRoutePointer, PlanOwnership, SessionBinding } from './harness.ts';

// hook.ts: Claude Code hook input/output schemas, limits and hook dependency shapes.
export { HookInput, ADDITIONAL_CONTEXT_EVENTS, EMPTY_HOOK_OUTPUT, AskUserQuestionResponse, REGISTERED_HOOK_EVENTS, REGISTERED_HOOK_ENTRIES, MAX_HOOK_INPUT_BYTES } from './hook.ts';
export type { AdditionalContextEvent, AdditionalContextHookOutput, PostToolUseHookOutput, StopHookOutput, RouteHookDeps, HookDeps } from './hook.ts';

// util.ts: JSON output format type.
export type { JsonFormat } from './util.ts';

// platform/claude.ts: Claude Code platform flags and the ask/answer bindings.
export { ASK_BINDING, ANSWER_CONTEXT, PLATFORM } from './platform/claude.ts';
export type { Support, PlatformFlags } from './platform/claude.ts';

// platform/git.ts: parsed diff and raw change shapes.
export type { DiffLine, DiffHunk, DiffFile, RawChangeKind, RawChange } from './platform/git.ts';

// platform/ports.ts: port interfaces (Clock, FileSystem, IdSource, ProcessRunner, Reviewer, StandardInput).
export type { Clock, FileStats, DirectoryEntry, FileSystem, IdSource, EnvironmentPolicy, ProcessRequest, ProcessOutcome, ProcessRunner, ReviewerRequest, ReviewerInvocation, Reviewer, StandardInput } from './platform/ports.ts';

// platform/provider.ts: ReviewProvider contract, remote target/position/discussion schemas and outcome helpers.
export { DeliveryCertainty, RemoteTarget, RemotePosition, RemoteNote, RemoteDiscussion, RemoteRevisionState, RemoteRevision, CoverageGap, ReviewCoverage, COMPLETE_COVERAGE } from './platform/provider.ts';
export type { ProviderOutcome, ProviderOperation, ResolveTargetRequest, FetchSnapshotRequest, FetchedSnapshot, FetchedContent, RemoteFetchedFile, ListDiscussionsRequest, DiscussionListing, PublishCommentRequest, PublishedComment, ProviderIdentity, ReviewProvider } from './platform/provider.ts';
/** providerOk(value) — wraps a successful provider result as a ProviderOutcome. */
export { providerOk } from './platform/provider.ts';
/** providerUnsupported(provider, operation, message) — ProviderOutcome for an operation the provider does not offer. */
export { providerUnsupported } from './platform/provider.ts';
/** providerFailed(provider, operation, message, details?, certainty?) — ProviderOutcome for a failed call; certainty defaults to uncertain. */
export { providerFailed } from './platform/provider.ts';
/** samePosition(a, b) — true when two RemotePositions have identical SHAs, paths and lines. */
export { samePosition } from './platform/provider.ts';
/** revisionMatches(pinned, current) — compares a pinned RemoteTarget with the live revision; returns { same } or the differences. */
export { revisionMatches } from './platform/provider.ts';

// modules/checks.ts: check-run inputs, outcomes, baseline entries and changed paths.
export { GATE } from './modules/checks.ts';
export type { ReviewEntry, CheckEntry, CheckOnlyInput, CheckOnlyOutcome, CheckDeps, Routed, FormatEntry, PendingApproval, BaselineEntryFields, ChangedPath } from './modules/checks.ts';

// modules/config.ts: zod schemas and types for .ambicode config, plus doctor/init/apply shapes.
export { CommandSpec, CommandEntry, RelatedSelector, MappingSelector, CommandSelector, Selector, CheckSpec, ShortlistConfig, SearchProfile, ProjectConfig, ReviewConfig, ChecksConfig, PageConfig, RemoteChecksConfig, AuthoringConfig, SearchConfig, WorkersConfig, GuardConfig, AmbicodeConfig, SUPPORTED_SCHEMA_VERSION, APPLY_OPTIONS } from './modules/config.ts';
export type { DoctorRow, DoctorTable, SetValue, SetPair, InitProposal, ApplyDeps, DoctorOptions } from './modules/config.ts';

// modules/ecosystems.ts: declaration patterns per ecosystem.
export { DECLARATION_PATTERNS } from './modules/ecosystems.ts';

// modules/evidence.ts: task ledger, note kinds and evidence shapes.
export { MAX_NOTE_BYTES, KINDS, NOTE_KINDS, SAVE_KINDS, LEDGER_FILE } from './modules/evidence.ts';
export type { NoteDeps, NoteRow, ArtifactRef, LockedLedger, LedgerEntry, NewEntry, StrictRead, TaskDir, NoteKind, SaveKind } from './modules/evidence.ts';

// modules/policy.ts: policy pack, rule and resolved-policy schemas and types.
export { RuleCheck, RuleSource, PolicyRule, DraftPolicyRule, PolicyPromptRef, PolicyCommandDecision, PolicyPack, DRAFTS_DIR } from './modules/policy.ts';
export type { LoadedPack, ResolvedRule, ResolvedPromptRef, ResolvedCommandDecision, DiagnosticSeverity, Diagnostic, ResolvedPolicy, StagePayload, DraftsCheck, PackWithPrompts, PackConstraints } from './modules/policy.ts';

// modules/publication.ts: publication record, draft and outcome schemas and helpers.
export { PUBLICATION_SCHEMA_VERSION, PersistedPosition, UnplaceableFinding, PublicationPositions, CommentDraft, PublicationOutcome, SubmissionRecord, PublicationRecord } from './modules/publication.ts';
export type { SelectedComment } from './modules/publication.ts';
/** emptyPublicationRecord(reviewId, at) — a fresh PublicationRecord with no drafts, outcomes or submissions. */
export { emptyPublicationRecord } from './modules/publication.ts';
/** isSettled(state) — true when the comment already exists remotely (published or already-published), so publishing must refuse. */
export { isSettled } from './modules/publication.ts';

// modules/requirements.ts: captured requirement schemas, the evidence envelope and capture dependencies.
export { RequirementMode, RequirementSource, RequirementConflict, ProvenanceEntry, CapturedRequirement, CapturedHits, RequirementEvidence, EXPANSION_FETCH } from './modules/requirements.ts';
export type { CaptureDeps, EnvelopeSource, EnvelopeInput, NormalizedRequirements, EvidenceSource } from './modules/requirements.ts';

// modules/review.ts: review result, finding, reviewer run, snapshot and bundle schemas; the review checks gate.
export { REVIEW_SCHEMA_VERSION, ReviewTarget, SelectedFile, CheckResult, FindingLocation, Finding, ReviewerOutput, ReviewInputs, ReviewerUsage, ReviewerRun, ReviewRequirementMode, SelectionRecord, ReviewResult, SESSION_COOKIE, REVIEWER_TOOLS, REVIEWER_REPLAY_VARIABLE, CHECKS_GATE } from './modules/review.ts';
export type { ReviewBundle, TargetSelection, ReviewEstimate, SweepReport, ComposedPrompt, MeasuredInput, Snapshot, SnapshotEntry, SnapshotPlan, AssembleOptions } from './modules/review.ts';

// modules/search.ts: index adapter, locate, declarations and navigation shapes.
export { DEFAULT_LOCATE_LIMIT, PREPARE_REASONS_PER_CANDIDATE, PREPARE_SHORTLIST_LIMIT, MAX_DEPENDENTS, GENERIC_PROFILE, LocateCandidate, PrepareShortlist, LocateOutput, SCORE_FILENAME, COMMON_NAMES } from './modules/search.ts';
export type { IndexName, IndexState, IndexStatus, IndexDeclaration, IndexReference, IndexAnswer, IndexAdapter, Dependent, RefsResult, LocateShortlist, NavigationGuidance, MapCandidate, MapSymbol, MapFeature, IndexDeps, Declaration } from './modules/search.ts';

// modules/workers.ts: worker environment allowlist, retry count and result shapes.
export { WORKER_ENV_ALLOWLIST, STRUCTURED_OUTPUT_ATTEMPTS } from './modules/workers.ts';
export type { BadAnchor, PlanCheckResult } from './modules/workers.ts';
