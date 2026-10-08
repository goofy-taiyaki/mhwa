import { validateRecipe } from './recipe.ts';
import type { Recipe } from './recipe.ts';
/** One disposable worker per request, so cancellation also interrupts WASM work. */
export function inferImage(bitmap:ImageBitmap,assetRoot:string,signal:AbortSignal,progress:(text:string)=>void):Promise<Recipe>{
  return new Promise((resolve,reject)=>{
    if(signal.aborted){bitmap.close();reject(new Error('解析を中止しました。'));return;}
    let worker:Worker;
    try{worker=new Worker(new URL('./inference-worker.ts',import.meta.url),{type:'module'});}catch(e){bitmap.close();reject(e);return;}
    const finish=(error?:Error,result?:Recipe)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();if(error)reject(error);else resolve(result!);};
    const abort=()=>finish(new Error('解析を中止しました。'));
    const timer=setTimeout(()=>finish(new Error('解析が時間内に完了しませんでした。再試行してください。')),60000);
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror=event=>{event.preventDefault();finish(new Error('このブラウザーで解析を開始できませんでした。'));};
    worker.onmessage=event=>{
      const data=event.data;
      if(data?.type==='progress'&&typeof data.text==='string')progress(data.text);
      else if(data?.type==='error')finish(new Error(typeof data.text==='string'?data.text:'解析に失敗しました。'));
      else if(data?.type==='result'){try{const r=validateRecipe(data.recipe);if(r.schemaVersion!==2)throw Error('解析結果が不正です。');finish(undefined,r);}catch(e){finish(e as Error);}}
    };
    try{worker.postMessage({bitmap,assetRoot},[bitmap]);}catch(e){bitmap.close();finish(e as Error);}
  });
}
