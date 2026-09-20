import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { main } from './main.ts';
import { parseArgs } from './args.ts';
import { BUNDLE_OPTIONS } from './commands/bundle.ts';
import { REVIEW_OPTIONS } from './commands/review.ts';
import { validateTargetArgs } from './target-option.ts';
import { isAmbicodeError } from '../util/errors.ts';

/**
 * U27, extended for the merge request target. Every rule is decided from the
 * argument vector alone, and `main` applies it before a runtime exists, so an
 * invalid combination cannot create a directory, start git or reach a provider.
 */

const MR = 'https://gitlab.example.com/group/project/-/merge_requests/42';

function target(command: string, argv: string[], spec = REVIEW_OPTIONS) {
  return validateTargetArgs(command, parseArgs(command, argv, spec));
}

function refusal(run: () => unknown): { code: string; field?: string; details: string[] } {
  try {
    run();
  } catch (error) {
    assert.ok(isAmbicodeError(error), `expected an AmbicodeError, got ${String(error)}`);
    return { code: error.code, field: error.field, details: error.details };
  }
  return assert.fail('expected the arguments to be refused');
}

describe('U27 target options', () => {
  it('defaults to the working tree', () => {
    assert.deepEqual(target('review', []), { kind: 'working' });
  });

  it('takes --mr as the merge request target for review and bundle alike', () => {
    assert.deepEqual(target('review', ['--mr', MR]), { kind: 'merge-request', url: MR });
    assert.deepEqual(target('bundle', ['--mr', MR], BUNDLE_OPTIONS), {
      kind: 'merge-request',
      url: MR,
    });
    assert.deepEqual(target('review', [`--mr=${MR}`]), { kind: 'merge-request', url: MR });
  });

  it('keeps the requirement options available for a merge request review', () => {
    const args = parseArgs(
      'review',
      ['--mr', MR, '--requirement', 'https://example.atlassian.net/browse/ORD-17', '--evidence', 'e.json'],
      REVIEW_OPTIONS,
    );
    assert.deepEqual(validateTargetArgs('review', args), { kind: 'merge-request', url: MR });
    assert.deepEqual(args.all('requirement'), ['https://example.atlassian.net/browse/ORD-17']);
    assert.equal(args.value('evidence'), 'e.json');
  });

  it('refuses --branch together with --mr', () => {
    const error = refusal(() => target('review', ['--branch', '--mr', MR]));
    assert.equal(error.code, 'conflicting-target');
    assert.equal(refusal(() => target('bundle', ['--branch', '--mr', MR], BUNDLE_OPTIONS)).code, 'conflicting-target');
  });

  it('refuses --base outside branch review', () => {
    assert.equal(refusal(() => target('review', ['--base', 'origin/main'])).code, 'baseline-not-applicable');
    const withMr = refusal(() => target('review', ['--mr', MR, '--base', 'origin/main']));
    assert.equal(withMr.code, 'baseline-not-applicable');
    assert.match(withMr.details.join('\n'), /will not substitute a local ref/);
  });

  it('accepts --base with --branch', () => {
    assert.deepEqual(target('review', ['--branch', '--base', 'origin/release/1.2']), {
      kind: 'branch',
      baseRef: 'origin/release/1.2',
    });
  });

  it('refuses an empty --mr value', () => {
    assert.equal(refusal(() => target('review', ['--mr', '  '])).code, 'bad-argument');
  });

  it('exits nonzero on a conflicting target without touching anything', async () => {
    // `main` builds no runtime for a refused argument vector: reaching a
    // provider or the filesystem first is exactly what is being excluded.
    const code = await main(['review', '--branch', '--mr', MR]);
    assert.equal(code, 2);
  });

  it('documents --mr in the usage text for both commands', async () => {
    const { USAGE } = await import('./main.ts');
    assert.match(USAGE, /--mr <url> {2,}Review a GitLab merge request/);
    assert.match(USAGE, /--mr <url> {2,}Bundle a GitLab merge request/);
    assert.match(USAGE, /mutually exclusive/);
    assert.match(USAGE, /--base <ref> {2,}Baseline for --branch\. Valid only there\./);
  });

  it('accepts every documented target option through the parser', () => {
    for (const spec of [REVIEW_OPTIONS, BUNDLE_OPTIONS]) {
      const args = parseArgs(
        'review',
        ['--mr', MR, '--requirement', 'a', '--requirement', 'b', '--approve', 'web/lint', '--json'],
        spec,
      );
      assert.equal(args.value('mr'), MR);
      assert.deepEqual(args.all('requirement'), ['a', 'b']);
      assert.deepEqual(args.all('approve'), ['web/lint']);
      assert.equal(args.flag('json'), true);
    }
  });
});
