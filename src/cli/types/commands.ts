import type { Engine, RouteRegistry, SessionBinding } from '#types/harness';
import type { SweepReport } from '#types/modules/review';
import type { OptionSpec } from './cli.ts';
import { TARGET_OPTIONS } from './options.ts';

export const CHECK_OPTIONS = { values: ['task', 'phase'], repeated: ['only', 'approve', 'decline'], flags: ['json'], positionals: true } as const;

export const FORMAT_OPTIONS = { values: ['task'], flags: ['json'], positionals: true } as const;

export const CONFIG_OPTIONS = { flags: ['json'] } as const;

export const DOCTOR_OPTIONS = { values: ['project'], flags: ['json'] } as const;

export const INIT_OPTIONS = { values: ['task'], repeated: ['set'], flags: ['json', 'dry-run', 'apply', 'refresh-profile'] } as const;

export const POLICY_CHECK_OPTIONS = {
  values: ['project', 'task'],
  flags: ['json', 'drafts'],
  positionals: true,
} as const;

export const POLICY_OPTIONS = {
  values: ['project', 'activity', 'stage'],
  /** Qualified ids (`pack/rule`): read just those rules, once, instead of the whole set. */
  repeated: ['rule'],
  flags: ['json', 'show'],
  // The one command whose operands are data: the paths policy is resolved for.
  positionals: true,
} as const;

export const RULES_DISCOVER_OPTIONS = { values: ['project'], flags: ['json'], positionals: true } as const;

export const RULES_APPLY_OPTIONS = { values: ['task', 'project'], flags: ['json'] } as const;

export const RULES_REVERT_OPTIONS = { values: ['project'], flags: ['json'], positionals: true } as const;

export const REQUIREMENTS_TEMPLATE_OPTIONS = { values: ['task'], repeated: ['requirement'], flags: ['json'] } as const;

export const REQUIREMENTS_NORMALIZE_OPTIONS = { values: ['task'], flags: ['json'] } as const;

export const REQUIREMENTS_ACS_OPTIONS = { values: ['task'], flags: ['json'] } as const;

export const BUNDLE_OPTIONS = TARGET_OPTIONS;

export const REVIEW_OPTIONS: OptionSpec = { ...TARGET_OPTIONS, flags: [...TARGET_OPTIONS.flags, 'estimate'] };

export interface ViewOutput {
  command: 'view';
  reviewId: string;
  reviewDirectory: string;
  url: string;
  port: number;
  browserOpened: boolean;
  browserDetail: string;
  idleTimeoutSeconds: number;
  publicationAvailable: boolean;
  notes: string[];
  cleanup: SweepReport;
  stopped: Promise<string>;
  stop(reason: string): Promise<void>;
}

export const NOTE_SAVE_OPTIONS = {
  values: ['task', 'kind', 'from', 'iteration'],
  flags: ['json'],
} as const;

export const NOTE_PROMOTE_OPTIONS = { values: ['task'], flags: ['json'] } as const;

export const NOTE_LIST_OPTIONS = { values: ['task'], flags: ['json'] } as const;

export const REPORT_OPTIONS = { values: ['task'], flags: ['json'] } as const;

export const ROUTE_NEXT_OPTIONS = { values: ['task', 'default', 'revise', 'conflict', 'sources', 'project', 'show'], repeated: ['answer'], flags: ['json'] } as const;

export const ROUTE_STATUS_OPTIONS = { values: ['task'], flags: ['json'] } as const;

export const ROUTE_STOP_OPTIONS = { values: ['task', 'reason', 'detail'], flags: ['json'] } as const;

export interface RouteTools { engine: Engine; routes: RouteRegistry; binding: SessionBinding }

export const LOCATE_OPTIONS = {
  values: ['project', 'evidence', 'limit'],
  flags: ['json'],
  positionals: true,
} as const;

export const MAP_OPTIONS = { values: ['task', 'project', 'mode', 'layers'], repeated: ['term', 'symbol'], flags: ['json', 'show'], positionals: true } as const;

export const REFS_OPTIONS = { values: ['project', 'task'], flags: ['json', 'show'], positionals: true } as const;

export const FIND_OPTIONS = { values: ['project', 'task', 'kind'], flags: ['json'], positionals: true } as const;

export const RELATES_OPTIONS = { values: ['project', 'task'], flags: ['json', 'show'], positionals: true } as const;

export const INDEX_OPTIONS = { values: ['project'], flags: ['json'] } as const;

export const PLAN_CHECK_OPTIONS = { values: ['task', 'from'], flags: ['json'] } as const;

export const WORKER_RUN_OPTIONS = { values: ['task'], flags: ['json'], positionals: true } as const;
