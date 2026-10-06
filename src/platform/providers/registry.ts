import type { ProviderId } from '#types/primitives';
import type { ReviewProvider } from '#types/provider';
import { AmbicodeError } from '#util/errors';

/** The only place a provider is chosen; no other module may switch on a provider name. */
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
