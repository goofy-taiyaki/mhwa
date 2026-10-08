import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {rankMeasuredCandidates,distanceFeatures} from '../src/measured-candidate-search.ts';
import type {MeasuredCandidate,DistanceFeatureSpec} from '../src/measured-candidate-search.ts';
const [manifestPath,outputPath,...extra]=process.argv.slice(2);
if(!manifestPath||!outputPath||extra.length) throw Error('Supply experiment manifest.json output.json');
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const manifestBytes=await readFile(manifestPath), manifest=JSON.parse(manifestBytes.toString('utf8'));
const base=dirname(resolve(manifestPath));
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const nonempty=(v:unknown)=>typeof v==='string'&&v.trim().length>0;
if(!object(manifest)||manifest.schemaVersion!==1||manifest.kind!=='candidate_search_experiment'||
 !nonempty(manifest.gameBuild)||!nonempty(manifest.baseEvidence)||!nonempty(manifest.captureConditions)||
 !nonempty(manifest.evaluationLimitations)||!nonempty(manifest.baselineCandidateId)||!object(manifest.features)||
 !Array.isArray(manifest.candidates)||!Array.isArray(manifest.evaluation)||!manifest.evaluation.length) throw Error('Invalid experiment manifest');
const spec=manifest.features as DistanceFeatureSpec;
const imageHashes=new Set<string>(), observationHashes=new Set<string>(), ids=new Set<string>();
const evidence:unknown[]=[];
async function loadSample(ref:unknown,split:string) {
 if(!object(ref)||!nonempty(ref.id)||ids.has(ref.id)||!object(ref.observation)||!object(ref.image)) throw Error('Invalid or duplicate sample ID');
 ids.add(ref.id);
 const readChecked=async (v:any)=>{
  if(!nonempty(v.path)||typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256)) throw Error('Missing file path or SHA-256');
  const bytes=await readFile(resolve(base,v.path));
  if(hash(bytes)!==v.sha256) throw Error('Evidence hash mismatch: '+v.path);
  return bytes;
 };
 const bytes=await readChecked(ref.observation),image=await readChecked(ref.image),ob=JSON.parse(bytes.toString('utf8'));
 if(ob?.evidence?.sourceSha256!==hash(image)) throw Error('Observation source image mismatch');
 if(imageHashes.has(hash(image))||observationHashes.has(hash(bytes))) throw Error('Repeated sample or train/evaluation leakage');
 imageHashes.add(hash(image));observationHashes.add(hash(bytes));
 distanceFeatures(ob,spec);
 evidence.push({id:ref.id,split,observation:ref.observation,image:ref.image});
 return ob;
}
const candidates:MeasuredCandidate[]=[];
for(const c of manifest.candidates) {
 if(!object(c)||!Array.isArray(c.samples)) throw Error('Invalid candidate manifest');
 const observations=[];
 for(const ref of c.samples) observations.push(await loadSample(ref,'training'));
 candidates.push({id:c.id,settings:c.settings,observations});
}
const cases=[];
const baseline=candidates.find(c=>c.id===manifest.baselineCandidateId);
if(!baseline) throw Error('Unknown baseline candidate');
for(const e of manifest.evaluation) {
 if(!object(e)||!nonempty(e.expectedCandidateId)||!candidates.some(c=>c.id===e.expectedCandidateId)) throw Error('Unknown expected candidate');
 const query=await loadSample(e.sample,'evaluation');
 const result=rankMeasuredCandidates(query,candidates,spec);
 cases.push({id:e.sample.id,expectedCandidateId:e.expectedCandidateId,firstCandidateId:result.ranking[0].id,
  firstMatchesExpected:result.ranking[0].id===e.expectedCandidateId,result});
}
const confusion=candidates.map(expected=>({expected:expected.id,selected:Object.fromEntries(candidates.map(selected=>[selected.id,cases.filter(c=>c.expectedCandidateId===expected.id&&c.firstCandidateId===selected.id).length]))}));
const settingErrors=Object.keys(candidates[0].settings).map(key=>({key,
 searchMeanAbsoluteError:cases.reduce((sum,c)=>sum+Math.abs(c.result.ranking[0].settings[key]-candidates.find(x=>x.id===c.expectedCandidateId)!.settings[key]),0)/cases.length,
 baselineMeanAbsoluteError:cases.reduce((sum,c)=>sum+Math.abs(baseline.settings[key]-candidates.find(x=>x.id===c.expectedCandidateId)!.settings[key]),0)/cases.length}));
const report={schemaVersion:1,kind:'candidate_search_evaluation',createdAt:new Date().toISOString(),manifestSha256:hash(manifestBytes),
 scope:{gameBuild:manifest.gameBuild,baseEvidence:manifest.baseEvidence,captureConditions:manifest.captureConditions},features:spec,
 trainingSamples:evidence.length-cases.length,evaluationSamples:cases.length,firstMatchesExpected:cases.filter(c=>c.firstMatchesExpected).length,
 baseline:{id:baseline.id,firstMatchesExpected:cases.filter(c=>c.expectedCandidateId===baseline.id).length},settingErrors,
 confusion,cases,evidence,limitations:[manifest.evaluationLimitations,'Disjoint file hashes do not prove independent acquisition or final-test isolation.',
 'Game/base/condition declarations require separate UI evidence review.','Only listed candidates tested; no generalization, calibration, full range, or complete recipe claim.']};
await writeFile(outputPath,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({trainingSamples:report.trainingSamples,evaluationSamples:report.evaluationSamples,firstMatchesExpected:report.firstMatchesExpected,baseline:report.baseline,settingErrors,confusion},null,2));
