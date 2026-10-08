import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { summarizeFaces } from './face-analysis.ts';
import { parseCompactCatalog } from './compact-catalog.ts';
import { createCandidateRecipe } from './candidate-recipe.ts';
const MODEL_SHA='64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
// The SDK flushes diagnostic logs on close. This worker only permits same-origin
// asset reads; neither diagnostic POSTs nor cross-origin redirects can leave it.
const nativeFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input),self.location.href);
  const method=init?.method??(input instanceof Request?input.method:'GET');
  if(url.origin!==self.location.origin||method.toUpperCase()!=='GET')return Promise.reject(new TypeError('Worker network policy: local asset reads only'));
  return nativeFetch(input,{...init,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});
};
const send=(message:unknown)=>self.postMessage(message);
const hash=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function asset(url:URL,max:number){
  const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!r.ok)throw Error('解析データを読み込めませんでした。時間をおいて再試行してください。');
  const b=await r.arrayBuffer();if(b.byteLength>max)throw Error('解析データのサイズが不正です。');return b;
}
self.onmessage=async(event:MessageEvent<{bitmap:ImageBitmap;assetRoot:string}>)=>{
  const {bitmap,assetRoot}=event.data;let detector:FaceLandmarker|null=null;
  try{
    const root=new URL(assetRoot);
    if(root.origin!==self.location.origin||!root.pathname.endsWith('/inference/'))throw Error('解析データの場所が不正です。');
    send({type:'progress',text:'解析データを読み込んでいます…'});
    const manifest=JSON.parse(new TextDecoder().decode(await asset(new URL('manifest.json',root),10000)));
    if(manifest.schemaVersion!==1||manifest.modelSha256!==MODEL_SHA||typeof manifest.catalogSha256!=='string'||!/^[a-f0-9]{64}$/.test(manifest.catalogSha256))throw Error('解析データの版を確認できません。');
    const [model,rawCatalog]=await Promise.all([asset(new URL('face.task',root),5_000_000),asset(new URL('catalog.json',root),500_000)]);
    if(await hash(model)!==MODEL_SHA||await hash(rawCatalog)!==manifest.catalogSha256)throw Error('解析データの整合性を確認できません。');
    const catalog=parseCompactCatalog(JSON.parse(new TextDecoder().decode(rawCatalog)));
    const files=await FilesetResolver.forVisionTasks(new URL('wasm',root).href,true);
    detector=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetBuffer:new Uint8Array(model),delegate:'CPU'},runningMode:'IMAGE',numFaces:2,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
    send({type:'progress',text:'顔の特徴から設定候補を探しています…'});
    const detected=detector.detect(bitmap),summary=summarizeFaces(detected.faceLandmarks,bitmap.width,bitmap.height);
    if(summary.status==='no_face')throw Error('顔を検出できませんでした。顔がはっきり写った画像を選んでください。');
    if(summary.status==='multiple_faces')throw Error('顔が複数あります。1人だけが写った画像を選んでください。');
    const observation={schemaVersion:1,kind:'face_observation',engine:'@mediapipe/tasks-vision@1.1.0',modelSha256:MODEL_SHA,delegate:'CPU',faceCount:1,image:{width:bitmap.width,height:bitmap.height},landmarks:detected.faceLandmarks};
    const recipe=createCandidateRecipe(catalog,observation,manifest.catalogSha256,new Date().toISOString());
    send({type:'result',recipe});
  }catch(error){send({type:'error',text:error instanceof Error?error.message:'画像を解析できませんでした。'});}
  finally{bitmap.close();detector?.close();}
};
