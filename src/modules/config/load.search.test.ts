import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfigWithNotices } from './load.ts';
import { CONFIG } from '#testing/fixtures/route-fixture';

const withSearch = (search: string) => parseConfigWithNotices(`${CONFIG}\nsearch:\n${search}`);

describe('search keys of the removed code index', () => {
  it('accepts search.tuning, search.index and search.indexDriftFiles, drops them and says so once each', () => {
    const { config, notices } = withSearch('  index: codeindex\n  indexDriftFiles: 5\n  tuning: { topFiles: 4 }\n');
    assert.deepEqual(config.search, {});
    assert.deepEqual(notices, ['tuning', 'index', 'indexDriftFiles'].map((key) => `config: "search.${key}" is no longer used; remove it from .ambicode/config.yaml`));
  });

  it('keeps the legal layer names of a list and drops index, index.find, index.relates and history with a notice', () => {
    const { config, notices } = withSearch('  layers:\n    prompt: [shortlist, history, harvest, index.find, shortlist]\n    context: [index, index.relates]\n');
    assert.deepEqual(config.search.layers, { prompt: ['shortlist', 'harvest', 'shortlist'] });
    assert.equal(notices.length, 2);
    assert.match(notices[0]!, /^config: "search\.layers\.prompt" names history, index\.find, which no longer exist/);
    assert.match(notices[1]!, /^config: "search\.layers\.context" names index, index\.relates/);
  });

  it('leaves a clean search block without notices', () => {
    assert.deepEqual(withSearch('  layers: { context: [grep, harvest] }\n').notices, []);
  });
});
