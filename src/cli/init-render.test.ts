import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderInit, type InitOutput } from './commands/init.ts';

function output(overrides: Partial<InitOutput>): InitOutput {
  return {
    command: 'init',
    configPath: '/repo/.ambicode/config.yaml',
    created: false,
    written: false,
    changes: [],
    notices: [],
    ruleSources: [],
    projects: [],
    ...overrides,
  };
}

describe('the init summary names one outcome', () => {
  it('says nothing changed when an existing file already describes everything', () => {
    const text = renderInit(output({}));
    assert.match(text, /^Checked \/repo\/\.ambicode\/config\.yaml: nothing to change\.$/m);
    assert.doesNotMatch(text, /Updated|nothing was written/);
  });

  it('says a dry run wrote nothing, next to what it would have done', () => {
    const text = renderInit(output({ changes: ['Enabled builtin/angular-style for project "app": its dependencies call for them.'] }));
    assert.match(text, /^Updated \/repo\/\.ambicode\/config\.yaml$/m);
    assert.match(text, /^\(dry run: nothing was written\)$/m);
  });

  it('says created or updated when the file was written', () => {
    assert.match(renderInit(output({ created: true, written: true })), /^Created /m);
    assert.match(renderInit(output({ written: true, changes: ['x'] })), /^Updated /m);
    assert.doesNotMatch(renderInit(output({ written: true, changes: ['x'] })), /nothing was written/);
  });
});
