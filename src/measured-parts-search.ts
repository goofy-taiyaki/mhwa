import { rankMeasuredCandidates } from './measured-candidate-search.ts';
import type { MeasuredCandidate, DistanceFeatureSpec } from './measured-candidate-search.ts';

export interface MeasuredPart {
  id: string;
  label: string;
  features: DistanceFeatureSpec;
  candidates: MeasuredCandidate[];
}
export interface MeasuredPartsCatalog {
  schemaVersion: 1;
  kind: 'measured_parts_catalog';
  gameBuild: string;
  baseEvidence: string;
  captureConditions: string;
  limitations: string;
  parts: MeasuredPart[];
}

/** Combines independently ranked measured controls for development diagnostics.
 * A combination can be unmeasured even when every individual value was measured.
 * No interpolation, coupling correction, acceptance decision or recipe mutation.
 */
export function rankMeasuredParts(input: unknown, parts: MeasuredPart[]) {
  if (!Array.isArray(parts) || parts.length < 2 || parts.length > 32) throw Error('Expected 2 to 32 measured parts');
  const ids = new Set<string>(), keys = new Set<string>();
  const ranked = parts.map(part => {
    if (!part || typeof part.id !== 'string' || !part.id.trim() || ids.has(part.id) ||
      typeof part.label !== 'string' || !part.label.trim()) throw Error('Expected unique part IDs and nonempty labels');
    ids.add(part.id);
    const result = rankMeasuredCandidates(input,part.candidates,part.features);
    for (const key of Object.keys(result.ranking[0].settings)) {
      if (keys.has(key)) throw Error('Setting keys must not overlap between parts');
      keys.add(key);
    }
    return {id:part.id,label:part.label,result};
  });
  return {status:'exploratory_part_ranking' as const,combinationStatus:'not_validated' as const,
    proposedSettings:Object.fromEntries(ranked.flatMap(part=>Object.entries(part.result.ranking[0].settings))),
    parts:ranked,limitations:[
      'Each part uses its own measured candidates and features; measurements require compatible base and capture conditions.',
      'Combining measured values does not establish that their joint appearance was measured or reproduced.',
      'Other controls can change these features; independent part ranking does not correct such interactions.',
      'No calibrated accuracy, acceptance threshold, interpolation, extrapolation, or automatic recipe update.'
    ]};
}

export function parseMeasuredPartsCatalog(value: unknown): MeasuredPartsCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid measured parts catalog');
  const c=value as MeasuredPartsCatalog;
  if(c.schemaVersion!==1 || c.kind!=='measured_parts_catalog' ||
    [c.gameBuild,c.baseEvidence,c.captureConditions,c.limitations].some(v=>typeof v!=='string'||!v.trim()) ||
    !Array.isArray(c.parts)) throw Error('Invalid measured parts catalog');
  rankMeasuredParts(c.parts[0]?.candidates?.[0]?.observations?.[0],c.parts);
  return structuredClone(c);
}
