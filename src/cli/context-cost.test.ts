import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createRuntime } from '#composition/root';
import { evidenceSource } from './options/target-option.ts';
import { REPO_ROOT } from '#testing/paths';

/**
 * The ceilings below are drift detectors, not budgets: they sit just above what
 * is emitted, so an added paragraph fails loudly and gets a deliberate decision.
 */

const repositoryRoot = REPO_ROOT;

// `references/` files carry no ceiling: they are read on demand, not on every call.
const MAX_SKILL_BYTES: Record<string, number> = {
  'init/SKILL.md': 4_200,
  'investigate/SKILL.md': 2_048,
  'plan/SKILL.md': 9_900,
  'review/SKILL.md': 2_048,
  'task/SKILL.md': 10_650,
  // A setup-time skill, never on a per-call path: this ceiling is about discipline, not per-call cost.
  'rules/SKILL.md': 10_000,
};

describe('R2 per-call context cost', () => {
  it('resolves --evidence - to standard input for review and bundle too, and a path to that path', async () => {
    const runtime = await createRuntime({ cwd: repositoryRoot });
    assert.deepEqual(evidenceSource(runtime, '-'), { kind: 'stdin' });
    assert.deepEqual(evidenceSource(runtime, null), null);
    assert.equal(evidenceSource(runtime, 'evidence.json')?.kind, 'file');
  });

  it('keeps every shipped skill file under its byte ceiling', async () => {
    for (const [relative, ceiling] of Object.entries(MAX_SKILL_BYTES)) {
      const content = await readFile(path.join(repositoryRoot, 'skills', relative), 'utf8');
      const bytes = Buffer.byteLength(content, 'utf8');
      assert.ok(
        bytes <= ceiling,
        `skills/${relative} is ${bytes} bytes, over its ${ceiling}-byte ceiling. ` +
          'Every one of these is read into context before any project code is; ' +
          'cut a repetition, move the rule to the file that owns it, or raise the ceiling deliberately.',
      );
    }
  });
});
