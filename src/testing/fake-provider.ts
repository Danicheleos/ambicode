import {
  providerFailed,
  providerOk,
  type DiscussionListing,
  type FetchedSnapshot,
  type ListDiscussionsRequest,
  type ProviderIdentity,
  type ProviderOutcome,
  type PublishCommentRequest,
  type PublishedComment,
  type RemoteDiscussion,
  type RemoteNote,
  type RemotePosition,
  type RemoteRevision,
  type RemoteTarget,
  type ReviewProvider,
} from '../contracts/provider.ts';

/**
 * A provider a test drives directly. It records every call, so "nothing was
 * published" and "the revision was re-checked before each comment" are
 * assertions rather than hopes.
 */

export const FAKE_TARGET: RemoteTarget = {
  provider: 'gitlab',
  host: 'gitlab.example.com',
  projectId: '91',
  projectPath: 'group/sub/project',
  sourceProjectId: '91',
  sourceProjectPath: 'group/sub/project',
  mergeRequestIid: 42,
  webUrl: 'https://gitlab.example.com/group/sub/project/-/merge_requests/42',
  versionId: 5,
  baseSha: 'a'.repeat(40),
  startSha: 'b'.repeat(40),
  headSha: 'c'.repeat(40),
};

export function currentRevision(overrides: Partial<RemoteRevision> = {}): RemoteRevision {
  return {
    state: 'current',
    provider: 'gitlab',
    host: FAKE_TARGET.host,
    projectId: FAKE_TARGET.projectId,
    mergeRequestIid: FAKE_TARGET.mergeRequestIid,
    headSha: FAKE_TARGET.headSha,
    versionId: FAKE_TARGET.versionId,
    collectedHeadSha: FAKE_TARGET.headSha,
    mergeRequestState: 'opened',
    reason: null,
    ...overrides,
  };
}

export function staleRevision(): RemoteRevision {
  return currentRevision({
    state: 'stale',
    headSha: 'd'.repeat(40),
    versionId: 6,
    collectedHeadSha: 'd'.repeat(40),
    reason: 'The merge request has moved since the review.',
  });
}

export function note(overrides: Partial<RemoteNote> & { id: string; discussionId: string }): RemoteNote {
  return {
    author: 'ambicode-bot',
    body: '',
    url: null,
    createdAt: null,
    updatedAt: null,
    resolved: null,
    resolvable: false,
    system: false,
    position: null,
    ...overrides,
  };
}

export function thread(id: string, notes: RemoteNote[]): RemoteDiscussion {
  return { id, resolved: false, notes };
}

export class FakeProvider implements ReviewProvider {
  readonly id = 'gitlab' as const;
  readonly calls: string[] = [];
  readonly published: PublishCommentRequest[] = [];

  /** Answers in order; the last one repeats once the queue runs dry. */
  revisions: RemoteRevision[] = [currentRevision()];
  identity: ProviderIdentity | null = { username: 'ambicode-bot', displayName: 'AMBICODE' };
  discussions: RemoteDiscussion[] = [];
  listingComplete = true;
  listFailure: string | null = null;
  /** Queued write answers; `null` entries mean "accept and confirm". */
  publishFailures: (string | null)[] = [];

  owns(url: string): boolean {
    return url.includes('/-/merge_requests/');
  }

  async resolveTarget(): Promise<ProviderOutcome<RemoteTarget>> {
    this.calls.push('resolveTarget');
    return providerOk(FAKE_TARGET);
  }

  async fetchSnapshot(): Promise<ProviderOutcome<FetchedSnapshot>> {
    this.calls.push('fetchSnapshot');
    return providerFailed('gitlab', 'fetchSnapshot', 'not used in these tests');
  }

  async getCurrentRevision(): Promise<ProviderOutcome<RemoteRevision>> {
    this.calls.push('getCurrentRevision');
    const next = this.revisions.length > 1 ? this.revisions.shift() : this.revisions[0];
    return providerOk(next ?? currentRevision());
  }

  async getIdentity(): Promise<ProviderOutcome<ProviderIdentity>> {
    this.calls.push('getIdentity');
    if (this.identity === null) {
      return providerFailed('gitlab', 'getIdentity', 'glab could not be started: no credentials.');
    }
    return providerOk(this.identity);
  }

  async listDiscussions(request: ListDiscussionsRequest): Promise<ProviderOutcome<DiscussionListing>> {
    this.calls.push(`listDiscussions:${request.maxDiscussions}`);
    if (this.listFailure !== null) {
      return providerFailed('gitlab', 'listDiscussions', this.listFailure);
    }
    return providerOk({
      discussions: this.discussions,
      complete: this.listingComplete,
      omissions: this.listingComplete ? [] : ['Some threads were not read.'],
    });
  }

  async publishComment(request: PublishCommentRequest): Promise<ProviderOutcome<PublishedComment>> {
    this.calls.push('publishComment');
    this.published.push(request);
    const failure = this.publishFailures.shift();
    if (failure !== undefined && failure !== null) {
      return providerFailed('gitlab', 'publishComment', failure);
    }
    const noteId = `n${this.published.length}`;
    const discussionId = `d${this.published.length}`;
    // A confirmed write is visible to the next reconciliation, exactly as a
    // real one would be.
    this.discussions = [
      ...this.discussions,
      thread(discussionId, [
        note({
          id: noteId,
          discussionId,
          author: this.identity?.username ?? '',
          body: request.body,
          position: request.position as RemotePosition,
        }),
      ]),
    ];
    return providerOk({
      discussionId,
      noteId,
      url: `${FAKE_TARGET.webUrl}#note_${noteId}`,
    });
  }
}
