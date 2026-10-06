// Shared contracts and constants used across areas: zod schemas, their inferred types, and port/engine interfaces.

// checks.ts: check-run inputs, outcomes and baseline entry shapes.
export { GATE } from './checks.ts';
export type { ReviewEntry, CheckEntry, CheckOnlyInput, CheckOnlyOutcome, CheckDeps, Routed, FormatEntry, PendingApproval, BaselineEntryFields } from './checks.ts';

// claude-platform.ts: Claude Code platform flags and the ask/answer bindings.
export { ASK_BINDING, ANSWER_CONTEXT, PLATFORM } from './claude-platform.ts';
export type { Support, PlatformFlags } from './claude-platform.ts';

// cli.ts: option name lists for the prepare and route-start commands.
export { PREPARE_OPTIONS, ROUTE_START_OPTIONS } from './cli.ts';

// composition.ts: Runtime and Workspace composition contracts.
export type { Runtime, Workspace } from './composition.ts';

// config.ts: zod schemas and types for .ambicode config, plus doctor/init/set shapes.
export { CommandSpec, CommandEntry, RelatedSelector, MappingSelector, CommandSelector, Selector, CheckSpec, ShortlistConfig, SearchProfile, ProjectConfig, ReviewConfig, ChecksConfig, PageConfig, RemoteChecksConfig, AuthoringConfig, SearchConfig, WorkersConfig, GuardConfig, AmbicodeConfig, SUPPORTED_SCHEMA_VERSION, APPLY_OPTIONS } from './config.ts';
export type { DoctorRow, DoctorTable, SetValue, SetPair, InitProposal } from './config.ts';

// defaults.ts: default values, size limits and directory names.
export { DEFAULTS, TEST_EXCLUDES, SEARCH_LAYER_DEFAULTS, INDEX_DRIFT_FILES, MAX_COMMAND_OUTPUT_BYTES, MAX_EVIDENCE_BYTES, MAX_SNAPSHOT_FILE_BYTES, UNLIMITED_CONTEXT_BUDGET_BYTES, MAX_SNAPSHOT_TOTAL_BYTES, MAX_REVIEWED_DISCUSSIONS, MAX_DISCUSSION_CONTEXT_BYTES, MAX_DISCUSSION_NOTE_BYTES, PROMPT_EVIDENCE_RESERVE_BYTES, CONFIG_FILE, REVIEWS_DIR, TASKS_DIR, REVIEWS_LEAF, INDEX_DIR, IGNORE_ENTRIES, GITIGNORE_ENTRIES } from './defaults.ts';

// evidence.ts: task ledger, note and evidence shapes.
export { MAX_NOTE_BYTES, KINDS } from './evidence.ts';
export type { NoteDeps, NoteRow, ArtifactRef, LockedLedger, LedgerEntry, NewEntry, StrictRead, TaskDir } from './evidence.ts';

// git.ts: parsed diff and raw change shapes.
export type { DiffLine, DiffHunk, DiffFile, RawChangeKind, RawChange } from './git.ts';

// harness.ts: route, step, gate, handler and engine contracts.
export { EXITS, HANDLER_NAMES, MARKER } from './harness.ts';
export type { Exit, Qualified, Call, Revise, OnError, When, GateDef, Answer, RouteArgs, StepDef, RouteDef, RouteRegistry, StartChannel, CommandName, Cause, AcceptanceEntry, RouteView, ConsentResult, RouteContextPort, StartInput, AdvanceInput, StepMessage, Position, Engine, HandlerInput, HandlerResult, Handler, HandlerRegistry, ActiveRoutePointer, PlanOwnership, SessionBinding } from './harness.ts';

// hook.ts: Claude Code hook input/output schemas and hook dependency shapes.
export { HookInput, ADDITIONAL_CONTEXT_EVENTS, EMPTY_HOOK_OUTPUT, AskUserQuestionResponse, REGISTERED_HOOK_EVENTS, REGISTERED_HOOK_ENTRIES } from './hook.ts';
export type { AdditionalContextEvent, AdditionalContextHookOutput, PostToolUseHookOutput, StopHookOutput, RouteHookDeps, HookDeps } from './hook.ts';

// locate.ts: locate candidates and prepare shortlist schemas.
export { LocateCandidate, PrepareShortlist, LocateOutput } from './locate.ts';

// policy.ts: policy pack, rule and resolved-policy schemas and types.
export { RuleCheck, RuleSource, PolicyRule, DraftPolicyRule, PolicyPromptRef, PolicyCommandDecision, PolicyPack, DRAFTS_DIR } from './policy.ts';
export type { LoadedPack, ResolvedRule, ResolvedPromptRef, ResolvedCommandDecision, DiagnosticSeverity, Diagnostic, ResolvedPolicy, StagePayload, DraftsCheck, PackWithPrompts, PackConstraints } from './policy.ts';

// ports.ts: platform port interfaces (Clock, FileSystem, IdSource, ProcessRunner, Reviewer, StandardInput).
export type { Clock, FileStats, DirectoryEntry, FileSystem, IdSource, EnvironmentPolicy, ProcessRequest, ProcessOutcome, ProcessRunner, ReviewerRequest, ReviewerInvocation, Reviewer, StandardInput } from './ports.ts';

// prepare.ts: prepare output, policy, navigation and compact-output schemas.
export { PreparePolicy, PrepareContextBudget, PrepareSharedContract, PrepareNavigation, PrepareTask, PrepareOutput, PrepareCompactOutput } from './prepare.ts';
export type { PrepareCompactRule } from './prepare.ts';

// primitives.ts: shared enums (risk, status, ecosystem, provider ids, …) as zod schemas and types.
export { Risk, Confidence, ReviewStatus, CheckStatus, PublicationState, Authority, RuleCategory, Activity, PromptStage, CommandAction, COMMAND_ACTION_PRECEDENCE, Ecosystem, AdapterId, TargetKind, ProviderId } from './primitives.ts';

// provider.ts: ReviewProvider contract, remote target/position/discussion schemas and outcome helpers.
export { DeliveryCertainty, RemoteTarget, RemotePosition, RemoteNote, RemoteDiscussion, RemoteRevisionState, RemoteRevision, CoverageGap, ReviewCoverage, COMPLETE_COVERAGE } from './provider.ts';
export type { ProviderOutcome, ProviderOperation, ResolveTargetRequest, FetchSnapshotRequest, FetchedSnapshot, FetchedContent, RemoteFetchedFile, ListDiscussionsRequest, DiscussionListing, PublishCommentRequest, PublishedComment, ProviderIdentity, ReviewProvider } from './provider.ts';
/** providerOk(value) — wraps a successful provider result as a ProviderOutcome. */
export { providerOk } from './provider.ts';
/** providerUnsupported(provider, operation, message) — ProviderOutcome for an operation the provider does not offer. */
export { providerUnsupported } from './provider.ts';
/** providerFailed(provider, operation, message, details?, certainty?) — ProviderOutcome for a failed call; certainty defaults to uncertain. */
export { providerFailed } from './provider.ts';
/** samePosition(a, b) — true when two RemotePositions have identical SHAs, paths and lines. */
export { samePosition } from './provider.ts';
/** revisionMatches(pinned, current) — compares a pinned RemoteTarget with the live revision; returns { same } or the differences. */
export { revisionMatches } from './provider.ts';

// publication.ts: publication record, draft and outcome schemas and helpers.
export { PUBLICATION_SCHEMA_VERSION, PersistedPosition, UnplaceableFinding, PublicationPositions, CommentDraft, PublicationOutcome, SubmissionRecord, PublicationRecord } from './publication.ts';
/** emptyPublicationRecord(reviewId, at) — a fresh PublicationRecord with no drafts, outcomes or submissions. */
export { emptyPublicationRecord } from './publication.ts';
/** isSettled(state) — true when the comment already exists remotely (published or already-published), so publishing must refuse. */
export { isSettled } from './publication.ts';

// requirements.ts: captured requirement schemas and capture dependency shapes.
export { RequirementMode, RequirementSource, RequirementConflict, ProvenanceEntry, CapturedRequirement, CapturedHits, RequirementEvidence } from './requirements.ts';
export type { CaptureDeps, EnvelopeSource, EnvelopeInput, NormalizedRequirements, EvidenceSource } from './requirements.ts';

// review.ts: review result, finding, reviewer run and snapshot schemas and types.
export { ReviewTarget, REVIEW_SCHEMA_VERSION, SelectedFile, CheckResult, FindingLocation, Finding, ReviewerOutput, ReviewInputs, ReviewerUsage, ReviewerRun, ReviewRequirementMode, SelectionRecord, ReviewResult, SESSION_COOKIE, REVIEWER_TOOLS, REVIEWER_REPLAY_VARIABLE } from './review.ts';
export type { ReviewBundle, TargetSelection, ReviewEstimate, SweepReport, PageServer, ComposedPrompt, MeasuredInput, Snapshot, SnapshotEntry, SnapshotPlan } from './review.ts';

// search.ts: index adapter, locate and navigation shapes.
export { DEFAULT_LOCATE_LIMIT, PREPARE_REASONS_PER_CANDIDATE, PREPARE_SHORTLIST_LIMIT } from './search.ts';
export type { IndexName, IndexState, IndexStatus, IndexDeclaration, IndexReference, IndexAnswer, IndexAdapter, Dependent, RefsResult, LocateShortlist, NavigationGuidance, MapCandidate, MapSymbol, MapFeature } from './search.ts';

// skills.ts: skill gate names.
export { CHECKS_GATE } from './skills.ts';

// util.ts: JSON output format type.
export type { JsonFormat } from './util.ts';

// workers.ts: worker result shapes (plan check).
export type { BadAnchor, PlanCheckResult } from './workers.ts';
