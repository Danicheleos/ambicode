// Unit tests for install-local.mjs (doc 04 P2.3 correction A). These never
// shell out to the real `claude` binary — every native marketplace/plugin
// outcome is injected through a fake `NativeCommands` object, exactly like
// the AMBICODE helper's own tests fake ProcessRunner/FileSystem. The real,
// end-to-end lifecycle against the actual `claude` CLI stays covered by
// `install-local.smoke.mjs` (`npm run smoke:install-local`), which this file
// does not replace.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { install, MARKETPLACE_NAME, uninstall } from './install-local.mjs';

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

/** A never-throwing fake matching the real `createRealNativeCommands()` shape. */
function fakeNative(overrides = {}) {
  const calls = [];
  const defaults = {
    marketplaceAdd: () => ({ ok: true, stdout: '', stderr: '' }),
    marketplaceUpdate: () => ({ ok: true, stdout: '', stderr: '' }),
    marketplaceRemove: () => ({ ok: true, notFound: false, stdout: '', stderr: '' }),
    pluginInstall: () => ({ ok: true, outcome: 'ok', failureCode: null, message: null }),
    pluginUpdate: () => ({ ok: true, outcome: 'ok', failureCode: null, message: null }),
    pluginUninstall: () => ({ ok: true, outcome: 'ok', failureCode: null, message: null }),
    pluginList: () => ({ ok: true, plugins: [] }),
  };
  const merged = { ...defaults, ...overrides };
  const native = {};
  for (const key of Object.keys(merged)) {
    native[key] = (...args) => {
      calls.push(key);
      return merged[key](...args);
    };
  }
  return { native, calls };
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
      const { native, calls } = fakeNative({ pluginList: () => ({ ok: true, plugins: [] }) });
      const result = await install({ candidateDir, configDir, scope: 'user', projectDir: null }, native);

      assert.equal(result.ok, true);
      assert.ok(calls.includes('pluginInstall'), 'expected pluginInstall to be called for a fresh install');
      assert.ok(!calls.includes('pluginUpdate'), 'a fresh install must not call pluginUpdate');
      assert.equal(await readManifestVersion(configDir), '0.1.0');
      assert.deepEqual(await readState(configDir), { name: 'ambicode', version: '0.1.0', scope: 'user', projectDir: null });
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
      await install({ candidateDir: v1, configDir, scope: 'user', projectDir: null }, fakeNative().native);

      const { native, calls } = fakeNative({
        pluginList: () => ({ ok: true, plugins: [{ id: `ambicode@${MARKETPLACE_NAME}`, version: '0.1.0', scope: 'user' }] }),
      });
      const result = await install({ candidateDir: v2, configDir, scope: 'user', projectDir: null }, native);

      assert.equal(result.ok, true);
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
