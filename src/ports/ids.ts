import { randomBytes, randomUUID } from 'node:crypto';

export interface IdSource {
  reviewId(): string;
  /** URL-safe capability with at least 128 bits of entropy. */
  capability(): string;
  csrfToken(): string;
}

export const systemIds: IdSource = {
  reviewId: () => randomUUID(),
  capability: () => randomBytes(32).toString('base64url'),
  csrfToken: () => randomBytes(32).toString('base64url'),
};
