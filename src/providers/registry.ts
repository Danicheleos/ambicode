import type { ProviderId } from '../contracts/primitives.ts';
import type { ReviewProvider } from '../contracts/provider.ts';
import { AmbicodeError } from '../util/errors.ts';

/**
 * The one place a provider is chosen. Consumers hold a `ProviderRegistry` and
 * ask it for the provider that owns a URL; no other module contains a
 * provider-name switch (doc 02).
 */
export class ProviderRegistry {
  private readonly providers: readonly ReviewProvider[];

  constructor(providers: readonly ReviewProvider[]) {
    this.providers = providers;
  }

  byId(id: ProviderId): ReviewProvider {
    const found = this.providers.find((provider) => provider.id === id);
    if (found === undefined) {
      throw new AmbicodeError('unknown-provider', `No provider "${id}" is registered.`);
    }
    return found;
  }

  /**
   * The provider that owns a URL. No provider claiming it is an actionable
   * error, not a silent choice of the first one: reviewing a Bitbucket URL
   * through the GitLab adapter would produce confident nonsense.
   */
  forUrl(url: string): ReviewProvider {
    const found = this.providers.find((provider) => provider.owns(url));
    if (found === undefined) {
      throw new AmbicodeError(
        'unsupported-target',
        'No AMBICODE provider recognizes that merge request URL.',
        {
          field: '--mr',
          details: [
            `Registered providers: ${this.providers.map((provider) => provider.id).join(', ')}.`,
            'Pass a full GitLab merge request URL, for example https://gitlab.example.com/group/project/-/merge_requests/42.',
          ],
        },
      );
    }
    return found;
  }

  ids(): ProviderId[] {
    return this.providers.map((provider) => provider.id);
  }
}
