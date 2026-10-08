import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseCompactCatalog} from '../src/compact-catalog.ts';
const root=new URL('../',import.meta.url),out=new URL('public/inference/',root);
const hash=b=>createHash('sha256').update(b).digest('hex');
const expectedModel='64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const source='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const catalogBytes=await readFile(new URL('catalogs/experimental.json',root));
const catalog=parseCompactCatalog(JSON.parse(catalogBytes.toString('utf8')));
if(catalog.modelSha256!==expectedModel)throw Error('Unexpected catalog model');
let model;
try{const cached=await readFile(new URL('face.task',out));if(hash(cached)===expectedModel)model=cached;}catch{}
if(!model){const r=await fetch(source,{signal:AbortSignal.timeout(60000),redirect:'error'});if(!r.ok)throw Error('Model download failed');model=Buffer.from(await r.arrayBuffer());}
if(model.length!==3758596||hash(model)!==expectedModel)throw Error('Model integrity mismatch');
await mkdir(new URL('wasm/',out),{recursive:true});
await writeFile(new URL('face.task',out),model);await writeFile(new URL('catalog.json',out),catalogBytes);
for(const name of ['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm','vision_wasm_module_internal.js','vision_wasm_module_internal.wasm'])await copyFile(new URL('node_modules/@mediapipe/tasks-vision/wasm/'+name,root),new URL('wasm/'+name,out));
await writeFile(new URL('manifest.json',out),JSON.stringify({schemaVersion:1,catalogSha256:hash(catalogBytes),modelSha256:expectedModel},null,2));
console.log('Verified model, compact measurement catalog and local WASM assets prepared.');
