import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { nodeFileSystem, type FileSystem } from '../ports/filesystem.ts';
import { markOwned, sweepOwnedTemporaries, OWNED_PREFIXES, OWNERSHIP_MARKER } from './cleanup.ts';
import { TAKEOVER_HEADER } from './takeover.ts';
import {
  AUTHORITY,
  ORIGIN,
  FakeClock,
  form,
  openPage,
  startHarness,
} from '../testing/page-harness.ts';

/**
 * U24. What the page does over time: it stops when nobody is using it, it
 * refuses everything once it has stopped, a reopened review gets a new
 * capability and session, and cleanup removes only what AMBICODE created.
 */

describe('U24 the page stops on its own', () => {
  it('shuts down after the configured idle time', async () => {
    const harness = await startHarness({ idleTimeoutSeconds: 0.15 });
    try {
      const reason = await harness.server.stopped;
      assert.match(reason, /idle for 0\.15s/);
    } finally {
      await harness.dispose();
    }
  });

  it('refuses every request once shutdown has started', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      harness.server.beginShutdown('the operator pressed Ctrl-C');

      const response = await harness.server.app.inject({
        method: 'GET',
        url: '/',
        headers: { host: AUTHORITY, cookie: page.cookies },
      });
      assert.equal(response.statusCode, 503);
      assert.match(response.body, /shutting down/);
    } finally {
      await harness.dispose();
    }
  });

  it('drops every server-side session at shutdown, so an issued cookie is inert', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      assert.equal(harness.server.sessions.sessionCount, 1);
      await harness.server.stop('test');
      assert.equal(harness.server.sessions.sessionCount, 0);
      assert.ok(page.cookies.length > 0);
    } finally {
      await harness.dispose();
    }
  });

  it('counts only valid authenticated requests as activity', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      const session = [...(harness.server.sessions as unknown as { sessions: Map<string, { lastSeenAt: number }> }).sessions.values()][0];
      assert.ok(session);
      const before = session.lastSeenAt;

      harness.clock.advance(5_000);
      // A request naming the wrong host never reaches the session at all.
      await harness.server.app.inject({
        method: 'GET',
        url: '/',
        headers: { host: 'elsewhere.example.com', cookie: page.cookies },
      });
      // Neither does one with no cookie.
      await harness.server.app.inject({ method: 'GET', url: '/', headers: { host: AUTHORITY } });
      assert.equal(session.lastSeenAt, before);

      await harness.server.app.inject({
        method: 'GET',
        url: '/',
        headers: { host: AUTHORITY, cookie: page.cookies },
      });
      assert.equal(session.lastSeenAt, before + 5_000);
    } finally {
      await harness.dispose();
    }
  });

  it('expires a session that has idled past its lifetime', async () => {
    const harness = await startHarness({ idleTimeoutSeconds: 60 });
    try {
      const page = await openPage(harness);
      harness.clock.advance(61_000);
      const response = await harness.server.app.inject({
        method: 'GET',
        url: '/',
        headers: { host: AUTHORITY, cookie: page.cookies },
      });
      assert.equal(response.statusCode, 401);
    } finally {
      await harness.dispose();
    }
  });
});

describe('U24 reopening a saved review', () => {
  it('issues a fresh capability and session, and refuses the old ones', async () => {
    const first = await startHarness();
    const firstCapability = first.server.capability;
    const firstPage = await openPage(first);
    await first.server.stop('closed');

    // A second server over the same review directory: a reopen.
    const second = await startHarness();
    try {
      assert.notEqual(second.server.capability, firstCapability);

      const oldCapability = await second.server.app.inject({
        method: 'GET',
        url: `/${firstCapability}`,
        headers: { host: AUTHORITY },
      });
      assert.equal(oldCapability.statusCode, 403);

      // Refused as before; since the fixed port, said to be a disconnect.
      const oldCookie = await second.server.app.inject({
        method: 'GET',
        url: '/',
        headers: { host: AUTHORITY, cookie: firstPage.cookies },
      });
      assert.equal(oldCookie.statusCode, 410);
      assert.match(oldCookie.body, /This review page was disconnected\./);
      assert.doesNotMatch(oldCookie.body, /Review r-0001/);

      const page = await openPage(second);
      assert.match(page.html, /Review r-0001/);
    } finally {
      await first.dispose();
      await second.dispose();
    }
  });

  it('keeps drafts and publication outcomes across a reopen', async () => {
    const harness = await startHarness();
    const directory = harness.directory;
    try {
      const page = await openPage(harness);
      await harness.server.app.inject({
        method: 'POST',
        url: '/publish',
        headers: {
          host: AUTHORITY,
          origin: ORIGIN,
          cookie: page.cookies,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: form({
          _csrf: page.csrfToken,
          submissionId: page.submissionId,
          'body_f-aaaa': 'A draft that must survive.',
          'body_f-bbbb': 'And a second one.',
          'select_f-aaaa': 'on',
        }),
      });
      await harness.server.stop('closed');

      const record = await harness.store.readPublication('r-0001');
      assert.equal(record.drafts.find((draft) => draft.findingId === 'f-bbbb')?.body, 'And a second one.');
      assert.equal(record.outcomes.find((o) => o.findingId === 'f-aaaa')?.state, 'published');

      // The file on disk is what a reopen reads, and it holds no secret.
      const raw = await readFile(path.join(directory, 'publication.json'), 'utf8');
      assert.ok(raw.includes('A draft that must survive.'));
      assert.ok(!raw.includes(harness.server.capability));
      assert.ok(!raw.includes(page.csrfToken));
      assert.ok(!/GLAB_TOKEN|GITLAB_TOKEN|ANTHROPIC/i.test(raw));
    } finally {
      await harness.dispose();
    }
  });

  it('writes the publication record atomically, leaving no partial file behind', async () => {
    const harness = await startHarness();
    try {
      const page = await openPage(harness);
      await harness.server.app.inject({
        method: 'POST',
        url: '/publish',
        headers: {
          host: AUTHORITY,
          origin: ORIGIN,
          cookie: page.cookies,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: form({
          _csrf: page.csrfToken,
          submissionId: page.submissionId,
          'body_f-aaaa': 'text',
        }),
      });
      assert.equal(await nodeFileSystem.exists(path.join(harness.directory, 'publication.json.writing')), false);
    } finally {
      await harness.dispose();
    }
  });
});

describe('U24 a newer page takes over the fixed port', () => {
  const TOKEN = 't'.repeat(32);

  function takeover(harness: Awaited<ReturnType<typeof startHarness>>, token: string | null) {
    return harness.server.app.inject({
      method: 'POST',
      url: '/takeover',
      headers: { host: AUTHORITY, ...(token === null ? {} : { [TAKEOVER_HEADER]: token }) },
    });
  }

  it('stops only for its own token, and never while publishing', async () => {
    const harness = await startHarness({ takeoverToken: TOKEN });
    try {
      assert.equal((await takeover(harness, null)).statusCode, 403);
      assert.equal((await takeover(harness, 'u'.repeat(32))).statusCode, 403);
      assert.equal((await takeover(harness, 'short')).statusCode, 403);

      const bootstrap = await harness.server.app.inject({
        method: 'GET',
        url: `/${harness.server.capability}`,
        headers: { host: AUTHORITY },
      });
      const signed = bootstrap.cookies.find((cookie) => cookie.name === 'ambicode_session')?.value ?? '';
      const session = harness.server.sessions.get(harness.server.app.unsignCookie(signed).value ?? undefined);
      assert.ok(session);
      harness.server.sessions.beginSubmission(session, 'sub-1');
      const busy = await takeover(harness, TOKEN);
      assert.equal(busy.statusCode, 409);
      harness.server.sessions.endSubmission(session);

      const accepted = await takeover(harness, TOKEN);
      assert.equal(accepted.statusCode, 200);
      assert.equal(await harness.server.stopped, 'replaced by a newer ambicode view');
    } finally {
      await harness.dispose();
    }
  });

  it('refuses a takeover on a page that was given no token', async () => {
    const harness = await startHarness();
    try {
      assert.equal((await takeover(harness, TOKEN)).statusCode, 403);
    } finally {
      await harness.dispose();
    }
  });

  it('tells a tab of the replaced page that it was disconnected, and publishes nothing', async () => {
    const first = await startHarness();
    const oldPage = await openPage(first);
    await first.server.stop('replaced by a newer ambicode view');
    const second = await startHarness();
    try {
      for (const url of ['/publish', '/close']) {
        const response = await second.server.app.inject({
          method: 'POST',
          url,
          headers: {
            host: AUTHORITY,
            origin: ORIGIN,
            cookie: oldPage.cookies,
            'content-type': 'application/x-www-form-urlencoded',
          },
          payload: form({ _csrf: oldPage.csrfToken, submissionId: oldPage.submissionId, 'select_f-aaaa': 'on' }),
        });
        assert.equal(response.statusCode, 410, url);
        assert.match(response.body, /This review page was disconnected\./, url);
      }
      assert.deepEqual(second.provider?.calls ?? [], []);
      assert.equal(await Promise.race([second.server.stopped, Promise.resolve('running')]), 'running');
    } finally {
      await first.dispose();
      await second.dispose();
    }
  });
});

describe('U24 test directories stay outside the sweep', () => {
  it('gives no test directory a name the sweep reports as AMBICODE’s', async () => {
    // Two `ambicode-page-test-*` directories from an interrupted run were
    // reported as "left alone" by every `ambicode view` afterwards.
    const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const call = /mkdtemp\(\s*path\.join\(\s*(?:os\.)?tmpdir\(\)\s*,\s*['"`]([^'"`$]+)/g;
    const prefixes: string[] = [];
    for (const entry of await readdir(src, { recursive: true })) {
      if (!entry.endsWith('.ts') || (!entry.endsWith('.test.ts') && !entry.startsWith(`testing${path.sep}`))) continue;
      for (const match of (await readFile(path.join(src, entry), 'utf8')).matchAll(call)) prefixes.push(match[1] as string);
    }
    // A prefix computed at run time is not seen; these two prove the scan reads the harnesses.
    for (const known of ['ambicode-test-page-', 'ambicode-test-']) assert.ok(prefixes.includes(known), prefixes.join(', '));
    const colliding = prefixes.filter((prefix) => OWNED_PREFIXES.some((owned) => prefix.startsWith(owned)));
    assert.deepEqual(colliding, []);
  });
});

describe('U24 cleanup removes only what AMBICODE owns', () => {
  async function scratch(): Promise<{ root: string; fs: FileSystem; dispose: () => Promise<void> }> {
    const root = await mkdtemp(path.join(tmpdir(), 'ambicode-sweep-'));
    const fs: FileSystem = { ...nodeFileSystem, temporaryRoot: () => root };
    return { root, fs, dispose: () => rm(root, { recursive: true, force: true }) };
  }

  it('deletes an expired owned directory and leaves everything else alone', async () => {
    const context = await scratch();
    try {
      const clock = new FakeClock();
      const owned = path.join(context.root, 'ambicode-snapshot-old');
      const fresh = path.join(context.root, 'ambicode-snapshot-new');
      const unmarked = path.join(context.root, 'ambicode-snapshot-someone-elses');
      const unrelated = path.join(context.root, 'important-work');
      for (const directory of [owned, fresh, unmarked, unrelated]) await mkdir(directory);
      await writeFile(path.join(unrelated, 'keep.txt'), 'do not delete me');

      const old = new FakeClock();
      old.advance(-48 * 60 * 60 * 1000);
      await markOwned(context.fs, owned, 'snapshot', old, 4242);
      await markOwned(context.fs, fresh, 'snapshot', clock, 4243);

      const report = await sweepOwnedTemporaries({
        fs: context.fs,
        clock,
        maxAgeMs: 24 * 60 * 60 * 1000,
      });

      assert.deepEqual(report.removed, [owned]);
      assert.deepEqual(report.skipped, [unmarked]);
      assert.deepEqual(report.failures, []);
      assert.equal(await nodeFileSystem.exists(owned), false);
      assert.equal(await nodeFileSystem.exists(fresh), true);
      assert.equal(await nodeFileSystem.exists(unmarked), true);
      assert.equal(await nodeFileSystem.exists(path.join(unrelated, 'keep.txt')), true);
    } finally {
      await context.dispose();
    }
  });

  it('leaves a directory whose ownership marker does not validate', async () => {
    const context = await scratch();
    try {
      const forged = path.join(context.root, 'ambicode-snapshot-forged');
      await mkdir(forged);
      await writeFile(path.join(forged, OWNERSHIP_MARKER), '{"tool":"somebody-else"}');

      const report = await sweepOwnedTemporaries({
        fs: context.fs,
        clock: new FakeClock(),
        maxAgeMs: 0,
      });
      assert.deepEqual(report.removed, []);
      assert.deepEqual(report.skipped, [forged]);
      assert.equal(await nodeFileSystem.exists(forged), true);
    } finally {
      await context.dispose();
    }
  });

  it('surfaces a cleanup failure instead of deleting something else', async () => {
    const context = await scratch();
    try {
      const owned = path.join(context.root, 'ambicode-snapshot-stuck');
      await mkdir(owned);
      const old = new FakeClock();
      old.advance(-48 * 60 * 60 * 1000);
      await markOwned(context.fs, owned, 'snapshot', old, 1);

      const failing: FileSystem = {
        ...context.fs,
        remove: async () => {
          throw new Error('EPERM: operation not permitted');
        },
      };
      const report = await sweepOwnedTemporaries({
        fs: failing,
        clock: new FakeClock(),
        maxAgeMs: 0,
      });

      assert.deepEqual(report.removed, []);
      assert.equal(report.failures.length, 1);
      assert.match(report.failures[0] ?? '', /could not be removed: EPERM/);
      assert.equal(await nodeFileSystem.exists(owned), true);
    } finally {
      await context.dispose();
    }
  });
});
