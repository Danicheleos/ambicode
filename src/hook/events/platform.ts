/**
 * What the platform does with an AskUserQuestion answer (probes P2, P48): observed for single-select answers
 * in the interactive dialog (plan/migration-v6-reports/step-03/probe-p2-p48.md). Adapters are tested in both states.
 */
export type Support = 'supported' | 'unsupported';

export const ASK_BINDING: Support = 'supported';
export const ANSWER_CONTEXT: Support = 'supported';

export interface PlatformFlags { askBinding: Support; answerContext: Support }

export const PLATFORM: PlatformFlags = { askBinding: ASK_BINDING, answerContext: ANSWER_CONTEXT };
