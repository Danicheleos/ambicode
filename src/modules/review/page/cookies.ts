import { createHmac, timingSafeEqual } from 'node:crypto';

const mac = (secret: string, value: string): string => createHmac('sha256', secret).update(value).digest('base64url');

const sameText = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const signValue = (secret: string, value: string): string => `${value}.${mac(secret, value)}`;

/** `valid: false` for a value this secret did not sign, which on the fixed port means an earlier server. */
export function unsignValue(secret: string, signed: string): { valid: boolean; value: string | null } {
  const dot = signed.lastIndexOf('.');
  if (dot <= 0) return { valid: false, value: null };
  const value = signed.slice(0, dot);
  return sameText(signed.slice(dot + 1), mac(secret, value)) ? { valid: true, value } : { valid: false, value: null };
}

/** The form token is bound to the session, so a token from another session or server never matches. */
export const csrfTokenFor = (secret: string, sessionId: string): string => mac(secret, `csrf:${sessionId}`);
export const csrfMatches = (secret: string, sessionId: string, presented: unknown): boolean =>
  typeof presented === 'string' && sameText(presented, csrfTokenFor(secret, sessionId));

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** `Secure` is deliberately absent: plain HTTP on 127.0.0.1 would never send it back. */
export const sessionCookie = (name: string, value: string, maxAgeSeconds: number): string =>
  `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Strict`;
