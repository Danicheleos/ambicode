import { timingSafeEqual } from 'node:crypto';
import type { Clock, IdSource } from '#types/ports';

/**
 * In memory for one `ambicode view` process, never on disk or in a log. The
 * token is reusable for that lifetime from any browser: a one-time link would
 * be spent by the browser launch before the link reported in chat is opened.
 */

export interface Session {
  readonly id: string;
  readonly createdAt: number;
  lastSeenAt: number;
  inFlightSubmissionId: string | null;
  readonly seenSubmissions: Set<string>;
}

export type CapabilityResult =
  | { kind: 'ok'; session: Session }
  | { kind: 'rejected'; reason: string };

export interface SessionStoreOptions {
  ids: IdSource;
  clock: Clock;
  sessionTtlMs: number;
}

export class SessionStore {
  private readonly ids: IdSource;
  private readonly clock: Clock;
  private readonly sessionTtlMs: number;
  private readonly sessions = new Map<string, Session>();
  private capability: string | null = null;

  constructor(options: SessionStoreOptions) {
    this.ids = options.ids;
    this.clock = options.clock;
    this.sessionTtlMs = options.sessionTtlMs;
  }

  issueCapability(): string {
    this.capability = this.ids.capability();
    return this.capability;
  }

  redeemCapability(presented: string): CapabilityResult {
    const held = this.capability;
    if (held === null) {
      return { kind: 'rejected', reason: 'This review page is no longer serving.' };
    }
    // Bytes, not characters: `timingSafeEqual` throws on a length mismatch, and
    // four characters of `é` are eight bytes against the capability's four.
    const presentedBytes = Buffer.from(presented, 'utf8');
    const heldBytes = Buffer.from(held, 'utf8');
    if (presentedBytes.length !== heldBytes.length || !timingSafeEqual(presentedBytes, heldBytes)) {
      return {
        kind: 'rejected',
        reason: 'It was printed by an earlier ambicode view, which has stopped or was replaced by a newer one.',
      };
    }
    return { kind: 'ok', session: this.create(this.clock.now().getTime()) };
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

  touch(session: Session): void {
    session.lastSeenAt = this.clock.now().getTime();
  }

  /**
   * Claims the session's single publication slot. A concurrent submission and a
   * replay are both refused, so a double-click cannot become two sets of comments.
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

  clear(): void {
    this.sessions.clear();
    this.capability = null;
  }

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
