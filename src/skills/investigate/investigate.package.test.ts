import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { navigationFor } from '#modules/search/text/navigation';
import { REPO_ROOT } from '#testing/paths';

const text = (relative: string): Promise<string> => readFile(path.join(REPO_ROOT, relative), 'utf8');
const FLIPPED = ['casual-look', 'how-much-work', 'url-question', 'which-files', 'why-question'];

describe('investigate evals, packaging and navigation guidance', () => {
  it('03-V1: the five investigate-positive trigger cases assert no skill fires; url-bare keeps its diagnostics', async () => {
    const negative = await text('evals/common/triggers/neg-http/graders/no-skill-fired.md');
    for (const name of FLIPPED) {
      assert.equal(await text(`evals/common/triggers/${name}/graders/no-skill-fired.md`), negative);
      await assert.rejects(text(`evals/common/triggers/${name}/graders/investigate-fired.md`));
    }
    assert.match(negative, /ambicode:\(investigate\|plan\|task\|review\|init\|rules\)/);
    await assert.doesNotReject(text('evals/common/triggers/url-bare/graders/fired-investigate.md'));
  });

  it('03-V2: the gate script is gone, the suite and its validity check stay, and the README says it is negative-only', async () => {
    const scripts = (JSON.parse(await text('package.json')) as { scripts: Record<string, string> }).scripts;
    assert.equal(scripts['evals:triggers:gate'], undefined);
    assert.match(scripts['evals:triggers'] ?? '', /run-validity\.mjs/);
    const readme = (await text('evals/common/triggers/README.md')).replace(/\s+/g, ' ');
    assert.match(readme, /negative-only check/);
    assert.match(readme, /no longer a release gate for description edits/);
  });

  it('03-V3: route and step files are packaged', async () => {
    assert.match(await text('tools/package-candidate.mjs'), /from: 'routes', extensions: \['\.yaml', '\.md'\]/);
  });

  it('03-M7: navigation guidance is short, names refs, and carries no reading order', async () => {
    const guidance = navigationFor('typescript');
    assert.ok(guidance.evidenceRequirement.length < 100 && guidance.readGuidance.length < 100);
    assert.match(guidance.evidenceRequirement, /refs/);
    assert.match(guidance.readGuidance, /hypothesis/);
    assert.equal('readingOrder' in guidance, false);
  });
});
