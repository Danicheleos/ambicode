import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AmbicodeError } from '#util/errors';
import { canonicalSets, parseSet, parseSets, setStrings } from './init-sets.ts';

const refused = (run: () => unknown): void =>
  assert.throws(run, (error: unknown) => error instanceof AmbicodeError && error.code === 'bad-argument' && error.field === '--set');

describe('09-G3: the settable keys', () => {
  it('09-G3: requirements.mcpServer takes a bare string, a JSON-quoted string and null', () => {
    assert.deepEqual(parseSet('requirements.mcpServer=jira'), { key: 'requirements.mcpServer', value: 'jira' });
    assert.deepEqual(parseSet('requirements.mcpServer="my jira"'), { key: 'requirements.mcpServer', value: 'my jira' });
    assert.deepEqual(parseSet('requirements.mcpServer=null'), { key: 'requirements.mcpServer', value: null });
  });

  it('09-G3: requirements.acceptanceField takes customfield_<n> and refuses anything else', () => {
    assert.deepEqual(parseSet('requirements.acceptanceField=customfield_123'), { key: 'requirements.acceptanceField', value: 'customfield_123' });
    refused(() => parseSet('requirements.acceptanceField=acceptance'));
    refused(() => parseSet('requirements.acceptanceField=customfield_'));
  });

  it('09-G3: search.index takes none or codeindex, refuses a bad value and null', () => {
    assert.deepEqual(parseSet('search.index=none'), { key: 'search.index', value: 'none' });
    assert.deepEqual(parseSet('search.index=codeindex'), { key: 'search.index', value: 'codeindex' });
    refused(() => parseSet('search.index=lsp'));
    refused(() => parseSet('search.index=null'));
  });

  it('09-G3: a command slot takes null or a JSON array of strings', () => {
    for (const slot of ['lint', 'unit', 'e2e', 'format']) {
      const key = `projects.app.commands.${slot}`;
      assert.deepEqual(parseSet(`${key}=null`), { key, value: null });
      assert.deepEqual(parseSet(`${key}=["./bin/x","--","{files}"]`), { key, value: ['./bin/x', '--', '{files}'] });
    }
  });

  it('09-G3: an empty array, a non-string element and a bare word are refused for a command', () => {
    refused(() => parseSet('projects.app.commands.lint=[]'));
    refused(() => parseSet('projects.app.commands.lint=[1]'));
    refused(() => parseSet('projects.app.commands.lint=./bin/lint'));
  });
});

describe('09-G3: refusals', () => {
  it('09-G3: an unknown key, a missing "=", an unsettable command slot are bad-argument on --set', () => {
    refused(() => parseSet('review.model=opus'));
    refused(() => parseSet('requirements.mcpServer'));
    refused(() => parseSet('projects.app.commands.deploy=null'));
    refused(() => parseSet('projects.App.commands.lint=null'));
  });

  it('09-G3: bad JSON is bad-argument on --set', () => {
    refused(() => parseSet('projects.app.commands.lint=["a"'));
    refused(() => parseSet('requirements.mcpServer="open'));
  });

  it('09-G3: an unknown project is refused when the project ids are given', () => {
    refused(() => parseSets(['projects.web.commands.lint=null'], ['app']));
    assert.deepEqual(parseSets(['projects.app.commands.lint=null'], ['app']), [{ key: 'projects.app.commands.lint', value: null }]);
    assert.equal(parseSets(['projects.web.commands.lint=null']).length, 1);
  });

  it('09-G3: a repeated key is refused', () => {
    refused(() => parseSets(['search.index=none', 'search.index=codeindex']));
  });
});

describe('09-G3: canonical form', () => {
  it('09-G3: canonicalSets sorts by key and joins key=<JSON> with one space', () => {
    const pairs = parseSets(['search.index=codeindex', 'projects.app.commands.lint=["./l","--","{files}"]', 'requirements.mcpServer=jira', 'projects.app.commands.unit=null']);
    assert.equal(
      canonicalSets(pairs),
      'projects.app.commands.lint=["./l","--","{files}"] projects.app.commands.unit=null requirements.mcpServer="jira" search.index="codeindex"',
    );
  });

  it('09-G3: canonicalSets of no pairs is the empty string and does not reorder its input', () => {
    assert.equal(canonicalSets([]), '');
    const pairs = parseSets(['search.index=none', 'requirements.mcpServer=a']);
    canonicalSets(pairs);
    assert.deepEqual(pairs.map((pair) => pair.key), ['search.index', 'requirements.mcpServer']);
  });

  it('09-G3: setStrings are sorted key=<JSON> strings', () => {
    const pairs = parseSets(['search.index=codeindex', 'projects.app.commands.lint=null']);
    assert.deepEqual(setStrings(pairs), ['projects.app.commands.lint=null', 'search.index="codeindex"']);
    assert.deepEqual(setStrings([]), []);
  });
});
