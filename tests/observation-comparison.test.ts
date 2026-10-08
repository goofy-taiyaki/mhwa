import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareObservations, validateSelection } from '../src/observation-comparison.ts';
const observation = () => ({schemaVersion:1,kind:'face_observation',engine:'synthetic-test',
  modelSha256:'a'.repeat(64),delegate:'CPU',faceCount:1,image:{width:1200,height:800},
  landmarks:[Array.from({length:478},(_,i)=>({x:.5+.2*Math.cos(i*.13),y:.5+.3*Math.sin(i*.13),z:0}))]});

test('requires complete matching analysis provenance, including absent fields in both inputs',()=>{
  const source=observation();
  assert.ok(compareObservations(source,source).evaluationRmsPx<1e-9);
  for (const field of ['engine','modelSha256','delegate'] as const) {
    const missing: Record<string,unknown>={...source}; delete missing[field];
    assert.throws(()=>compareObservations(missing,missing));
    assert.throws(()=>compareObservations(source,{...source,[field]:'different'}));
  }
  assert.throws(()=>compareObservations(source,{...source,delegate:'GPU'}));
  assert.throws(()=>compareObservations(source,{...source,modelSha256:'b'.repeat(64)}));
});

test('rejects malformed and multi-face observations before comparison',()=>{
  const source=observation();
  for (const invalid of [null,[],{}, {...source,faceCount:2}, {...source,landmarks:[[]]},
    {...source,landmarks:[Array(478).fill(null)]}, {...source,image:{width:0,height:2}}]) {
    assert.throws(()=>compareObservations(source,invalid));
  }
});

test('selection JSON is explicit and preserves independently evaluated indices',()=>{
  const source=observation();
  const selection=validateSelection({alignmentIndices:[0,12,24],evaluationIndices:[100]});
  assert.equal(compareObservations(source,source,selection).fitMode,'held_out_points');
  for (const invalid of [null,{}, {alignmentIndices:[0,1,2]},
    {alignmentIndices:[0,1,2],evaluationIndices:[3],unknown:true}]) assert.throws(()=>validateSelection(invalid));
  assert.throws(()=>compareObservations(source,source,validateSelection({alignmentIndices:[0,1,2],evaluationIndices:['3']})));
});
