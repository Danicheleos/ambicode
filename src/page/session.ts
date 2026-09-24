import { timingSafeEqual } from 'node:crypto';
import type { Clock } from '../ports/clock.ts';
import type { IdSource } from '../ports/ids.ts';

/**
 * The one-time capability and the server-side sessions it becomes.
 *
 * Everything here lives in memory for the lifetime of one `ambicode view`
 * process and is never written to disk or to a log. The capability appears once,
 * in the URL printed to the terminal; after it is consumed the browser holds
 * only an opaque session id in a signed cookie, and the capability is dead.
 */

/** A capability is short-lived on purpose: it exists to survive a browser launch. */
export const CAPABILITY_TTL_MS = 5 * 60 * 1000;

export interface Session {
  readonly id: string;
  readonly createdAt: number;
  lastSeenAt: number;
  /** The submission currently being published, if any. Serializes writes. */
  inFlightSubmissionId: string | null;
  /** Submissions already accepted, so a replayed POST is rejected. */
  readonly seenSubmissions: Set<string>;
}

export type CapabilityResult =
  | { kind: 'ok'; session: Session }
  | { kind: 'rejected'; reason: string };

export interface SessionStoreOptions {
  ids: IdSource;
  clock: Clock;
  /** How long a session cookie stays valid without activity. */
  sessionTtlMs: number;
  capabilityTtlMs?: number;
}

export class SessionStore {
  private readonly ids: IdSource;
  private readonly clock: Clock;
  private readonly sessionTtlMs: number;
  private readonly capabilityTtlMs: number;
  private readonly sessions = new Map<string, Session>();
  private capability: { value: string; issuedAt: number; consumed: boolean } | null = null;

  constructor(options: SessionStoreOptions) {
    this.ids = options.ids;
    this.clock = options.clock;
    this.sessionTtlMs = options.sessionTtlMs;
    this.capabilityTtlMs = options.capabilityTtlMs ?? CAPABILITY_TTL_MS;
  }

  /** Issues the single capability this server will ever accept. */
  issueCapability(): string {
    const value = this.ids.capability();
    this.capability = { value, issuedAt: this.clock.now().getTime(), consumed: false };
    return value;
  }

  /**
   * Consumes the capability exactly once. A second use of the same value, a
   * value that was never issued, and an expired one all fail the same way: the
   * page is reachable only by the browser that arrived first.
   */
  consumeCapability(presented: string): CapabilityResult {
    const held = this.capability;
    if (held === null) {
      return { kind: 'rejected', reason: 'This server has no capability to consume.' };
    }
    // Bytes, not characters: `timingSafeEqual` throws on a length mismatch, and
    // four characters of `é` are eight bytes against the capability's four.
    const presentedBytes = Buffer.from(presented, 'utf8');
    const heldBytes = Buffer.from(held.value, 'utf8');
    if (presentedBytes.length !== heldBytes.length || !timingSafeEqual(presentedBytes, heldBytes)) {
      return { kind: 'rejected', reason: 'That capability is not the one this server issued.' };
    }
    if (held.consumed) {
      return {
        kind: 'rejected',
        reason: 'That capability has already been used. Reopen the review to get a new one.',
      };
    }
    const now = this.clock.now().getTime();
    if (now - held.issuedAt > this.capabilityTtlMs) {
      return { kind: 'rejected', reason: 'That capability has expired. Reopen the review to get a new one.' };
    }
    held.consumed = true;
    return { kind: 'ok', session: this.create(now) };
  }

  private create(now: number): Session {
    const session: Session = {
      id: this.ids.capability(),
      createdAt: now,
      lastSeenAt: now,
      inFlightSubmissionId: null,
      seenSubmissions: new Set<string>(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** The session a cookie names, if it exists and has not idled out. */
  get(sessionId: string | undefined): Session | null {
    if (sessionId === undefined) return null;
    const session = this.sessions.get(sessionId);
    if (session === undefined) return null;
    if (this.clock.now().getTime() - session.lastSeenAt > this.sessionTtlMs) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  /** Activity is recorded only for requests that already authenticated. */
  touch(session: Session): void {
    session.lastSeenAt = this.clock.now().getTime();
  }

  /**
   * Claims the session's single publication slot. A concurrent submission and a
   * replay of one already accepted are both refused, so a double-click cannot
   * become two sets of comments.
   */
  beginSubmission(session: Session, submissionId: string): { ok: true } | { ok: false; reason: string } {
    if (session.inFlightSubmissionId !== null) {
      return {
        ok: false,
        reason: 'A publication is already running for this session. Wait for it to finish before submitting again.',
      };
    }
    if (session.seenSubmissions.has(submissionId)) {
      return {
        ok: false,
        reason: 'This form was already submitted. Reload the page to see what happened rather than sending it twice.',
      };
    }
    session.seenSubmissions.add(submissionId);
    session.inFlightSubmissionId = submissionId;
    return { ok: true };
  }

  endSubmission(session: Session): void {
    session.inFlightSubmissionId = null;
  }

  /** Drops every session, e.g. at shutdown, so no cookie stays valid. */
  clear(): void {
    this.sessions.clear();
    this.capability = null;
  }

  /** Whether any session holds its publication slot right now. */
  get publishing(): boolean {
    for (const session of this.sessions.values()) {
      if (session.inFlightSubmissionId !== null) return true;
    }
    return false;
  }

  get sessionCount(): number {
    return this.sessions.size;
  }
}
