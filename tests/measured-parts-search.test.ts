import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankMeasuredParts,parseMeasuredPartsCatalog} from '../src/measured-parts-search.ts';
import type {MeasuredPart} from '../src/measured-parts-search.ts';
function observation(mouth:number,eye:number) {
  const points=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
  [[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.5-mouth/2,.7],[.5+mouth/2,.7],[.2,.3],[.2+eye,.3]].forEach(([x,y],i)=>{points[i]={x,y,z:0}});
  return {schemaVersion:1,kind:'face_observation',engine:'synthetic',modelSha256:'a'.repeat(64),delegate:'CPU',faceCount:1,image:{width:1000,height:1000},landmarks:[points]};
}
const parts=():MeasuredPart[]=>[
  {id:'mouth',label:'mouth',features:{alignmentIndices:[0,1,2,3],pairs:[[4,5]]},candidates:[
    {id:'small',settings:{mouth:0},observations:[observation(.19,.2),observation(.21,.2)]},
    {id:'large',settings:{mouth:20},observations:[observation(.39,.2),observation(.41,.2)]}]},
  {id:'eye',label:'eye',features:{alignmentIndices:[0,1,2,3],pairs:[[6,7]]},candidates:[
    {id:'small',settings:{eye:0},observations:[observation(.3,.09),observation(.3,.11)]},
    {id:'large',settings:{eye:20},observations:[observation(.3,.29),observation(.3,.31)]}]}
];
test('composes individual measured settings while marking unmeasured combinations unvalidated',()=>{
  const p=parts(),before=JSON.stringify(p),r=rankMeasuredParts(observation(.4,.1),p);
  assert.deepEqual(r.proposedSettings,{mouth:20,eye:0});
  assert.equal(r.combinationStatus,'not_validated');
  assert.equal(r.status,'exploratory_part_ranking');
  assert.equal(JSON.stringify(p),before);
  r.proposedSettings.mouth=7;r.parts[0].result.ranking[0].settings.mouth=8;
  assert.equal(p[0].candidates[1].settings.mouth,20);
});
test('preserves part-specific geometry and rejects conflicts and incompatible measurements',()=>{
  assert.deepEqual(rankMeasuredParts(observation(.2,.3),parts()).proposedSettings,{mouth:0,eye:20});
  const conflict=parts();conflict[1].candidates.forEach(c=>{c.settings={mouth:c.settings.eye}});
  assert.throws(()=>rankMeasuredParts(observation(.2,.3),conflict),/overlap/);
  const duplicate=parts();duplicate[1].id='mouth';
  assert.throws(()=>rankMeasuredParts(observation(.2,.3),duplicate),/unique/);
  const incompatible=parts();(incompatible[1].candidates[0].observations[0] as any).modelSha256='b'.repeat(64);
  assert.throws(()=>rankMeasuredParts(observation(.2,.3),incompatible),/provenance/);
  for(const invalid of [[],parts().slice(0,1),Array.from({length:33},()=>parts()[0])]) assert.throws(()=>rankMeasuredParts(observation(.2,.3),invalid));
});
test('unsupported extremes still produce only an unvalidated ranking, never new numeric values',()=>{
  const r=rankMeasuredParts(observation(.8,.001),parts());
  assert.deepEqual(r.proposedSettings,{mouth:20,eye:0});
  assert.equal(r.combinationStatus,'not_validated');
  assert.ok(r.parts.every(p=>p.result.ranking[0].distance>p.result.ranking[0].trainingSpreadMax));
});
test('import validates all parts and returns an owned copy',()=>{
  const catalog={schemaVersion:1,kind:'measured_parts_catalog',gameBuild:'test',baseEvidence:'synthetic',captureConditions:'synthetic',limitations:'synthetic',parts:parts()};
  const p=parseMeasuredPartsCatalog(catalog);p.parts[0].candidates[0].settings.mouth=15;
  assert.equal(catalog.parts[0].candidates[0].settings.mouth,0);
  for(const field of ['gameBuild','baseEvidence','captureConditions','limitations']) assert.throws(()=>parseMeasuredPartsCatalog({...catalog,[field]:''}));
  assert.throws(()=>parseMeasuredPartsCatalog({...catalog,parts:[{}]}));
  assert.throws(()=>parseMeasuredPartsCatalog({...catalog,kind:'other'}));
});
