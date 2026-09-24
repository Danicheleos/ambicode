import { timingSafeEqual } from 'node:crypto';
import type { Clock } from '../ports/clock.ts';
import type { IdSource } from '../ports/ids.ts';

/**
 * The page's link token and the server-side sessions it becomes.
 *
 * Everything here lives in memory for the lifetime of one `ambicode view`
 * process and is never written to disk or to a log. The token is valid for
 * that whole lifetime, from any browser on the machine, any number of times:
 * a one-time link was spent by the browser launch, so the link the agent
 * reported in chat always led to "needs the link" (MR 2719). It dies with the
 * process, and the next `ambicode view` replaces the process.
 */

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

  /** Issues the single link token this server will ever accept. */
  issueCapability(): string {
    this.capability = this.ids.capability();
    return this.capability;
  }

  /** Each visit with the issued token opens a new session; any other value is refused. */
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
