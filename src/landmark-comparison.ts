import { summarizeFaces } from './face-analysis.ts';
import type { Point } from './face-analysis.ts';

export interface ComparisonSelection {
  alignmentIndices: number[];
  evaluationIndices: number[];
}

function validateIndices(indices: number[], name: string, minimum: number) {
  if (!Array.isArray(indices) || indices.length < minimum || indices.length > 478 ||
    new Set(indices).size !== indices.length ||
    indices.some(i => !Number.isInteger(i) || i < 0 || i >= 478)) {
    throw Error(`Invalid ${name} landmark indices`);
  }
}

/** Diagnostic 2D similarity fit, never a likeness score or a pose correction.
 * Defaults to all points, which can absorb real shape changes. Explicit,
 * disjoint fit/evaluation sets allow independent evaluation; stability of the
 * selected fit points still requires experimental validation. z is excluded.
 */
export function compareLandmarks(reference: Point[], sample: Point[],
  referenceSize: {width: number; height: number}, sampleSize: {width: number; height: number},
  selection?: ComparisonSelection) {
  summarizeFaces([reference], referenceSize.width, referenceSize.height);
  summarizeFaces([sample], sampleSize.width, sampleSize.height);
  const all = reference.map((_, i) => i);
  const alignmentIndices = selection ? selection.alignmentIndices : all;
  const evaluationIndices = selection ? selection.evaluationIndices : all;
  if (selection) {
    validateIndices(alignmentIndices, 'alignment', 3);
    validateIndices(evaluationIndices, 'evaluation', 1);
    if (evaluationIndices.some(i => alignmentIndices.includes(i))) throw Error('Alignment and evaluation landmarks must be disjoint');
  }
  const pixel = (ps: Point[], size: typeof referenceSize) => ps.map(p => ({x:p.x*size.width,y:p.y*size.height}));
  const r = pixel(reference, referenceSize), s = pixel(sample, sampleSize);
  const center = (ps: typeof r) => ({x:ps.reduce((v,p)=>v+p.x,0)/ps.length,y:ps.reduce((v,p)=>v+p.y,0)/ps.length});
  const rc = center(alignmentIndices.map(i => r[i])), sc = center(alignmentIndices.map(i => s[i]));
  let dot=0, cross=0, energy=0, referenceEnergy=0, raw=0;
  for (const i of alignmentIndices) {
    const x=s[i].x-sc.x,y=s[i].y-sc.y,u=r[i].x-rc.x,v=r[i].y-rc.y;
    dot+=x*u+y*v; cross+=x*v-y*u; energy+=x*x+y*y; referenceEnergy+=u*u+v*v;
  }
  for (let i=0;i<r.length;i++) raw+=(s[i].x-r[i].x)**2+(s[i].y-r[i].y)**2;
  if (energy<=0 || referenceEnergy<=0) throw Error('Degenerate alignment');
  const a=dot/energy,b=cross/energy,scale=Math.hypot(a,b);
  if (!Number.isFinite(scale) || scale<=1e-12) throw Error('Degenerate alignment');
  const tx=rc.x-a*sc.x+b*sc.y,ty=rc.y-b*sc.x-a*sc.y;
  const residualsPx=s.map((p,i)=>Math.hypot(a*p.x-b*p.y+tx-r[i].x,b*p.x+a*p.y+ty-r[i].y));
  const alignedRmsPx=Math.sqrt(residualsPx.reduce((v,d)=>v+d*d,0)/r.length);
  const referenceRadiusPx=Math.sqrt(referenceEnergy/alignmentIndices.length);
  const rms = (indices: number[]) => Math.sqrt(indices.reduce((v,i)=>v+residualsPx[i]**2,0)/indices.length);
  const evaluationRmsPx = rms(evaluationIndices);
  if (![alignedRmsPx,referenceRadiusPx,tx,ty,raw].every(Number.isFinite)) throw Error('Nonfinite alignment');
  return {kind:'diagnostic_similarity_2d' as const, pointCount:r.length,
    fitMode:selection ? 'held_out_points' as const : 'all_points' as const,
    alignmentIndices:[...alignmentIndices],evaluationIndices:[...evaluationIndices],
    alignmentRmsPx:rms(alignmentIndices),evaluationRmsPx,
    evaluationNormalizedRms:evaluationRmsPx/referenceRadiusPx,
    rawRmsPx:Math.sqrt(raw/r.length),alignedRmsPx,referenceRadiusPx,
    normalizedRms:alignedRmsPx/referenceRadiusPx,
    sampleToReference:{scale,rotationRadians:Math.atan2(b,a),tx,ty},residualsPx};
}
