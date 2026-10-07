import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planComposite } from './plan-composite.mjs';

// Naked noise: spread 0.1 on every metric (two epics, three runs each).
const naked = (base) => ({ a: [base, base + 0.1, base + 0.05], b: [base, base + 0.1, base + 0.05] });
const arm = (recall, anchors, acs) => ({ fileRecall: recall, anchorValidity: anchors, acCoverage: acs });
const nakedArm = arm(naked(0.5), naked(0.5), naked(0.5));
const flat = (value) => ({ a: [value, value, value], b: [value, value, value] });

describe('plan composite', () => {
  it('06-E1: wins above the noise on two metrics with a tie on AC coverage', () => {
    const result = planComposite({ naked: nakedArm, route: arm(flat(0.9), flat(0.9), naked(0.5)) });
    assert.equal(result.win, true);
    assert.equal(result.perMetric.acCoverage.verdict, 'tie');
    assert.ok(Math.abs(result.perMetric.fileRecall.noise - 0.1) < 1e-9);
    assert.ok(Math.abs(result.perMetric.fileRecall.nakedMean - 0.55) < 1e-9);
  });
  it('06-E1: loses when only one metric is above the noise', () => {
    const result = planComposite({ naked: nakedArm, route: arm(flat(0.9), flat(0.55), flat(0.55)) });
    assert.equal(result.win, false);
    assert.equal(result.perMetric.fileRecall.verdict, 'above');
  });
  it('06-E1: an exact tie on AC coverage counts as not below', () => {
    const result = planComposite({ naked: arm(naked(0.5), naked(0.5), flat(0.7)), route: arm(flat(0.9), flat(0.9), flat(0.7)) });
    assert.equal(result.perMetric.acCoverage.verdict, 'tie');
    assert.equal(result.win, true);
  });
  it('06-E1: does not win when below by more than the noise on the third metric', () => {
    const result = planComposite({ naked: nakedArm, route: arm(flat(0.9), flat(0.9), flat(0.2)) });
    assert.equal(result.perMetric.acCoverage.verdict, 'below');
    assert.equal(result.win, false);
  });
  it('06-E1: reports the means and spreads of both arms and drops null runs', () => {
    const result = planComposite({ naked: nakedArm, route: arm(flat(0.9), { a: [null, null, null], b: [0.8, 1] }, flat(0.5)) });
    assert.equal(result.perMetric.anchorValidity.routeMean, 0.9);
    assert.ok(Math.abs(result.perMetric.anchorValidity.routeSpread - 0.2) < 1e-9);
  });
});
