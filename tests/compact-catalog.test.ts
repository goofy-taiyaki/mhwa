import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileCompactCatalog,parseCompactCatalog,rankCompactParts} from '../src/compact-catalog.ts';
import {rankMeasuredParts} from '../src/measured-parts-search.ts';
import {createCandidateRecipe} from '../src/candidate-recipe.ts';
function observation(span:number){
 const ps=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
 [[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.5-span/2,.5],[.5+span/2,.5]].forEach(([x,y],i)=>{ps[i]={x,y,z:0}});
 return {schemaVersion:1,kind:'face_observation',engine:'synthetic',modelSha256:'a'.repeat(64),delegate:'CPU',faceCount:1,image:{width:1000,height:1000},landmarks:[ps],evidence:{path:'PRIVATE_SOURCE_DO_NOT_COPY'}};
}
function source(){return {schemaVersion:1,kind:'measured_parts_catalog',gameBuild:'synthetic',baseEvidence:'synthetic',captureConditions:'synthetic',limitations:'No game measurement',parts:['口の大きさ','目の大きさ'].map((label,i)=>({id:String(i),label,features:{alignmentIndices:[0,1,2,3],pairs:[[4,5]] as [number,number][]},candidates:[0,10,20].map((v)=>({id:String(v),settings:{[label]:v},observations:[observation(.15+v/100),observation(.16+v/100)]}))}))};}
test('compact centroids preserve every candidate distance/order without retaining observations or extra fields',()=>{
 const raw=source(),compact=compileCompactCatalog(raw);
 assert.ok(!JSON.stringify(compact).match(/landmarks|observations|PRIVATE_SOURCE/));
 for(const span of [.01,.15,.19,.20,.25,.31,.50]){
  const a=rankMeasuredParts(observation(span),raw.parts),b=rankCompactParts(observation(span),compact);
  assert.deepEqual(b.proposedSettings,a.proposedSettings);
  a.parts.forEach((p,i)=>assert.deepEqual(b.parts[i].result.ranking,p.result.ranking));
 }
 const recipe=createCandidateRecipe(compact,observation(.31),'b'.repeat(64),'2026-10-08T10:00:00Z');
 assert.equal(recipe.schemaVersion,2);assert.equal(recipe.entries['p2.c3.r4'].origin,'candidate');
});
test('compact contract rejects stale engine/model, injected private data, invalid indexes and unsupported settings',()=>{
 const compact=compileCompactCatalog(source());
 for(const mutate of [
  (c:any)=>c.parts[0].candidates[0].observations=[observation(.2)],
  (c:any)=>c.parts[0].candidates[0].centroid=[NaN],
  (c:any)=>c.parts[0].features.pairs=[[0,5]],
  (c:any)=>c.parts[0].features.alignmentIndices=[0,1,900],
  (c:any)=>c.parts[0].candidates[0].settings={'口の大きさ':21},
  (c:any)=>c.parts[1]=c.parts[0],
 ]){const c=structuredClone(compact);mutate(c);assert.throws(()=>parseCompactCatalog(c));}
 assert.throws(()=>rankCompactParts({...observation(.2),modelSha256:'b'.repeat(64)},compact),/provenance/);
});
