// The plan-eval composite (v6 33 §4), fixed before the first run. The rule, verbatim:
//
//   Composite, defined before the first run (#62): for each metric, the naked arm's run-to-run
//   spread (max − min over its 3 runs per epic, averaged) is the noise. The route **wins** when it is
//   above naked by more than the noise on ≥ 2 of the 3 metrics and not below naked by more than the
//   noise on the third. A tie on AC coverage is expected and counts as "not below".
//
// Input per arm: `{fileRecall, anchorValidity, acCoverage}`, each `{epic: [run value, ...]}`; null runs
// (an unmeasurable anchor validity) are dropped. Output carries means and spreads of both arms (P50).
export const METRICS = ['fileRecall', 'anchorValidity', 'acCoverage'];

const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const clean = (runs) => (runs ?? []).filter((value) => typeof value === 'number' && Number.isFinite(value));
const spreadOf = (perEpic) => mean(Object.values(perEpic ?? {}).map(clean).filter((runs) => runs.length).map((runs) => Math.max(...runs) - Math.min(...runs)));
const meanOf = (perEpic) => mean(Object.values(perEpic ?? {}).flatMap(clean));

export function planComposite({ naked, route }) {
  const perMetric = {};
  for (const metric of METRICS) {
    const nakedMean = meanOf(naked?.[metric]);
    const routeMean = meanOf(route?.[metric]);
    const noise = spreadOf(naked?.[metric]);
    if (nakedMean === null || routeMean === null || noise === null) {
      perMetric[metric] = { nakedMean, routeMean, noise, routeSpread: spreadOf(route?.[metric]), delta: null, verdict: 'unmeasured' };
      continue;
    }
    const delta = routeMean - nakedMean;
    const verdict = delta > noise ? 'above' : delta < -noise ? 'below' : delta === 0 ? 'tie' : 'within';
    perMetric[metric] = { nakedMean, routeMean, noise, routeSpread: spreadOf(route?.[metric]), delta, verdict };
  }
  const verdicts = METRICS.map((metric) => perMetric[metric].verdict);
  const measured = !verdicts.includes('unmeasured');
  const win = measured && verdicts.filter((verdict) => verdict === 'above').length >= 2 && !verdicts.includes('below');
  return { win, perMetric };
}
