import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultProviders } from '../composition/root.ts';
import { FakeProcessRunner } from '../testing/fake-process-runner.ts';
import { isAmbicodeError } from '../util/errors.ts';
import { GitHubProvider } from './github/provider.ts';

const PULL_REQUEST = 'https://github.com/acme/widgets/pull/12';
const OPERATIONS = [
  'resolveTarget',
  'fetchSnapshot',
  'getCurrentRevision',
  'listDiscussions',
  'publishComment',
] as const;

describe('U19 GitHub placeholder', () => {
  it('answers every remote operation with a typed unsupported result', async () => {
    const provider = new GitHubProvider();
    const target = { provider: 'github' } as never;

    for (const operation of OPERATIONS) {
      const outcome = await (provider[operation] as (input: unknown) => Promise<{ kind: string }>)({
        url: PULL_REQUEST,
        target,
      });
      assert.equal(outcome.kind, 'unsupported', operation);
      const typed = outcome as unknown as { provider: string; operation: string; message: string };
      assert.equal(typed.provider, 'github');
      assert.equal(typed.operation, operation);
      assert.match(typed.message, /does not support GitHub pull requests/);
      assert.match(typed.message, /ambicode review/);
    }
  });

  it('makes no process call for any operation', async () => {
    const runner = new FakeProcessRunner();
    const registry = defaultProviders(runner, '/work');
    const provider = registry.byId('github');

    for (const operation of OPERATIONS) {
      await (provider[operation] as (input: unknown) => Promise<unknown>)({
        url: PULL_REQUEST,
        target: { provider: 'github' } as never,
      });
    }
    assert.deepEqual(runner.argvs(), []);
  });

  it('claims a GitHub URL so it answers rather than the GitLab adapter', () => {
    const registry = defaultProviders(new FakeProcessRunner(), '/work');
    assert.equal(registry.forUrl(PULL_REQUEST).id, 'github');
    assert.equal(
      registry.forUrl('https://gitlab.example.com/group/project/-/merge_requests/42').id,
      'gitlab',
    );
  });

  it('refuses a host no provider claims instead of choosing one', () => {
    const registry = defaultProviders(new FakeProcessRunner(), '/work');
    assert.throws(
      () => registry.forUrl('https://bitbucket.example.com/projects/A/repos/b/pull-requests/1'),
      (error: unknown) => isAmbicodeError(error) && error.code === 'unsupported-target',
    );
  });

  it('does not claim a GitLab merge request URL', () => {
    const provider = new GitHubProvider();
    assert.equal(provider.owns('https://gitlab.example.com/g/p/-/merge_requests/1'), false);
    assert.equal(provider.owns('not a url'), false);
  });
});
