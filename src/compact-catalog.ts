import { distanceFeatures, rankMeasuredCandidates } from './measured-candidate-search.ts';
import type { DistanceFeatureSpec } from './measured-candidate-search.ts';
import { parseMeasuredPartsCatalog } from './measured-parts-search.ts';
import { validateObservation } from './observation-comparison.ts';
import { proposalBinding } from './proposal-contract.ts';

export interface CompactCatalog {
  schemaVersion: 1;
  kind: 'compact_measured_parts';
  gameBuild: string; baseEvidence: string; captureConditions: string; limitations: string;
  engine: string; modelSha256: string; delegate: 'CPU' | 'GPU';
  parts: { id: string; label: string; features: DistanceFeatureSpec;
    candidates: { id: string; settings: Record<string, number>; sampleCount: number; centroid: number[]; trainingSpreadMax: number }[] }[];
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function exact(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!object(v) || Object.keys(v).length !== keys.length || !keys.every(k => Object.hasOwn(v,k))) throw Error('Invalid compact catalog structure');
}
const text = (v: unknown, max=4000) => typeof v === 'string' && !!v.trim() && v.length<=max && !/[\u0000-\u001f]/.test(v);
const index = (v: unknown): v is number => Number.isInteger(v) && Number(v)>=0 && Number(v)<478;
export function parseCompactCatalog(value: unknown): CompactCatalog {
  exact(value,['schemaVersion','kind','gameBuild','baseEvidence','captureConditions','limitations','engine','modelSha256','delegate','parts']);
  if(value.schemaVersion!==1 || value.kind!=='compact_measured_parts' ||
    ![value.gameBuild,value.baseEvidence,value.engine].every(v=>text(v,160)) || ![value.captureConditions,value.limitations].every(v=>text(v)) ||
    typeof value.modelSha256!=='string' || !/^[a-f0-9]{64}$/.test(value.modelSha256) || !['CPU','GPU'].includes(String(value.delegate)) ||
    !Array.isArray(value.parts) || value.parts.length<1 || value.parts.length>3) throw Error('Invalid compact catalog');
  const ids=new Set<string>(),settings=new Set<string>();
  for(const p of value.parts){
    exact(p,['id','label','features','candidates']); exact(p.features,['alignmentIndices','pairs']);
    if(!text(p.id,160)||!text(p.label,160)||ids.has(String(p.id)))throw Error('Invalid part'); ids.add(String(p.id));
    const {alignmentIndices:a,pairs}=p.features;
    if(!Array.isArray(a)||a.length<3||a.length>478||a.some(i=>!index(i))||new Set(a).size!==a.length||
      !Array.isArray(pairs)||!pairs.length||pairs.length>478||pairs.some(pair=>!Array.isArray(pair)||pair.length!==2||pair.some(i=>!index(i)||a.includes(i))||pair[0]===pair[1])||
      new Set(pairs.map(pair=>[...pair].sort((x,y)=>x-y).join(':'))).size!==pairs.length)throw Error('Invalid compact feature selection');
    if(!Array.isArray(p.candidates)||p.candidates.length<2||p.candidates.length>21)throw Error('Invalid candidates');
    const candidateIds=new Set<string>(),values=new Set<number>(); let label:string|undefined;
    for(const c of p.candidates){
      exact(c,['id','settings','sampleCount','centroid','trainingSpreadMax']);
      if(!text(c.id,160)||candidateIds.has(String(c.id))||!object(c.settings)||Object.keys(c.settings).length!==1)throw Error('Invalid compact candidate');
      candidateIds.add(String(c.id));
      const [key,v]=Object.entries(c.settings)[0]; proposalBinding(key);
      if((label&&label!==key)||typeof v!=='number'||!Number.isInteger(v)||v<0||v>20||values.has(v))throw Error('Invalid candidate setting');
      label=key;values.add(v);
      if(!Number.isInteger(c.sampleCount)||Number(c.sampleCount)<2||!Array.isArray(c.centroid)||c.centroid.length!==pairs.length||c.centroid.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0)||
        typeof c.trainingSpreadMax!=='number'||!Number.isFinite(c.trainingSpreadMax)||c.trainingSpreadMax<0)throw Error('Invalid measured centroid');
    }
    if(settings.has(label!))throw Error('Overlapping part settings');settings.add(label!);
  }
  return structuredClone(value) as unknown as CompactCatalog;
}

/** Offline compression: retain only declared scope, feature specifications and measured centroids. */
export function compileCompactCatalog(raw: unknown): CompactCatalog {
  const c=parseMeasuredPartsCatalog(raw),ob=validateObservation(c.parts[0].candidates[0].observations[0]);
  const {gameBuild,baseEvidence,captureConditions,limitations}=c;
  return parseCompactCatalog({schemaVersion:1,kind:'compact_measured_parts',gameBuild,baseEvidence,captureConditions,limitations,
    engine:ob.engine,modelSha256:ob.modelSha256,delegate:ob.delegate,
    parts:c.parts.map(p=>({id:p.id,label:p.label,features:p.features,candidates:rankMeasuredCandidates(ob,p.candidates,p.features).ranking.map(
      ({id,settings,sampleCount,centroid,trainingSpreadMax})=>({id,settings,sampleCount,centroid,trainingSpreadMax}))}))});
}

export function rankCompactParts(input: unknown, raw: unknown) {
  const c=parseCompactCatalog(raw);
  const parts=c.parts.map(p=>{
    const q=distanceFeatures(input,p.features);
    if(q.engine!==c.engine||q.modelSha256!==c.modelSha256||q.delegate!==c.delegate)throw Error('Incompatible analysis provenance');
    const ranking=p.candidates.map(candidate=>({...candidate,distance:Math.hypot(...q.values.map((v,i)=>v-candidate.centroid[i]))/Math.sqrt(q.values.length)}))
      .sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
    return {id:p.id,label:p.label,result:{ranking}};
  });
  return {parts,proposedSettings:Object.fromEntries(parts.flatMap(p=>Object.entries(p.result.ranking[0].settings)))};
}
