import { randomBytes, randomUUID } from 'node:crypto';

export interface IdSource {
  reviewId(): string;
  /** Names the holder of a route; recorded in the ledger, never a grant of consent. */
  ownerId(): string;
  /** URL-safe capability with at least 128 bits of entropy. */
  capability(): string;
  csrfToken(): string;
  /** 8 lowercase hex characters naming a writer that has no session. */
  writerId(): string;
}

export const systemIds: IdSource = {
  reviewId: () => randomUUID(),
  ownerId: () => randomUUID(),
  capability: () => randomBytes(32).toString('base64url'),
  csrfToken: () => randomBytes(32).toString('base64url'),
  writerId: () => randomBytes(4).toString('hex'),
};
