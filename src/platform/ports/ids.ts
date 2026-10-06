import { randomBytes, randomUUID } from 'node:crypto';
import type { IdSource } from '#types/ports';

export const systemIds: IdSource = {
  reviewId: () => randomUUID(),
  ownerId: () => randomUUID(),
  capability: () => randomBytes(32).toString('base64url'),
  csrfToken: () => randomBytes(32).toString('base64url'),
  writerId: () => randomBytes(4).toString('hex'),
};
