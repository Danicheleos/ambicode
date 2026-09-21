// Unit tests for install-local.mjs (doc 04 P2.3 correction A). These never
// shell out to the real `claude` binary — every native marketplace/plugin
// outcome is injected through a fake `NativeCommands` object, exactly like
// the AMBICODE helper's own tests fake ProcessRunner/FileSystem. The real,
// end-to-end lifecycle against the actual `claude` CLI stays covered by
// `install-local.smoke.mjs` (`npm run smoke:install-local`), which this file
// does not replace.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { install, inspect, MARKETPLACE_NAME, uninstall } from './install-local.mjs';

async function makeCandidate(name, version) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ambicode-candidate-'));
  await mkdir(path.join(dir, '.claude-plugin'), { recursive: true });
  await writeFile(
    path.join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name, version }, null, 2),
  );
  await writeFile(path.join(dir, 'marker.txt'), `${name}@${version}\n`);
  return dir;
}

async function freshConfigDir() {
  return mkdtemp(path.join(tmpdir(), 'ambicode-config-'));
}

/**
 * A stateful fake native adapter (P2.4 correction D12): rather than every
 * method returning an independent, fixed outcome regardless of call order,
 * this fake tracks whether the marketplace is registered and which
 * `name@scope` pairs are "installed", and it reads the *actual* staged
 * marketplace manifest from disk to answer `pluginList` — exactly like the
 * real `claude` CLI reads the live local-directory source rather than a
 * value pinned at install time — so a test can assert what native state
 * exists *after* a compensation ran, not only which functions were called.
 * Per-method `overrides` can still force a specific outcome (e.g. a
 * mid-sequence failure) while state tracking continues underneath it.
 */
function fakeNative(overrides = {}) {
  const calls = [];
  // `installed` maps `${name}@${scope}` to the version *pinned* at the last
  // successful pluginInstall/pluginUpdate — not a live re-read of the
  // marketplace directory on every `pluginList`, mirroring why
  // `install-local.mjs` calls `claude plugin update` at all for a
  // local-directory source: the registration's reported version does not
  // silently follow newer content staged at the same path until told to.
  const state = { marketplaceRegistered: false, marketDir: null, installed: new Map() };

  function currentIdentity() {
    if (state.marketDir === null) return null;
    try {
      const manifest = JSON.parse(
        readFileSync(path.join(state.marketDir, '.claude-plugin', 'marketplace.json'), 'utf8'),
      );
      const entry = manifest.plugins?.[0];
      return entry === undefined ? null : { name: entry.name, version: entry.version };
    } catch {
      return null;
    }
  }

  const behavior = {
    marketplaceAdd: (dir) => {
      state.marketplaceRegistered = true;
      state.marketDir = dir;
      return { ok: true, stdout: '', stderr: '' };
    },
    marketplaceUpdate: () => ({
      ok: state.marketplaceRegistered,
      stdout: '',
      stderr: state.marketplaceRegistered ? '' : 'not found',
    }),
    marketplaceRemove: () => {
      const existed = state.marketplaceRegistered;
      state.marketplaceRegistered = false;
      return { ok: true, notFound: !existed, stdout: '', stderr: '' };
    },
    pluginValidateStrict: () => ({ ok: true, report: { success: true }, stderr: '' }),
    pluginInstall: (pluginId, scope) => {
      const identity = currentIdentity();
      state.installed.set(`${pluginId.split('@')[0]}@${scope}`, identity?.version ?? null);
      return { ok: true, outcome: 'ok', failureCode: null, message: null };
    },
    pluginUpdate: (pluginId, scope) => {
      const identity = currentIdentity();
      state.installed.set(`${pluginId.split('@')[0]}@${scope}`, identity?.version ?? null);
      return { ok: true, outcome: 'ok', failureCode: null, message: null };
    },
    pluginUninstall: (pluginId, scope) => {
      const key = `${pluginId.split('@')[0]}@${scope}`;
      const existed = state.installed.has(key);
      state.installed.delete(key);
      return { ok: true, outcome: 'ok', failureCode: existed ? null : 'not_installed', message: null };
    },
    pluginList: () => {
      const identity = currentIdentity();
      const name = identity?.name ?? null;
      const plugins = [...state.installed.entries()]
        .filter(([key]) => name === null || key.startsWith(`${name}@`))
        .map(([key, version]) => ({
          id: `${key.slice(0, key.lastIndexOf('@'))}@${MARKETPLACE_NAME}`,
          scope: key.slice(key.lastIndexOf('@') + 1),
          version,
          enabled: true,
        }));
      return { ok: true, plugins };
    },
  };

  const merged = { ...behavior, ...overrides };
  const native = {};
  for (const key of Object.keys(merged)) {
    native[key] = (...args) => {
      calls.push(key);
      return merged[key](...args);
    };
  }
  return { native, calls, state };
}

async function readManifestVersion(configDir) {
  const raw = await readFile(
    path.join(configDir, 'ambicode-install', 'marketplace', '.claude-plugin', 'marketplace.json'),
    'utf8',
  );
  return JSON.parse(raw).plugins[0].version;
}

async function readState(configDir) {
  try {
    return JSON.parse(await readFile(path.join(configDir, 'ambicode-install', 'state.json'), 'utf8'));
  } catch {
    return null;
  }
}

describe('install-local.mjs install/uninstall (P2.3 correction A)', () => {
  it('first install: nothing installed, plugin install is called, state is recorded', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      const { native, calls } = fakeNative();
      const result = await install({ candidateDir, configDir, scope: 'user', projectDir: null }, native);

      assert.equal(result.ok, true, JSON.stringify(result));
      assert.ok(calls.includes('pluginInstall'), 'expected pluginInstall to be called for a fresh install');
      assert.ok(!calls.includes('pluginUpdate'), 'a fresh install must not call pluginUpdate');
      assert.equal(await readManifestVersion(configDir), '0.1.0');
      assert.deepEqual(await readState(configDir), {
        schemaVersion: 1,
        name: 'ambicode',
        version: '0.1.0',
        scope: 'user',
        projectDir: null,
      });
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('same-version reinstall is idempotent: neither pluginInstall nor pluginUpdate runs again', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      await install({ candidateDir, configDir, scope: 'user', projectDir: null }, fakeNative().native);

      const { native, calls } = fakeNative({
        // Structured native state says this exact version is already installed.
        pluginList: () => ({ ok: true, plugins: [{ id: `ambicode@${MARKETPLACE_NAME}`, version: '0.1.0', scope: 'user' }] }),
        pluginInstall: () => {
          throw new Error('must not be called for an idempotent same-version reinstall');
        },
        pluginUpdate: () => {
          throw new Error('must not be called for an idempotent same-version reinstall');
        },
      });
      const result = await install({ candidateDir, configDir, scope: 'user', projectDir: null }, native);

      assert.equal(result.ok, true);
      assert.ok(!calls.includes('pluginInstall'));
      assert.ok(!calls.includes('pluginUpdate'));
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('successful version upgrade calls pluginUpdate, not pluginInstall, and records the new version', async () => {
    const v1 = await makeCandidate('ambicode', '0.1.0');
    const v2 = await makeCandidate('ambicode', '0.2.0');
    const configDir = await freshConfigDir();
    try {
      const first = fakeNative();
      await install({ candidateDir: v1, configDir, scope: 'user', projectDir: null }, first.native);

      // A fresh fake, seeded with the prior install's native state (a real
      // second invocation of install-local.mjs would talk to the same live
      // `claude` state, not a brand-new one) — `install()` itself will
      // repoint `marketDir` to v2's staged content via `marketplaceAdd`.
      const { native, calls, state } = fakeNative();
      state.installed = first.state.installed;
      const result = await install({ candidateDir: v2, configDir, scope: 'user', projectDir: null }, native);

      assert.equal(result.ok, true, JSON.stringify(result));
      assert.ok(calls.includes('pluginUpdate'));
      assert.ok(!calls.includes('pluginInstall'));
      assert.equal(await readManifestVersion(configDir), '0.2.0');
      assert.equal((await readState(configDir)).version, '0.2.0');
    } finally {
      await rm(v1, { recursive: true, force: true });
      await rm(v2, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('a marketplace-update failure during upgrade preserves the old installation and reports nonzero failure', async () => {
    const v1 = await makeCandidate('ambicode', '0.1.0');
    const v2 = await makeCandidate('ambicode', '0.2.0');
    const configDir = await freshConfigDir();
    try {
      await install({ candidateDir: v1, configDir, scope: 'user', projectDir: null }, fakeNative().native);

      const { native } = fakeNative({
        marketplaceUpdate: () => ({ ok: false, stdout: '', stderr: 'permission denied' }),
      });
      const result = await install({ candidateDir: v2, configDir, scope: 'user', projectDir: null }, native);

      assert.equal(result.ok, false);
      assert.equal(result.code, 'marketplace-update-failed');
      // The previous working installation is intact, not partially overwritten.
      assert.equal(await readManifestVersion(configDir), '0.1.0');
      assert.equal((await readState(configDir)).version, '0.1.0');
    } finally {
      await rm(v1, { recursive: true, force: true });
      await rm(v2, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('a plugin-update failure during upgrade preserves the old installation and reports nonzero failure', async () => {
    const v1 = await makeCandidate('ambicode', '0.1.0');
    const v2 = await makeCandidate('ambicode', '0.2.0');
    const configDir = await freshConfigDir();
    try {
      await install({ candidateDir: v1, configDir, scope: 'user', projectDir: null }, fakeNative().native);

      const { native } = fakeNative({
        pluginList: () => ({ ok: true, plugins: [{ id: `ambicode@${MARKETPLACE_NAME}`, version: '0.1.0', scope: 'user' }] }),
        pluginUpdate: () => ({ ok: false, outcome: 'failed', failureCode: 'validation_failed', message: 'bad manifest' }),
      });
      const result = await install({ candidateDir: v2, configDir, scope: 'user', projectDir: null }, native);

      assert.equal(result.ok, false);
      assert.equal(result.code, 'plugin-update-failed');
      assert.equal(await readManifestVersion(configDir), '0.1.0');
      assert.equal((await readState(configDir)).version, '0.1.0');
    } finally {
      await rm(v1, { recursive: true, force: true });
      await rm(v2, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('uninstall uses the recorded scope/project directory without requiring the caller to repeat it', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      await install({ candidateDir, configDir, scope: 'user', projectDir: null }, fakeNative().native);

      const { native, calls } = fakeNative();
      const result = await uninstall(
        { configDir, scope: null, scopeExplicit: false, projectDir: null, projectDirExplicit: false },
        native,
      );

      assert.equal(result.ok, true);
      assert.ok(calls.includes('pluginUninstall'));
      assert.ok(calls.includes('marketplaceRemove'));
      assert.equal(await readState(configDir), null);
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('refuses an explicit --scope that conflicts with the recorded installation, touching nothing', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      await install({ candidateDir, configDir, scope: 'user', projectDir: null }, fakeNative().native);

      const { native, calls } = fakeNative();
      const projectDir = await mkdtemp(path.join(tmpdir(), 'ambicode-project-'));
      try {
        const result = await uninstall(
          { configDir, scope: 'project', scopeExplicit: true, projectDir, projectDirExplicit: true },
          native,
        );

        assert.equal(result.ok, false);
        assert.equal(result.code, 'scope-mismatch');
        assert.deepEqual(calls, [], 'no native command should run once the scope conflict is detected');
        // The recorded installation is untouched and still recoverable.
        assert.equal((await readState(configDir)).scope, 'user');
      } finally {
        await rm(projectDir, { recursive: true, force: true });
      }
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('a plugin-uninstall failure preserves the durable source and reports nonzero failure', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      await install({ candidateDir, configDir, scope: 'user', projectDir: null }, fakeNative().native);

      const { native } = fakeNative({
        pluginUninstall: () => ({ ok: false, outcome: 'failed', failureCode: 'permission_denied', message: 'denied' }),
      });
      const result = await uninstall(
        { configDir, scope: null, scopeExplicit: false, projectDir: null, projectDirExplicit: false },
        native,
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 'plugin-uninstall-failed');
      assert.equal(await readManifestVersion(configDir), '0.1.0');
      assert.ok(await readState(configDir) !== null, 'state must survive a failed uninstall');
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('a marketplace-removal failure preserves a recoverable state even after the plugin itself was uninstalled', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      await install({ candidateDir, configDir, scope: 'user', projectDir: null }, fakeNative().native);

      const { native } = fakeNative({
        pluginUninstall: () => ({ ok: true, outcome: 'ok', failureCode: null, message: null }),
        marketplaceRemove: () => ({ ok: false, notFound: false, stdout: '', stderr: 'permission denied' }),
      });
      const result = await uninstall(
        { configDir, scope: null, scopeExplicit: false, projectDir: null, projectDirExplicit: false },
        native,
      );

      assert.equal(result.ok, false);
      assert.equal(result.code, 'marketplace-remove-failed');
      // Retryable: state and the marketplace directory are both still there.
      assert.ok(await readState(configDir) !== null);
      assert.equal(await readManifestVersion(configDir), '0.1.0');
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('uninstalls cleanly without the original candidate directory existing', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      await install({ candidateDir, configDir, scope: 'user', projectDir: null }, fakeNative().native);
      await rm(candidateDir, { recursive: true, force: true });

      const { native } = fakeNative();
      const result = await uninstall(
        { configDir, scope: null, scopeExplicit: false, projectDir: null, projectDirExplicit: false },
        native,
      );

      assert.equal(result.ok, true);
      assert.equal(await readState(configDir), null);
    } finally {
      await rm(configDir, { recursive: true, force: true });
    }
  });
});

describe('install-local.mjs P2.4 correction D: failure-safe installation', () => {
  it('D2/D3: refuses a user→project scope change on install, before any mutation, leaving only the user installation', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    const projectDir = await mkdtemp(path.join(tmpdir(), 'ambicode-project-'));
    try {
      const first = fakeNative();
      await install({ candidateDir, configDir, scope: 'user', projectDir: null }, first.native);

      const { native, calls } = fakeNative();
      const result = await install({ candidateDir, configDir, scope: 'project', projectDir }, native);

      assert.equal(result.ok, false);
      assert.equal(result.code, 'scope-mismatch');
      assert.match(result.detail, /explicit.*uninstall.*followed by/i);
      // No native call was attempted: refused before any mutation.
      assert.deepEqual(calls, []);
      // Only the original user-scoped installation is recorded.
      assert.equal((await readState(configDir)).scope, 'user');
      assert.equal((await readState(configDir)).projectDir, null);
      assert.equal(await readManifestVersion(configDir), '0.1.0');
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  it('D3: canonicalizes a symlinked project directory before comparing, so a symlink alias is not treated as a scope change', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    const realProjectDir = await mkdtemp(path.join(tmpdir(), 'ambicode-real-project-'));
    const aliasParent = await mkdtemp(path.join(tmpdir(), 'ambicode-alias-parent-'));
    const aliasProjectDir = path.join(aliasParent, 'alias');
    const { symlink } = await import('node:fs/promises');
    await symlink(realProjectDir, aliasProjectDir);
    try {
      const first = fakeNative();
      await install({ candidateDir, configDir, scope: 'project', projectDir: realProjectDir }, first.native);

      const { native, calls, state } = fakeNative();
      state.marketplaceRegistered = first.state.marketplaceRegistered;
      state.installed = first.state.installed;
      const result = await install({ candidateDir, configDir, scope: 'project', projectDir: aliasProjectDir }, native);

      assert.equal(result.ok, true, JSON.stringify(result));
      // Recognized as the same installation: no scope-mismatch refusal, and
      // this reinstall at the identical (canonical) project/version is a
      // native no-op, not a fresh pluginInstall.
      assert.ok(!calls.includes('pluginInstall'));
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
      await rm(realProjectDir, { recursive: true, force: true });
      await rm(aliasParent, { recursive: true, force: true });
    }
  });

  it('D4: a corrupt state file is refused as an actionable failure on install, uninstall, and inspect, never treated as "nothing installed"', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      await mkdir(path.join(configDir, 'ambicode-install'), { recursive: true });
      await writeFile(path.join(configDir, 'ambicode-install', 'state.json'), '{ not valid json');

      const installResult = await install({ candidateDir, configDir, scope: 'user', projectDir: null }, fakeNative().native);
      assert.equal(installResult.ok, false);
      assert.equal(installResult.code, 'state-corrupt');

      const uninstallResult = await uninstall(
        { configDir, scope: null, scopeExplicit: false, projectDir: null, projectDirExplicit: false },
        fakeNative().native,
      );
      assert.equal(uninstallResult.ok, false);
      assert.equal(uninstallResult.code, 'state-corrupt');

      const inspectResult = await inspect({ configDir }, fakeNative().native);
      assert.equal(inspectResult.ok, false);
      assert.equal(inspectResult.code, 'state-corrupt');
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('D5: a failed structured plugin-list during install aborts rather than being read as "not installed"', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      const { native, calls } = fakeNative({ pluginList: () => ({ ok: false, plugins: [], stderr: 'transient failure' }) });
      const result = await install({ candidateDir, configDir, scope: 'user', projectDir: null }, native);

      assert.equal(result.ok, false);
      assert.equal(result.code, 'plugin-list-failed');
      // Never inferred "not installed" and proceeded to install anyway.
      assert.ok(!calls.includes('pluginInstall'));
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('D6: strict plugin validation against the staged candidate blocks the install before anything is published', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      const { native, calls } = fakeNative({
        pluginValidateStrict: () => ({ ok: false, report: { success: false, manifest: { errors: ['bad'] } }, stderr: '' }),
      });
      const result = await install({ candidateDir, configDir, scope: 'user', projectDir: null }, native);

      assert.equal(result.ok, false);
      assert.equal(result.code, 'plugin-validation-failed');
      // Nothing native was touched: validation runs before publishing.
      assert.deepEqual(calls, ['pluginValidateStrict']);
      const marketplaceExists = await stat(path.join(configDir, 'ambicode-install', 'marketplace')).then(
        () => true,
        () => false,
      );
      assert.equal(marketplaceExists, false);
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('D7: a fresh install that fails after the marketplace registration was created removes that registration rather than leaving it dangling', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      const { native, calls, state } = fakeNative({
        pluginInstall: () => ({ ok: false, outcome: 'failed', failureCode: 'unknown', message: 'boom' }),
      });
      const result = await install({ candidateDir, configDir, scope: 'user', projectDir: null }, native);

      assert.equal(result.ok, false);
      assert.equal(result.code, 'plugin-install-failed');
      assert.ok(calls.includes('marketplaceAdd'));
      assert.ok(calls.includes('marketplaceRemove'), 'the dangling marketplace registration must be removed on a failed fresh install');
      // Native state confirms the registration is actually gone, not merely
      // that marketplaceRemove was invoked.
      assert.equal(state.marketplaceRegistered, false);
      // No recovery journal needed: compensation fully succeeded.
      assert.equal(result.journal, null);
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('D7: an upgrade that fails after the plugin was updated refreshes the marketplace to point at the restored (previous) content', async () => {
    const v1 = await makeCandidate('ambicode', '0.1.0');
    const v2 = await makeCandidate('ambicode', '0.2.0');
    const configDir = await freshConfigDir();
    try {
      const first = fakeNative();
      await install({ candidateDir: v1, configDir, scope: 'user', projectDir: null }, first.native);

      let updateCount = 0;
      const { native, calls } = fakeNative({
        marketplaceUpdate: (...args) => {
          updateCount += 1;
          // Succeed on the way in; fail only the *compensating* refresh call
          // is never distinguishable by call count alone here, so instead
          // fail a later, distinguishable step (postcondition) to exercise
          // the same compensation path deterministically.
          return { ok: true, stdout: '', stderr: '' };
        },
        pluginList: (function () {
          let call = 0;
          return (...args) => {
            call += 1;
            // First call (existing-version check): report the old version so
            // pluginUpdate runs. Second call (D8 postcondition): lie about
            // the version, forcing a postcondition failure after the update
            // already "succeeded" natively.
            if (call === 1) return { ok: true, plugins: [{ id: `ambicode@${MARKETPLACE_NAME}`, scope: 'user', version: '0.1.0', enabled: true }] };
            return { ok: true, plugins: [{ id: `ambicode@${MARKETPLACE_NAME}`, scope: 'user', version: '0.1.0', enabled: true }] };
          };
        })(),
      });
      const result = await install({ candidateDir: v2, configDir, scope: 'user', projectDir: null }, native);

      assert.equal(result.ok, false);
      assert.equal(result.code, 'postcondition-failed');
      assert.ok(calls.includes('pluginUpdate'));
      // The compensating refresh ran as part of unwinding.
      assert.ok(updateCount >= 2, 'marketplaceUpdate must run again as part of compensation');
      // The live installation was not left on the failed v2 attempt.
      assert.equal(await readManifestVersion(configDir), '0.1.0');
    } finally {
      await rm(v1, { recursive: true, force: true });
      await rm(v2, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });

  it('D11: refuses to install while another process holds the ownership lock, and reclaims a stale lock left by a dead process', async () => {
    const candidateDir = await makeCandidate('ambicode', '0.1.0');
    const configDir = await freshConfigDir();
    try {
      await mkdir(path.join(configDir, 'ambicode-install'), { recursive: true });
      // A live-looking lock (this test process's own pid is, definitionally, alive).
      await writeFile(
        path.join(configDir, 'ambicode-install', 'lock.json'),
        JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }),
      );
      const blocked = await install({ candidateDir, configDir, scope: 'user', projectDir: null }, fakeNative().native);
      assert.equal(blocked.ok, false);
      assert.equal(blocked.code, 'locked');

      // A stale lock (an all-but-impossible pid) is reclaimed rather than blocking forever.
      await writeFile(
        path.join(configDir, 'ambicode-install', 'lock.json'),
        JSON.stringify({ pid: 999999, acquiredAt: new Date().toISOString() }),
      );
      const result = await install({ candidateDir, configDir, scope: 'user', projectDir: null }, fakeNative().native);
      assert.equal(result.ok, true, JSON.stringify(result));
    } finally {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
    }
  });
});
