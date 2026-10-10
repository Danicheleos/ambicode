import { MODULE_HANDLERS } from './common.ts';
import { EVIDENCE_HANDLERS } from './evidence.ts';
import { INIT_HANDLERS } from './init/handlers.ts';
import './plan/handlers.ts';
import { REVIEW_HANDLERS } from './review/handlers.ts';
import './rules/handlers.ts';
import { TASK_HANDLERS } from './task/handlers.ts';
import { scriptHandler } from '#harness/engine/script';
import type { Handler } from '#types/harness';

export function skillHandlers(): Record<string, Handler> {
  return { script: scriptHandler, ...MODULE_HANDLERS, ...EVIDENCE_HANDLERS, ...INIT_HANDLERS, ...TASK_HANDLERS, ...REVIEW_HANDLERS };
}
