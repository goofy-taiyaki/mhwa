export interface Point { x: number; y: number; z: number }
export type FaceObservation = ReturnType<typeof summarizeFaces>;
/** Measurement only: no game mapping and no calibrated pose/quality verdict. */
export function summarizeFaces(faces: Point[][], width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw Error('Invalid image dimensions');
  if (faces.length === 0) return { status: 'no_face' as const, faceCount: 0, measurements: null };
  if (faces.length > 1) return { status: 'multiple_faces' as const, faceCount: faces.length, measurements: null };
  const points = faces[0];
  if (points.length !== 478 || points.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) throw Error('Invalid landmark result');
  const xs = points.map(p => p.x * width), ys = points.map(p => p.y * height);
  const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
  if (right <= left || bottom <= top) throw Error('Degenerate landmark result');
  return { status: 'single_face_unvalidated' as const, faceCount: 1, measurements: {
    landmarkCount: points.length,
    boundsPx: { left, top, right, bottom },
    boundsAspect: (right - left) / (bottom - top),
    outOfFramePoints: points.filter(p => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1).length,
  } };
}
