import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { autoLoaded } from './path-classes.ts';

describe('autoLoaded', () => {
  it('judges a CLAUDE.md at any depth and the root .claude/rules tree as loaded, and near misses as not', () => {
    for (const file of ['CLAUDE.md', 'docs/CLAUDE.md', 'CLAUDE.local.md', '.claude/rules/a.md']) assert.equal(autoLoaded(file), true, file);
    for (const file of ['docs/CLAUDE.md.bak', 'MYCLAUDE.md', 'AGENTS.md', 'x/.claude/rules/a.md']) assert.equal(autoLoaded(file), false, file);
  });
});
