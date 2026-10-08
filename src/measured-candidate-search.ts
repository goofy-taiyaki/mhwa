import { validateObservation } from './observation-comparison.ts';
import { compareLandmarks } from './landmark-comparison.ts';

export interface DistanceFeatureSpec {
  alignmentIndices: number[];
  pairs: [number, number][];
}
export interface MeasuredCandidate {
  id: string;
  settings: Record<string, number>;
  observations: unknown[];
}

export interface MeasuredCatalog {
  schemaVersion: 1;
  kind: 'measured_candidate_catalog';
  gameBuild: string;
  baseEvidence: string;
  captureConditions: string;
  limitations: string;
  features: DistanceFeatureSpec;
  candidates: MeasuredCandidate[];
}

export function parseMeasuredCatalog(value: unknown): MeasuredCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid measured catalog');
  const c=value as MeasuredCatalog;
  if(c.schemaVersion!==1 || c.kind!=='measured_candidate_catalog' ||
    [c.gameBuild,c.baseEvidence,c.captureConditions,c.limitations].some(v=>typeof v!=='string'||!v.trim()) ||
    !Array.isArray(c.candidates) || !c.candidates.length) throw Error('Invalid measured catalog');
  rankMeasuredCandidates(c.candidates[0]?.observations?.[0],c.candidates,c.features);
  return structuredClone(c);
}

/** Ratios to the anchors' RMS radius. Corrects 2D similarity only, not 3D pose.
 * Point pairs and anchors must be selected and validated outside this function.
 */
export function distanceFeatures(input: unknown, spec: DistanceFeatureSpec) {
  const ob = validateObservation(input);
  if (!spec || !Array.isArray(spec.pairs) || !spec.pairs.length || spec.pairs.length > 478 ||
    spec.pairs.some(p => !Array.isArray(p) || p.length !== 2 || p[0] === p[1])) {
    throw Error('Expected nonempty distinct-endpoint landmark pairs');
  }
  const keys = spec.pairs.map(p => [...p].sort((a,b) => a-b).join(':'));
  if (new Set(keys).size !== keys.length) throw Error('Duplicate landmark pair');
  const evaluationIndices = [...new Set(spec.pairs.flat())];
  // Reuse finite-coordinate, integer-index, disjointness and anchor checks.
  const fit = compareLandmarks(ob.landmarks[0], ob.landmarks[0], ob.image, ob.image,
    {alignmentIndices:spec.alignmentIndices,evaluationIndices});
  const points = ob.landmarks[0];
  const values = spec.pairs.map(([a,b]) => Math.hypot(
    (points[a].x-points[b].x)*ob.image.width,
    (points[a].y-points[b].y)*ob.image.height) / fit.referenceRadiusPx);
  if (values.some(v => !Number.isFinite(v))) throw Error('Nonfinite distance feature');
  return {values,engine:ob.engine,modelSha256:ob.modelSha256,delegate:ob.delegate};
}

function rms(a: number[], b: number[]) {
  return Math.hypot(...a.map((v,i) => v-b[i])) / Math.sqrt(a.length);
}

/** Development diagnostic: ranks only measured settings, with no interpolation,
 * confidence percentage, acceptance threshold or automatic recipe mutation.
 * Catalog game/base/capture compatibility and held-out accuracy are external
 * requirements; engine equality alone cannot establish them.
 */
export function rankMeasuredCandidates(input: unknown, candidates: MeasuredCandidate[], spec: DistanceFeatureSpec) {
  const query = distanceFeatures(input,spec);
  if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 10000) {
    throw Error('Expected at least two measured candidates');
  }
  const ids = new Set<string>(), settingsSeen = new Set<string>();
  let settingKeys: string | undefined;
  const ranking = candidates.map(candidate => {
    if (!candidate || typeof candidate.id !== 'string' || !candidate.id.trim() || ids.has(candidate.id) ||
      !candidate.settings || Array.isArray(candidate.settings) || typeof candidate.settings !== 'object' ||
      !Array.isArray(candidate.observations) || candidate.observations.length < 2) {
      throw Error('Expected unique candidate IDs, settings and repeated observations');
    }
    ids.add(candidate.id);
    const entries = Object.entries(candidate.settings).sort(([a],[b]) => a.localeCompare(b));
    if (!entries.length || entries.some(([k,v]) => !k.trim() || typeof v !== 'number' || !Number.isFinite(v))) {
      throw Error('Invalid measured settings');
    }
    const keys = JSON.stringify(entries.map(([k]) => k)), signature = JSON.stringify(entries);
    if ((settingKeys !== undefined && keys !== settingKeys) || settingsSeen.has(signature)) {
      throw Error('Candidates must share setting keys and have distinct settings');
    }
    settingKeys = keys; settingsSeen.add(signature);
    const samples = candidate.observations.map(ob => {
      const feature = distanceFeatures(ob,spec);
      if (feature.engine !== query.engine || feature.modelSha256 !== query.modelSha256 || feature.delegate !== query.delegate) {
        throw Error('Incompatible analysis provenance');
      }
      return feature.values;
    });
    const centroid = query.values.map((_,i) => samples.reduce((sum,s) => sum+s[i]/samples.length,0));
    const distances = samples.map(s => rms(s,centroid));
    return {id:candidate.id,settings:{...candidate.settings},sampleCount:samples.length,centroid,
      distance:rms(query.values,centroid),trainingSpreadMax:Math.max(...distances)};
  }).sort((a,b) => a.distance-b.distance || a.id.localeCompare(b.id));
  if (ranking.some(r => !Number.isFinite(r.distance) || !Number.isFinite(r.trainingSpreadMax))) {
    throw Error('Nonfinite candidate distance');
  }
  return {status:'exploratory_ranking' as const,features:[...query.values],ranking,
    distanceKind:'rms_of_anchor_normalized_spans' as const,
    limitations:['Training spread is not a confidence interval or an acceptance threshold.',
      'Ranking always has a first entry, including unsupported and out-of-range faces.',
      'No interpolation, extrapolation, pose correction, or calibrated likeness probability.',
      'Only measured settings are ranked; complete recipe reconstruction is not established.']};
}
