import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { isAmbicodeError } from '../util/errors.ts';
import { INVESTIGATION_NOTES_DIR, resolveInvestigationNotePath } from './path.ts';

const ROOT = '/repo';

describe('P2.1 investigation note path boundary', () => {
  it('resolves an ordinary filename inside the investigations directory', () => {
    const resolved = resolveInvestigationNotePath(ROOT, 'why-order-cancellation-duplicates.md');
    assert.equal(resolved, path.join(ROOT, INVESTIGATION_NOTES_DIR, 'why-order-cancellation-duplicates.md'));
  });

  it('accepts a nested subdirectory that still stays inside the boundary', () => {
    const resolved = resolveInvestigationNotePath(ROOT, '2026-09-21/retry-ownership.md');
    assert.equal(resolved, path.join(ROOT, INVESTIGATION_NOTES_DIR, '2026-09-21/retry-ownership.md'));
  });

  it('refuses a path that climbs out of the investigations directory', () => {
    for (const escape of ['../plan.md', '../../etc/passwd', 'a/../../escape.md', '..']) {
      assert.throws(
        () => resolveInvestigationNotePath(ROOT, escape),
        (error) => {
          assert.ok(isAmbicodeError(error));
          assert.equal(error.code, 'note-path-escape');
          return true;
        },
        `expected "${escape}" to be refused`,
      );
    }
  });

  it('refuses an absolute path outright, even one that happens to land inside the boundary', () => {
    assert.throws(
      () => resolveInvestigationNotePath(ROOT, path.join(ROOT, INVESTIGATION_NOTES_DIR, 'x.md')),
      (error) => {
        assert.ok(isAmbicodeError(error));
        assert.equal(error.code, 'note-path-escape');
        return true;
      },
    );
  });

  it('refuses an empty filename', () => {
    assert.throws(
      () => resolveInvestigationNotePath(ROOT, '   '),
      (error) => {
        assert.ok(isAmbicodeError(error));
        assert.equal(error.code, 'note-path-invalid');
        return true;
      },
    );
  });
});
