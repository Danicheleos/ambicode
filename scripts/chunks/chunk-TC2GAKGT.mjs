#!/usr/bin/env node
import { createRequire as __ambicodeCreateRequire } from 'node:module';
const require = __ambicodeCreateRequire(import.meta.url);
import {
  COMPLETE_COVERAGE,
  RemoteDiscussion,
  RemotePosition,
  RemoteTarget,
  ReviewCoverage,
  contentHash,
  positionForLocation
} from "./chunk-5CQSZXN2.mjs";
import {
  CheckStatus,
  Confidence,
  ProviderId,
  PublicationState,
  ReviewStatus,
  Risk,
  TargetKind,
  external_exports
} from "./chunk-G3MJKSZ6.mjs";
import {
  AmbicodeError
} from "./chunk-WZ6VODTW.mjs";

// src/page/cleanup.ts
import path from "node:path";
var OWNERSHIP_MARKER = ".ambicode-owned.json";
var OWNED_PREFIXES = [
  "ambicode-snapshot-",
  "ambicode-page-",
  "ambicode-workspace-",
  "ambicode-index-",
  "ambicode-reviewer-"
];
var OwnershipMarker = external_exports.strictObject({
  tool: external_exports.literal("ambicode"),
  kind: external_exports.enum(["snapshot", "page-session", "workspace-inspection", "index", "reviewer-prompt"]),
  createdAt: external_exports.string().min(1),
  /** Informational; ownership does not depend on the process still existing. */
  pid: external_exports.number().int().nonnegative()
});
async function markOwned(fs, directory, kind, clock, pid) {
  const marker = {
    tool: "ambicode",
    kind,
    createdAt: clock.now().toISOString(),
    pid
  };
  await fs.writeText(path.join(directory, OWNERSHIP_MARKER), `${JSON.stringify(marker, null, 2)}
`);
}
async function readOwnership(fs, directory) {
  const marker = path.join(directory, OWNERSHIP_MARKER);
  if (!await fs.exists(marker)) return null;
  try {
    const parsed = OwnershipMarker.safeParse(JSON.parse(await fs.readText(marker)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
async function sweepOwnedTemporaries(options) {
  const report = { removed: [], skipped: [], failures: [] };
  const root = options.fs.temporaryRoot();
  const prefixes = options.prefixes ?? OWNED_PREFIXES;
  let entries;
  try {
    entries = await options.fs.readdir(root);
  } catch (error) {
    report.failures.push(
      `The temporary directory ${root} could not be listed, so no cleanup was attempted: ${describe(error)}`
    );
    return report;
  }
  const now = options.clock.now().getTime();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!prefixes.some((prefix) => entry.name.startsWith(prefix))) continue;
    const directory = path.join(root, entry.name);
    const marker = await readOwnership(options.fs, directory);
    if (marker === null) {
      report.skipped.push(directory);
      continue;
    }
    const age = now - Date.parse(marker.createdAt);
    if (!Number.isFinite(age) || age < options.maxAgeMs) continue;
    try {
      await options.fs.remove(directory);
      report.removed.push(directory);
    } catch (error) {
      report.failures.push(`${directory} could not be removed: ${describe(error)}`);
    }
  }
  return report;
}
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/page/reopen.ts
function reopenCommand(reviewId) {
  return `ambicode view --review ${reviewId}`;
}

// src/publication/store.ts
import path2 from "node:path";

// src/contracts/publication.ts
var PUBLICATION_SCHEMA_VERSION = 1;
var PersistedPosition = external_exports.strictObject({
  findingId: external_exports.string().min(1),
  provider: ProviderId,
  host: external_exports.string().min(1),
  projectId: external_exports.string().min(1),
  projectPath: external_exports.string().min(1),
  mergeRequestIid: external_exports.number().int().positive(),
  webUrl: external_exports.string().min(1),
  versionId: external_exports.number().int().positive(),
  position: RemotePosition,
  digest: external_exports.string().min(1)
});
var UnplaceableFinding = external_exports.strictObject({
  findingId: external_exports.string().min(1),
  reason: external_exports.string().min(1)
});
var PublicationPositions = external_exports.strictObject({
  schemaVersion: external_exports.literal(PUBLICATION_SCHEMA_VERSION),
  reviewId: external_exports.string().min(1),
  derivedAt: external_exports.string().min(1),
  target: RemoteTarget,
  positions: external_exports.array(PersistedPosition).default([]),
  unplaceable: external_exports.array(UnplaceableFinding).default([])
});
var CommentDraft = external_exports.strictObject({
  findingId: external_exports.string().min(1),
  body: external_exports.string(),
  selected: external_exports.boolean().default(false),
  updatedAt: external_exports.string().min(1)
});
var PublicationOutcome = external_exports.strictObject({
  findingId: external_exports.string().min(1),
  state: PublicationState,
  body: external_exports.string(),
  positionDigest: external_exports.string().nullable().default(null),
  discussionId: external_exports.string().nullable().default(null),
  noteId: external_exports.string().nullable().default(null),
  discussionUrl: external_exports.string().nullable().default(null),
  /** Operator-facing explanation; never a credential or a raw token. */
  message: external_exports.string().nullable().default(null),
  at: external_exports.string().min(1)
});
var SubmissionRecord = external_exports.strictObject({
  submissionId: external_exports.string().min(1),
  submittedAt: external_exports.string().min(1),
  stopped: external_exports.boolean(),
  stoppedReason: external_exports.string().nullable().default(null),
  revisionState: external_exports.string().nullable().default(null),
  outcomes: external_exports.array(PublicationOutcome).default([])
});
var PublicationRecord = external_exports.strictObject({
  schemaVersion: external_exports.literal(PUBLICATION_SCHEMA_VERSION),
  reviewId: external_exports.string().min(1),
  updatedAt: external_exports.string().min(1),
  drafts: external_exports.array(CommentDraft).default([]),
  /** The newest outcome per finding wins. */
  outcomes: external_exports.array(PublicationOutcome).default([]),
  submissions: external_exports.array(SubmissionRecord).default([])
});
function emptyPublicationRecord(reviewId, at) {
  return {
    schemaVersion: PUBLICATION_SCHEMA_VERSION,
    reviewId,
    updatedAt: at,
    drafts: [],
    outcomes: [],
    submissions: []
  };
}
function isSettled(state) {
  return state === "published" || state === "already-published";
}

// src/contracts/requirements.ts
var RequirementMode = external_exports.enum(["source-free", "requirement-based"]);
var RequirementSource = external_exports.strictObject({
  id: external_exports.string().min(1),
  url: external_exports.string().min(1),
  title: external_exports.string(),
  retrievedAt: external_exports.string().min(1),
  sourceVersion: external_exports.string().nullable().default(null),
  updatedAt: external_exports.string().nullable().default(null),
  content: external_exports.string(),
  citations: external_exports.array(external_exports.string()).default([]),
  status: external_exports.enum(["retrieved", "unavailable", "forbidden", "not-found"]),
  failureReason: external_exports.string().nullable().default(null),
  retrievedVia: external_exports.string().min(1)
});
var RequirementConflict = external_exports.strictObject({
  summary: external_exports.string().min(1),
  sourceIds: external_exports.array(external_exports.string().min(1)).min(2),
  detectedBy: external_exports.enum(["helper", "session"])
});
var ProvenanceEntry = external_exports.strictObject({
  kind: external_exports.enum(["prompt", "pack", "config", "requirement"]),
  reference: external_exports.string().min(1),
  contentHash: external_exports.string().min(1)
});

// src/contracts/review.ts
var REVIEW_SCHEMA_VERSION = 1;
var ReviewTarget = external_exports.strictObject({
  kind: TargetKind,
  repositoryRoot: external_exports.string().min(1),
  snapshotId: external_exports.string().min(1),
  headSha: external_exports.string().min(1).nullable(),
  baseSha: external_exports.string().min(1).nullable(),
  baseRef: external_exports.string().nullable(),
  remote: RemoteTarget.nullable(),
  notes: external_exports.array(external_exports.string()).default([])
});
var SelectedFile = external_exports.strictObject({
  path: external_exports.string().min(1),
  reason: external_exports.string().min(1)
});
var CheckResult = external_exports.strictObject({
  checkId: external_exports.string().min(1),
  projectId: external_exports.string().min(1),
  commandId: external_exports.string().min(1),
  adapter: external_exports.string().min(1),
  status: CheckStatus,
  selected: external_exports.array(SelectedFile).default([]),
  selectionComplete: external_exports.boolean(),
  argv: external_exports.array(external_exports.string()).default([]),
  cwd: external_exports.string().nullable().default(null),
  durationMs: external_exports.number().int().nonnegative().nullable().default(null),
  exitCode: external_exports.number().int().nullable().default(null),
  outputRef: external_exports.string().nullable().default(null),
  limitations: external_exports.array(external_exports.string()).default([]),
  /** Source or index changes this command made, reported and never reverted. */
  mutations: external_exports.array(external_exports.string()).default([])
});
var FindingLocation = external_exports.strictObject({
  oldPath: external_exports.string().nullable(),
  newPath: external_exports.string().nullable(),
  side: external_exports.enum(["old", "new"]),
  line: external_exports.number().int().positive()
});
var Finding = external_exports.strictObject({
  id: external_exports.string().min(1),
  risk: Risk,
  confidence: Confidence,
  category: external_exports.string().min(1),
  location: FindingLocation,
  supportingLocations: external_exports.array(FindingLocation).default([]),
  /** Excerpt taken from the snapshot by the validator, never from the model. */
  evidence: external_exports.string(),
  explanation: external_exports.string().min(1),
  suggestedComment: external_exports.string().min(1),
  ruleRefs: external_exports.array(external_exports.string()).default([]),
  requirementRefs: external_exports.array(external_exports.string()).default([])
});
var ReviewerOutput = external_exports.strictObject({
  findings: external_exports.array(
    external_exports.strictObject({
      risk: Risk,
      confidence: Confidence,
      category: external_exports.string().min(1),
      location: FindingLocation,
      supportingLocations: external_exports.array(FindingLocation).default([]),
      explanation: external_exports.string().min(1),
      suggestedComment: external_exports.string().min(1),
      ruleRefs: external_exports.array(external_exports.string()).default([]),
      requirementRefs: external_exports.array(external_exports.string()).default([])
    })
  ).default([]),
  coverageNotes: external_exports.array(external_exports.string()).default([])
});
var ReviewInputs = external_exports.strictObject({
  changedFiles: external_exports.number().int().nonnegative(),
  changedLines: external_exports.number().int().nonnegative(),
  patchBytes: external_exports.number().int().nonnegative(),
  snapshotBytes: external_exports.number().int().nonnegative(),
  requirementBytes: external_exports.number().int().nonnegative().default(0),
  promptBytes: external_exports.number().int().nonnegative().default(0),
  contextBytes: external_exports.number().int().nonnegative(),
  limits: external_exports.strictObject({
    maxChangedFiles: external_exports.number().int().positive(),
    maxChangedLines: external_exports.number().int().positive(),
    maxContextBytes: external_exports.number().int().positive(),
    maxFindings: external_exports.number().int().positive()
  })
});
var ReviewerUsage = external_exports.strictObject({
  turns: external_exports.number().int().nonnegative().nullable(),
  apiDurationMs: external_exports.number().int().nonnegative().nullable(),
  outputTokens: external_exports.number().int().nonnegative().nullable(),
  costUsd: external_exports.number().nonnegative().nullable(),
  thinkingTokens: external_exports.number().int().nonnegative().nullable().default(null)
});
var ReviewerRun = external_exports.strictObject({
  status: external_exports.enum(["ok", "not-run", "failed"]),
  provider: external_exports.enum(["claude", "codex"]).optional(),
  model: external_exports.string().min(1),
  timeoutSeconds: external_exports.number().int().positive(),
  tools: external_exports.array(external_exports.string()).default([]),
  isolation: external_exports.array(external_exports.string()).default([]),
  rejections: external_exports.array(external_exports.string()).default([]),
  detail: external_exports.string().nullable().default(null),
  durationMs: external_exports.number().int().nonnegative().nullable().default(null),
  usage: ReviewerUsage.nullable().default(null),
  rejectedOutputRef: external_exports.string().nullable().default(null),
  /**
   * Present only for an answer replayed from a recording (`EVAL_AMBICODE_REVIEWER_REPLAY`),
   * so a replay never reads as a review; absent otherwise, keeping ordinary results byte-identical.
   */
  source: external_exports.literal("replay").optional()
});
var ReviewRequirementMode = external_exports.enum(["quality-review", "requirement-based"]);
var ReviewResult = external_exports.strictObject({
  schemaVersion: external_exports.literal(REVIEW_SCHEMA_VERSION),
  reviewId: external_exports.string().min(1),
  createdAt: external_exports.string().min(1),
  pluginVersion: external_exports.string().min(1),
  reviewModel: external_exports.string().min(1),
  target: ReviewTarget,
  requirements: external_exports.array(RequirementSource).default([]),
  requirementMode: ReviewRequirementMode,
  requirementConflicts: external_exports.array(RequirementConflict).default([]),
  provenance: external_exports.array(ProvenanceEntry).default([]),
  inputs: ReviewInputs,
  reviewer: ReviewerRun.nullable().default(null),
  policySummary: external_exports.strictObject({
    packs: external_exports.array(external_exports.string()).default([]),
    ruleIds: external_exports.array(external_exports.string()).default([])
  }),
  checks: external_exports.array(CheckResult).default([]),
  coverage: ReviewCoverage.default(COMPLETE_COVERAGE),
  /** Pre-existing threads: evidence for deduplication, never proof that a defect was fixed. */
  discussions: external_exports.array(RemoteDiscussion).default([]),
  changedFiles: external_exports.array(
    external_exports.strictObject({
      oldPath: external_exports.string().nullable(),
      newPath: external_exports.string().nullable(),
      changeKind: external_exports.enum(["added", "modified", "deleted", "renamed", "copied", "type-changed"]),
      addedLines: external_exports.number().int().nonnegative(),
      removedLines: external_exports.number().int().nonnegative(),
      included: external_exports.boolean(),
      exclusionReason: external_exports.string().nullable().default(null)
    })
  ).default([]),
  findings: external_exports.array(Finding).default([]),
  omissions: external_exports.array(external_exports.string()).default([]),
  status: ReviewStatus,
  statusReason: external_exports.string().nullable().default(null)
});

// src/publication/store.ts
var RESULT_FILE = "result.json";
var POSITIONS_FILE = "publication-positions.json";
var PUBLICATION_FILE = "publication.json";
var ReviewStore = class {
  fs;
  clock;
  directory;
  constructor(fs, clock, reviewDirectory) {
    this.fs = fs;
    this.clock = clock;
    this.directory = reviewDirectory;
  }
  pathOf(file) {
    return path2.join(this.directory, file);
  }
  async readResult() {
    const raw = await this.readJson(RESULT_FILE);
    if (raw === null) {
      throw new AmbicodeError("review-not-found", `No saved review result at ${this.pathOf(RESULT_FILE)}.`, {
        details: ["Run `ambicode review` first, or pass the path of a result.json that exists."]
      });
    }
    const parsed = ReviewResult.safeParse(raw);
    if (!parsed.success) {
      throw new AmbicodeError(
        "review-result-invalid",
        `The saved review result at ${this.pathOf(RESULT_FILE)} does not match the schema AMBICODE expects.`,
        {
          details: [
            ...parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
            "AMBICODE will not display or publish from a result it could not validate."
          ]
        }
      );
    }
    return parsed.data;
  }
  async readPositions() {
    const raw = await this.readJson(POSITIONS_FILE);
    if (raw === null) return null;
    const parsed = PublicationPositions.safeParse(raw);
    if (!parsed.success) {
      throw new AmbicodeError(
        "publication-positions-invalid",
        `The saved publication positions at ${this.pathOf(POSITIONS_FILE)} could not be validated.`,
        {
          details: [
            ...parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
            "Positions are never recomputed from the current merge request, so nothing can be published from this review."
          ]
        }
      );
    }
    return parsed.data;
  }
  async writePositions(positions) {
    await this.writeJson(POSITIONS_FILE, PublicationPositions.parse(positions));
  }
  async readPublication(reviewId) {
    const raw = await this.readJson(PUBLICATION_FILE);
    if (raw === null) return emptyPublicationRecord(reviewId, this.clock.now().toISOString());
    const parsed = PublicationRecord.safeParse(raw);
    if (!parsed.success) {
      throw new AmbicodeError(
        "publication-record-invalid",
        `The saved publication state at ${this.pathOf(PUBLICATION_FILE)} could not be validated.`,
        {
          details: [
            ...parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
            "Publishing again from an unreadable history could duplicate comments, so it is refused."
          ]
        }
      );
    }
    return parsed.data;
  }
  async writePublication(record) {
    await this.writeJson(PUBLICATION_FILE, PublicationRecord.parse(record));
  }
  async saveDrafts(record, drafts) {
    const merged = new Map(record.drafts.map((draft) => [draft.findingId, draft]));
    for (const draft of drafts) merged.set(draft.findingId, draft);
    const next = {
      ...record,
      drafts: [...merged.values()].sort((a, b) => a.findingId.localeCompare(b.findingId)),
      updatedAt: this.clock.now().toISOString()
    };
    await this.writePublication(next);
    return next;
  }
  async recordSubmission(record, submission) {
    const outcomes = new Map(record.outcomes.map((outcome) => [outcome.findingId, outcome]));
    for (const outcome of submission.outcomes) {
      const previous = outcomes.get(outcome.findingId);
      if (previous !== void 0 && isTerminal(previous) && !isTerminal(outcome)) continue;
      outcomes.set(outcome.findingId, outcome);
    }
    const next = {
      ...record,
      outcomes: [...outcomes.values()].sort((a, b) => a.findingId.localeCompare(b.findingId)),
      submissions: [...record.submissions, submission],
      updatedAt: this.clock.now().toISOString()
    };
    await this.writePublication(next);
    return next;
  }
  async readJson(file) {
    const absolute = this.pathOf(file);
    if (!await this.fs.exists(absolute)) return null;
    const text = await this.fs.readText(absolute);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new AmbicodeError("review-file-unreadable", `${absolute} is not valid JSON.`, {
        details: [error instanceof Error ? error.message : String(error)]
      });
    }
  }
  async writeJson(file, value) {
    await this.fs.mkdirp(this.directory);
    const destination = this.pathOf(file);
    const temporary = `${destination}.writing`;
    await this.fs.writeText(temporary, `${JSON.stringify(value, null, 2)}
`);
    await this.fs.rename(temporary, destination);
  }
};
function isTerminal(outcome) {
  return outcome.state === "published" || outcome.state === "already-published";
}

// src/cli/view-options.ts
var VIEW_OPTIONS = {
  values: ["review"],
  flags: ["json", "no-open"]
};

// src/publication/positions.ts
function positionDigest(reviewId, findingId, target, position) {
  const seed = [
    reviewId,
    findingId,
    target.provider,
    target.host,
    target.projectId,
    String(target.mergeRequestIid),
    String(target.versionId),
    position.baseSha,
    position.startSha,
    position.headSha,
    position.oldPath ?? "",
    position.newPath ?? "",
    position.oldLine === null ? "" : String(position.oldLine),
    position.newLine === null ? "" : String(position.newLine)
  ].join("\0");
  return contentHash(seed);
}
function derivePositions(options) {
  const positions = [];
  const unplaceable = [];
  for (const finding of options.findings) {
    const mapped = positionForLocation(options.target, options.files, finding.location);
    if (mapped.kind !== "ok") {
      unplaceable.push({
        findingId: finding.id,
        reason: `No exact position could be derived for this finding: ${mapped.reason} It can be read here, but it cannot be published as a merge request comment.`
      });
      continue;
    }
    positions.push({
      findingId: finding.id,
      provider: options.target.provider,
      host: options.target.host,
      projectId: options.target.projectId,
      projectPath: options.target.projectPath,
      mergeRequestIid: options.target.mergeRequestIid,
      webUrl: options.target.webUrl,
      versionId: options.target.versionId,
      position: mapped.position,
      digest: positionDigest(options.reviewId, finding.id, options.target, mapped.position)
    });
  }
  return {
    schemaVersion: PUBLICATION_SCHEMA_VERSION,
    reviewId: options.reviewId,
    derivedAt: options.derivedAt,
    target: options.target,
    positions,
    unplaceable
  };
}

export {
  RequirementMode,
  RequirementSource,
  RequirementConflict,
  ProvenanceEntry,
  REVIEW_SCHEMA_VERSION,
  ReviewerOutput,
  markOwned,
  sweepOwnedTemporaries,
  reopenCommand,
  isSettled,
  positionDigest,
  derivePositions,
  ReviewStore,
  VIEW_OPTIONS
};
