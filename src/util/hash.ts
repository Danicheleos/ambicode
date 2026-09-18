import { createHash } from 'node:crypto';

/** Short stable content identity used for provenance records. */
export function contentHash(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}
