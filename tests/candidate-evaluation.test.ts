import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
test('evaluation verifies file evidence, refuses sample leakage and preserves existing outputs',()=>{
 const parent=resolve(tmpdir()),dir=mkdtempSync(join(parent,'mhwa-candidates-'));
 try {
  function sample(id:string,width:number) {
   // Artificial opaque input bytes: this tests evidence linkage, not image decoding.
   const image=Buffer.from('synthetic evidence '+id),points=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
   [[.2,.2],[.8,.2],[.2,.8],[.8,.8],[.5-width/2,.5],[.5+width/2,.5]].forEach(([x,y],i)=>{points[i]={x,y,z:0}});
   const ob=Buffer.from(JSON.stringify({schemaVersion:1,kind:'face_observation',faceCount:1,engine:'test',delegate:'CPU',modelSha256:'a'.repeat(64),image:{width:1000,height:800},landmarks:[points],evidence:{sourceSha256:hash(image)}}));
   writeFileSync(join(dir,id+'.img'),image);writeFileSync(join(dir,id+'.json'),ob);
   return {id,image:{path:id+'.img',sha256:hash(image)},observation:{path:id+'.json',sha256:hash(ob)}};
  }
  const manifest={schemaVersion:1,kind:'candidate_search_experiment',gameBuild:'synthetic',baseEvidence:'synthetic',captureConditions:'synthetic',evaluationLimitations:'synthetic test only',baselineCandidateId:'small',features:{alignmentIndices:[0,1,2,3],pairs:[[4,5]]},candidates:[
   {id:'small',settings:{width:10},samples:[sample('s1',.19),sample('s2',.21)]},
   {id:'large',settings:{width:15},samples:[sample('l1',.29),sample('l2',.31)]}
  ],evaluation:[{expectedCandidateId:'large',sample:sample('eval',.3)}]};
  const script=fileURLToPath(new URL('../scripts/evaluate-candidates.ts',import.meta.url));
  let count=0;
  function run(m:unknown,out?:string) {
   const path=join(dir,`manifest-${count++}.json`);writeFileSync(path,JSON.stringify(m));
   const output=out??join(dir,`result-${count}.json`);
   const result=spawnSync(process.execPath,['--experimental-strip-types',script,path,output],{encoding:'utf8'});
   assert.ifError(result.error);return {...result,output};
  }
  const valid=run(manifest);assert.equal(valid.status,0,valid.stderr);
  const report=JSON.parse(readFileSync(valid.output,'utf8'));
  assert.equal(report.firstMatchesExpected,1);assert.equal(report.baseline.firstMatchesExpected,0);
  assert.equal(report.settingErrors[0].searchMeanAbsoluteError,0);assert.equal(report.settingErrors[0].baselineMeanAbsoluteError,5);
  const original=readFileSync(valid.output);assert.notEqual(run(manifest,valid.output).status,0);assert.deepEqual(readFileSync(valid.output),original);
  const leak=structuredClone(manifest);leak.evaluation[0].sample={...leak.candidates[1].samples[0],id:'renamed-copy'};
  assert.match(run(leak).stderr,/leakage/);
  const tampered=structuredClone(manifest);tampered.evaluation[0].sample.image.sha256='f'.repeat(64);
  assert.match(run(tampered).stderr,/hash mismatch/);
  const incompatible=structuredClone(manifest);incompatible.baselineCandidateId='missing';assert.match(run(incompatible).stderr,/baseline/);
 } finally {
  if(dirname(resolve(dir))!==parent||!basename(dir).startsWith('mhwa-candidates-')) throw Error('Unexpected temporary directory');
  rmSync(dir,{recursive:true,force:true});
 }
});
