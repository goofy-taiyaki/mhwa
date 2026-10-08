import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceFeatures, rankMeasuredCandidates, parseMeasuredCatalog } from '../src/measured-candidate-search.ts';
const spec={alignmentIndices:[0,1,2,3],pairs:[[4,5],[6,7]] as [number,number][]};
function observation(width:number) {
  const points=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
  [[.2,.2],[.8,.2],[.2,.8],[.8,.8],[.5-width/2,.5],[.5+width/2,.5],[.5-width/2,.6],[.5+width/2,.6]].forEach(([x,y],i)=>{points[i]={x,y,z:0}});
  return {schemaVersion:1,kind:'face_observation',engine:'test',modelSha256:'a'.repeat(64),delegate:'CPU',faceCount:1,image:{width:1000,height:800},landmarks:[points]};
}
const catalog=()=>[
  {id:'wide',settings:{width:15},observations:[observation(.29),observation(.31)]},
  {id:'narrow',settings:{width:10},observations:[observation(.19),observation(.21)]}
];
test('ranks measured values from width features without changing recipes or interpolating',()=>{
  const candidates=catalog(),before=JSON.stringify(candidates);
  const r=rankMeasuredCandidates(observation(.205),candidates,spec);
  assert.equal(r.status,'exploratory_ranking');
  assert.deepEqual(r.ranking.map(c=>c.settings.width),[10,15]);
  assert.ok(r.ranking[0].trainingSpreadMax>0);
  assert.equal(JSON.stringify(candidates),before);
  const mid=rankMeasuredCandidates(observation(.24),candidates,spec);
  assert.deepEqual(mid.ranking.map(c=>c.settings.width),[10,15]);
  r.ranking[0].settings.width=99;
  assert.equal(candidates[1].settings.width,10);
});
test('features and ranking survive translation rotation scale and image resolution change',()=>{
  const original=observation(.305), moved=structuredClone(original),angle=.3;
  moved.image={width:2200,height:1600};
  moved.landmarks[0]=original.landmarks[0].map(p=>({x:(1.4*(Math.cos(angle)*p.x*1000-Math.sin(angle)*p.y*800)+170)/2200,y:(1.4*(Math.sin(angle)*p.x*1000+Math.cos(angle)*p.y*800)+40)/1600,z:0}));
  const a=distanceFeatures(original,spec),b=distanceFeatures(moved,spec);
  a.values.forEach((v,i)=>assert.ok(Math.abs(v-b.values[i])<1e-12));
  assert.equal(rankMeasuredCandidates(moved,catalog(),spec).ranking[0].id,'wide');
});
test('returns an explicitly unvalidated ranking for unseen extremes and deterministic ties',()=>{
  const extreme=rankMeasuredCandidates(observation(.9),catalog(),spec);
  assert.equal(extreme.status,'exploratory_ranking');
  assert.ok(extreme.ranking[0].distance>extreme.ranking[0].trainingSpreadMax);
  const same=[{id:'b',settings:{width:15},observations:[observation(.2),observation(.2)]},{id:'a',settings:{width:10},observations:[observation(.2),observation(.2)]}];
  assert.deepEqual(rankMeasuredCandidates(observation(.2),same,spec).ranking.map(c=>c.id),['a','b']);
});
test('rejects incompatible observations and malformed feature geometry',()=>{
  const bad=observation(.2);bad.delegate='GPU';
  assert.throws(()=>rankMeasuredCandidates(bad,catalog(),spec),/provenance/);
  for(const pairs of [[],[[4,4]],[[4,5],[5,4]],[[4,478]],[[4,5.1]],[[0,5]]]) {
    assert.throws(()=>distanceFeatures(observation(.2),{...spec,pairs:pairs as [number,number][]}));
  }
  const missing=observation(.2);missing.landmarks[0].pop();
  assert.throws(()=>distanceFeatures(missing,spec));
  const nan=observation(.2);nan.landmarks[0][4].x=NaN;
  assert.throws(()=>distanceFeatures(nan,spec));
  assert.throws(()=>distanceFeatures(observation(.2),{...spec,alignmentIndices:[4,5,6]}));
});
test('rejects invalid catalog keys duplicate recipes IDs and missing repetitions',()=>{
  assert.throws(()=>rankMeasuredCandidates(observation(.2),catalog().slice(0,1),spec));
  for(const mutate of [
    c=>{c[1].id=c[0].id}, c=>{c[1].settings={width:15}},
    c=>{c[1].settings={other:10}},c=>{c[1].settings.width=NaN},
    c=>{c[1].observations=[]},c=>{c[1].settings={}}
  ] as ((c:ReturnType<typeof catalog>)=>void)[]) {
    const c=catalog();mutate(c);assert.throws(()=>rankMeasuredCandidates(observation(.2),c,spec));
  }
});
test('catalog import validates metadata and geometry and owns its data',()=>{
  const c={schemaVersion:1,kind:'measured_candidate_catalog',gameBuild:'test',baseEvidence:'test',captureConditions:'test',limitations:'synthetic',features:spec,candidates:catalog()};
  const parsed=parseMeasuredCatalog(c);parsed.candidates[0].settings.width=90;
  assert.equal(c.candidates[0].settings.width,15);
  for(const field of ['gameBuild','baseEvidence','captureConditions','limitations']) assert.throws(()=>parseMeasuredCatalog({...c,[field]:''}));
  assert.throws(()=>parseMeasuredCatalog({...c,features:{...spec,pairs:[[0,1]]}}));
  assert.throws(()=>parseMeasuredCatalog({...c,candidates:[{}]}));
});
