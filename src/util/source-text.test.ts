import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { NodeProcessRunner } from '../ports/node-process-runner.ts';
import { nodeFileSystem } from '../ports/filesystem.ts';

/**
 * A literal control byte in a source file — a NUL above all — makes git treat
 * the file as binary: `git diff` stops showing it, and a reviewer of AMBICODE
 * itself stops being able to read the change. A character class or a separator
 * that needs one is written with a backslash escape instead of the byte.
 *
 * This is checked over the whole tree rather than one file, because the defect
 * is easy to reintroduce anywhere and invisible in an editor.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function sourceFiles(): Promise<string[]> {
  const found = await nodeFileSystem.glob('src/**/*.ts', repositoryRoot);
  return found.sort();
}

describe('source files stay text', () => {
  it('holds no literal control byte in any TypeScript source', async () => {
    const offenders: string[] = [];
    for (const relative of await sourceFiles()) {
      const bytes = await readFile(path.join(repositoryRoot, relative));
      // Tab, newline and carriage return are the legitimate ones.
      const control = [...bytes].filter((byte) => byte < 0x09 || (byte > 0x0d && byte < 0x20) || byte === 0x7f);
      if (control.length > 0) {
        offenders.push(`${relative}: ${control.length} control byte(s) ${[...new Set(control)].join(', ')}`);
      }
    }
    assert.deepEqual(offenders, [], `write the character as an escape instead:\n${offenders.join('\n')}`);
  });

  it('lets git diff src/review/validate.ts as text', async () => {
    const runner = new NodeProcessRunner();
    // `--numstat` prints "-\t-" for a path git considers binary, and real
    // counts for text, which is exactly the distinction being asserted.
    const outcome = await runner.run({
      argv: ['git', 'diff', '--numstat', '--no-index', '--', '/dev/null', 'src/review/validate.ts'],
      cwd: repositoryRoot,
      timeoutMs: 30_000,
      maxOutputBytes: 65_536,
      env: { kind: 'inherited', overrides: { LC_ALL: 'C' } },
    });

    assert.equal(outcome.kind, 'exited');
    assert.match(outcome.stdout, /^\d+\t\d+\t/, `git reported: ${JSON.stringify(outcome.stdout)}`);
    assert.ok(!outcome.stdout.startsWith('-\t-\t'), 'git treated the file as binary');
  });
});
