import { rankMeasuredCandidates } from './measured-candidate-search.ts';
import type { DistanceFeatureSpec, MeasuredCandidate } from './measured-candidate-search.ts';

/** Experimental inverse of a piecewise-linear curve through measured centroids.
 * The caller supplies an independently observed UI step. Every coordinate and
 * provenance check is inherited from measured ranking; this adds no calibrated
 * domain/pose/quality test. A zero residual does not establish a plausible face.
 */
export function interpolateMeasuredControl(input: unknown, candidates: MeasuredCandidate[], spec: DistanceFeatureSpec, step: number) {
  const measured = rankMeasuredCandidates(input, candidates, spec);
  const keys = Object.keys(measured.ranking[0].settings);
  if (keys.length !== 1 || measured.ranking.length < 3) throw Error('A curve requires one setting and at least three measured values');
  if (!Number.isFinite(step) || step <= 0) throw Error('Expected a positive measured UI step');
  const key = keys[0];
  const nodes = [...measured.ranking].sort((a,b) => a.settings[key] - b.settings[key]);
  if (nodes.some(n => !Number.isSafeInteger(n.settings[key] / step))) throw Error('Measured values must be multiples of the UI step');
  const query = measured.features;
  const segments = nodes.slice(1).map((b,i) => {
    const a = nodes[i];
    const delta = b.centroid.map((v,j) => v - a.centroid[j]);
    const norm = delta.reduce((s,v) => s + v*v, 0);
    if (!Number.isFinite(norm) || norm <= Number.EPSILON) throw Error('Degenerate measured curve segment');
    const rawT = query.reduce((s,v,j) => s + (v-a.centroid[j])*delta[j], 0) / norm;
    const t = Math.max(0, Math.min(1, rawT));
    const value = a.settings[key] + t * (b.settings[key]-a.settings[key]);
    const roundedValue = Math.round(value / step) * step;
    const residual = Math.hypot(...query.map((v,j) => v-a.centroid[j]-t*delta[j])) / Math.sqrt(query.length);
    if (![rawT,t,value,roundedValue,residual].every(Number.isFinite)) throw Error('Nonfinite interpolation');
    return { from:a.settings[key], to:b.settings[key], rawT, t, value, roundedValue, residual };
  }).sort((a,b) => a.residual-b.residual || a.value-b.value);
  return { status:'experimental_interpolation' as const, key, step,
    nearest:measured.ranking[0].settings[key], value:segments[0].value, roundedValue:segments[0].roundedValue,
    measuredRange:[nodes[0].settings[key],nodes.at(-1)!.settings[key]], segments,
    limitations:[
      'Intermediate values are interpolated, not directly measured candidates.',
      'The nearest curve point can exist for unsupported faces; residual is not confidence.',
      'Clamping to a measured endpoint does not establish input compatibility.',
      'Single-image noise can change even a baseline value; interactions and full recipe reproduction are unvalidated.',
    ] };
}
