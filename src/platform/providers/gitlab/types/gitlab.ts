import type { DeliveryCertainty } from '#types/provider';

export type ApiResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'failed'; message: string; details: string[]; certainty: DeliveryCertainty };
