import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interpolateMeasuredControl} from '../src/measured-curve-search.ts';
import type {MeasuredCandidate} from '../src/measured-candidate-search.ts';
const spec={alignmentIndices:[0,1,2,3],pairs:[[4,5],[6,7]] as [number,number][]};
function observation(x:number,y:number) {
 const points=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
 [[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.1,.5],[.1+x,.5],[.1,.6],[.1+y,.6]].forEach(([x,y],i)=>{points[i]={x,y,z:0}});
 return {schemaVersion:1,kind:'face_observation',engine:'synthetic',modelSha256:'a'.repeat(64),delegate:'CPU',faceCount:1,image:{width:1000,height:1000},landmarks:[points]};
}
const candidates=():MeasuredCandidate[]=>[[0,.1,.1],[10,.3,.1],[20,.3,.5]].map(([v,x,y])=>({id:`v${v}`,settings:{size:v},observations:[observation(x,y),observation(x,y)]}));
test('projects onto the appropriate segment of a bent response and preserves ordered UI rounding',()=>{
 const source=candidates(),before=JSON.stringify(source);
 const first=interpolateMeasuredControl(observation(.2,.1),source,spec,1);
 const second=interpolateMeasuredControl(observation(.3,.3),source,spec,1);
 assert.ok(Math.abs(first.value-5)<1e-10);assert.equal(first.roundedValue,5);
 assert.ok(Math.abs(second.value-15)<1e-10);assert.equal(second.roundedValue,15);
 assert.deepEqual(second.measuredRange,[0,20]);assert.equal(second.status,'experimental_interpolation');
 assert.equal(second.segments[0].from,10);assert.equal(JSON.stringify(source),before);
 assert.equal(interpolateMeasuredControl(observation(.228,.1),source,spec,1).roundedValue,6);
});
test('outlying geometry never extrapolates and remains experimental even with an endpoint result',()=>{
 const r=interpolateMeasuredControl(observation(.3,.9),candidates(),spec,1);
 assert.equal(r.value,20);assert.equal(r.roundedValue,20);assert.ok(r.segments[0].rawT>1);
 assert.ok(r.segments[0].residual>0);assert.equal(r.status,'experimental_interpolation');
});
test('refuses degenerate responses, inconsistent measurement provenance, joint controls and invalid steps',()=>{
 const flat=candidates();flat[1].observations=flat[0].observations;
 assert.throws(()=>interpolateMeasuredControl(observation(.2,.1),flat,spec,1),/Degenerate/);
 const bad=candidates();(bad[2].observations[0] as any).modelSha256='b'.repeat(64);
 assert.throws(()=>interpolateMeasuredControl(observation(.2,.1),bad,spec,1),/provenance/);
 const joint=candidates();joint.forEach(c=>c.settings.extra=10);
 assert.throws(()=>interpolateMeasuredControl(observation(.2,.1),joint,spec,1),/one setting/);
 for(const step of [0,-1,NaN,Infinity,3])assert.throws(()=>interpolateMeasuredControl(observation(.2,.1),candidates(),spec,step));
 assert.throws(()=>interpolateMeasuredControl(observation(.2,.1),candidates().slice(0,2),spec,1),/three/);
});
