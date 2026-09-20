/**
 * One error type for every condition an operator can act on. `details` never
 * carries the offending value: configuration may hold private data (doc 05).
 */
export class AmbicodeError extends Error {
  readonly code: string;
  readonly field?: string;
  readonly details: string[];

  constructor(code: string, message: string, options: { field?: string; details?: string[]; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AmbicodeError';
    this.code = code;
    this.field = options.field;
    this.details = options.details ?? [];
  }
}

export function isAmbicodeError(value: unknown): value is AmbicodeError {
  return value instanceof AmbicodeError;
}
