import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFaces } from '../src/face-analysis.ts';
const points = Array.from({length:478}, (_, i) => ({x: i%2 ? .75 : .25, y: i%3 ? .6 : .4, z: 0}));
test('no/multiple faces never produce single-face measurements', () => {
  assert.equal(summarizeFaces([], 100, 100).status, 'no_face');
  assert.equal(summarizeFaces([points,points], 100, 100).measurements, null);
});
test('measurement accounts for nonsquare image pixels and never certifies quality', () => {
  const result = summarizeFaces([points], 200, 100);
  assert.equal(result.status, 'single_face_unvalidated');
  assert.equal(result.measurements?.boundsAspect, 5);
  assert.equal(result.measurements?.outOfFramePoints, 0);
});
test('reject corrupt and degenerate output', () => {
  assert.throws(() => summarizeFaces([points.slice(1)], 100, 100));
  assert.throws(() => summarizeFaces([[...points.slice(1),{x:NaN,y:0,z:0}]], 100, 100));
  assert.throws(() => summarizeFaces([Array(478).fill({x:0,y:0,z:0})], 100, 100));
});
