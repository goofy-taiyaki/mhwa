import { compareLandmarks } from './landmark-comparison.ts';
import type { ComparisonSelection } from './landmark-comparison.ts';
import type { Point } from './face-analysis.ts';
import { summarizeFaces } from './face-analysis.ts';

interface Observation {
  schemaVersion: 1;
  kind: 'face_observation';
  engine: string;
  modelSha256: string;
  delegate: 'CPU' | 'GPU';
  faceCount: 1;
  image: { width: number; height: number };
  landmarks: [Point[]];
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateObservation(value: unknown): Observation {
  if (!object(value) || value.schemaVersion !== 1 || value.kind !== 'face_observation' ||
    value.faceCount !== 1 || !Array.isArray(value.landmarks) || value.landmarks.length !== 1 ||
    !Array.isArray(value.landmarks[0]) || value.landmarks[0].some(p => !object(p)) ||
    !object(value.image) || typeof value.engine !== 'string' || !value.engine.trim() ||
    typeof value.modelSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.modelSha256) ||
    !['CPU', 'GPU'].includes(String(value.delegate))) throw Error('Expected one-face observation v1 with analysis provenance');
  const result = value as unknown as Observation;
  summarizeFaces(result.landmarks, result.image.width, result.image.height);
  return result;
}

export function validateSelection(value: unknown): ComparisonSelection {
  if (!object(value) || Object.keys(value).length !== 2 ||
    !Array.isArray(value.alignmentIndices) || !Array.isArray(value.evaluationIndices)) {
    throw Error('Expected alignmentIndices and evaluationIndices');
  }
  // The comparison validates the index values and disjointness before use.
  return { alignmentIndices: [...value.alignmentIndices], evaluationIndices: [...value.evaluationIndices] };
}

/** Provenance equality is necessary for comparison, not proof of capture compatibility. */
export function compareObservations(reference: unknown, sample: unknown, selection?: ComparisonSelection) {
  const r = validateObservation(reference), s = validateObservation(sample);
  if (r.modelSha256 !== s.modelSha256 || r.engine !== s.engine || r.delegate !== s.delegate) {
    throw Error('Incompatible analysis provenance');
  }
  return compareLandmarks(r.landmarks[0], s.landmarks[0], r.image, s.image, selection);
}
