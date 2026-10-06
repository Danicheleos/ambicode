import {
  providerUnsupported,
  type DiscussionListing,
  type FetchedSnapshot,
  type ProviderIdentity,
  type ProviderOperation,
  type ProviderOutcome,
  type PublishedComment,
  type RemoteRevision,
  type RemoteTarget,
  type ReviewProvider,
} from '#types/provider';

/** Deliberately imports no runner, HTTP client or GitLab code, so it can never reach a remote. */

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com', 'gist.github.com']);

const MESSAGE =
  'AMBICODE does not support GitHub pull requests. Phase 1 implements GitLab merge requests; GitHub is a registered extension point with no API integration behind it.';

const DETAIL =
  'Review the change locally instead: `ambicode review` for uncommitted work, `ambicode review --branch --base <ref>` for the branch this pull request would carry.';

export class GitHubProvider implements ReviewProvider {
  readonly id = 'github' as const;

  owns(url: string): boolean {
    try {
      const parsed = new URL(url);
      return GITHUB_HOSTS.has(parsed.hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  async resolveTarget(): Promise<ProviderOutcome<RemoteTarget>> {
    return this.unsupported('resolveTarget');
  }

  async fetchSnapshot(): Promise<ProviderOutcome<FetchedSnapshot>> {
    return this.unsupported('fetchSnapshot');
  }

  async getCurrentRevision(): Promise<ProviderOutcome<RemoteRevision>> {
    return this.unsupported('getCurrentRevision');
  }

  async getIdentity(): Promise<ProviderOutcome<ProviderIdentity>> {
    return this.unsupported('getIdentity');
  }

  async listDiscussions(): Promise<ProviderOutcome<DiscussionListing>> {
    return this.unsupported('listDiscussions');
  }

  async publishComment(): Promise<ProviderOutcome<PublishedComment>> {
    return this.unsupported('publishComment');
  }

  private unsupported<T>(operation: ProviderOperation): ProviderOutcome<T> {
    return providerUnsupported<T>('github', operation, `${MESSAGE} ${DETAIL}`);
  }
}
