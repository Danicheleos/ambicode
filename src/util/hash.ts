import { createHash } from 'node:crypto';

export function contentHash(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

/** The first 12 hex digits of a `contentHash`, for messages. */
export const hash12 = (hash: string): string => hash.replace(/^sha256:/, '').slice(0, 12);
