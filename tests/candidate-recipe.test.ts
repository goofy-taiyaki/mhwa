import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCandidateRecipe } from '../src/candidate-recipe.ts';
import { emptyRecipe, inferenceLabel, parseRecipe, serializeRecipe, updateValue, validateRecipe } from '../src/recipe.ts';
import { PARAMETERS } from '../src/layout.ts';

function observation(span: number) {
  const points = Array.from({length:478}, () => ({x:.5,y:.5,z:0}));
  [[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.5-span/2,.5],[.5+span/2,.5]].forEach(([x,y],i) => {points[i]={x,y,z:0}});
  return {schemaVersion:1,kind:'face_observation',engine:'synthetic',modelSha256:'a'.repeat(64),delegate:'CPU',faceCount:1,image:{width:1000,height:1000},landmarks:[points]};
}
function catalog() {
  return {schemaVersion:1,kind:'measured_candidate_catalog',gameBuild:'Synthetic test only',baseEvidence:'Synthetic base, not a game preset',captureConditions:'Synthetic front view',limitations:'Not a measured game result',
    features:{alignmentIndices:[0,1,2,3],pairs:[[4,5]]}, candidates:[
      {id:'small',settings:{'口の大きさ':0},observations:[observation(.19),observation(.21)]},
      {id:'large',settings:{'口の大きさ':20},observations:[observation(.39),observation(.41)]},
    ]};
}
const makeRecipe = () => createCandidateRecipe(catalog(), observation(.4), 'b'.repeat(64), '2026-10-08T10:00:00Z');

test('image-derived selection becomes a partial recipe with exact row mapping, provenance and no copied landmarks', () => {
  const recipe = makeRecipe();
  assert.equal(recipe.schemaVersion, 2);
  assert.equal(recipe.inference, 'experimental_candidates');
  assert.deepEqual(recipe.entries['p2.c3.r4'], {value:20,origin:'candidate',applicability:'unknown'});
  assert.equal(Object.values(recipe.entries).filter(e => e.value === null).length, PARAMETERS.length-1);
  assert.deepEqual(parseRecipe(serializeRecipe(recipe)), recipe);
  if (recipe.schemaVersion !== 2) throw Error('Wrong schema');
  assert.equal(recipe.proposal.suggestions[0].candidateId, 'large');
  assert.equal(recipe.proposal.validation, 'unvalidated');
  assert.equal(recipe.proposal.scope.baseEvidence, catalog().baseEvidence);
  assert.ok(!serializeRecipe(recipe).includes('landmarks'));
  assert.ok(!serializeRecipe(recipe).includes('observations'));
});

test('partial recipe rejects forged correspondence, missing provenance, success status, ranges and changed scope', () => {
  for (const mutate of [
    (r:any) => r.proposal.validation='validated',
    (r:any) => r.proposal.completeness='full',
    (r:any) => r.inference='success',
    (r:any) => delete r.proposal.catalogSha256,
    (r:any) => r.proposal.catalogSha256='invalid',
    (r:any) => r.proposal.suggestions[0].rowId='p2.c1.r7',
    (r:any) => r.proposal.suggestions[0].category='目もと',
    (r:any) => r.proposal.suggestions.push(r.proposal.suggestions[0]),
    (r:any) => r.proposal.suggestions[0].value=21,
    (r:any) => r.proposal.suggestions[0].value=.5,
    (r:any) => r.entries['p2.c3.r4'].value=10,
    (r:any) => r.entries['p2.c3.r4'].applicability='active',
    (r:any) => r.entries['p1.c1.r1']={value:1,origin:'candidate',applicability:'unknown'},
    (r:any) => r.gameVersion='Other build',
    (r:any) => r.base='Other base',
    (r:any) => r.proposal.extra='unknown',
  ]) { const recipe=makeRecipe();mutate(recipe);assert.throws(() => validateRecipe(recipe)); }
  const old=emptyRecipe();old.entries['p2.c3.r4']={value:20,origin:'candidate',applicability:'unknown'};
  assert.throws(() => validateRecipe(old));
});

test('manual edits remove candidate status while preserving original proposal history and other unknown fields', () => {
  const original=makeRecipe();
  const edited=updateValue(original,'p2.c3.r4','12');
  assert.equal(edited.entries['p2.c3.r4'].origin,'manual');
  assert.equal(edited.entries['p2.c3.r4'].value,12);
  assert.equal(original.entries['p2.c3.r4'].value,20);
  assert.equal(edited.entries['p2.c1.r7'].value,null);
  assert.match(inferenceLabel(edited),/候補 0 \/ 元の提案 1/);
  assert.deepEqual(parseRecipe(serializeRecipe(edited)),edited);
  const cleared=updateValue(edited,'p2.c3.r4','');
  assert.equal(cleared.entries['p2.c3.r4'].origin,'unknown');
  if(cleared.schemaVersion!==2)throw Error('Missing history');
  assert.equal(cleared.proposal.suggestions[0].value,20);
});

test('export refuses unmapped settings and cannot silently coerce or clamp selected UI values', () => {
  const unsupported=catalog();
  unsupported.candidates.forEach((c:any)=>{c.settings={'大きさ':Object.values(c.settings)[0]}});
  assert.throws(()=>createCandidateRecipe(unsupported,observation(.4),'b'.repeat(64),'2026-10-08T10:00:00Z'),/未確認/);
  const outOfRange=catalog();outOfRange.candidates[1].settings['口の大きさ']=21;
  assert.throws(()=>createCandidateRecipe(outOfRange,observation(.4),'b'.repeat(64),'2026-10-08T10:00:00Z'),/UI値/);
});
