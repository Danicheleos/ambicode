import {
  providerUnsupported,
  type DiscussionListing,
  type FetchedSnapshot,
  type ProviderOperation,
  type ProviderOutcome,
  type PublishedComment,
  type RemoteRevision,
  type RemoteTarget,
  type ReviewProvider,
} from '../../contracts/provider.ts';

/**
 * The GitHub extension point (D02). Phase 1 ships the registration and the
 * typed unsupported answer, not an API integration.
 *
 * This module has no process runner, no HTTP client and no import of the GitLab
 * adapter, so an unsupported answer cannot become a GitLab request by accident
 * and cannot resemble a remote success. Local working and branch review does
 * not pass through a provider at all, so registering this one changes nothing
 * about it.
 *
 * Making GitHub work means implementing these five methods here and changing
 * one line in the registry — not touching the reviewer, the snapshot, the
 * report or the page.
 */

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
