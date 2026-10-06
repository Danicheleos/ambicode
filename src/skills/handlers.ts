import { MODULE_HANDLERS } from './common.ts';
import { EVIDENCE_HANDLERS } from './evidence.ts';
import { INIT_HANDLERS } from './init/handlers.ts';
import { PLAN_HANDLERS } from './plan/handlers.ts';
import { REVIEW_HANDLERS } from './review/handlers.ts';
import { RULES_HANDLERS } from './rules/handlers.ts';
import { TASK_HANDLERS } from './task/handlers.ts';
import type { Handler } from '#types/harness';

export function skillHandlers(): Record<string, Handler> {
  return { ...MODULE_HANDLERS, ...EVIDENCE_HANDLERS, ...PLAN_HANDLERS, ...INIT_HANDLERS, ...RULES_HANDLERS, ...TASK_HANDLERS, ...REVIEW_HANDLERS };
}
