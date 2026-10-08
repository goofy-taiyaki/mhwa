import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('crop sends exactly the selected pixels to inference; cancel, full reset and replacement preserve the recipe',async({page,context,baseURL})=>{
  const outgoing:string[]=[],errors:string[]=[];
  context.on('request',r=>{if(/^https?:/.test(r.url())&&(new URL(r.url()).origin!==new URL(baseURL!).origin||r.method()!=='GET'))outgoing.push(r.url());});
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  // Inspect the bitmap at the worker boundary, without pretending to test face accuracy.
  await page.addInitScript(()=>{
    (window as any).cropBitmaps=[];
    (window as any).Worker=class {
      onmessage:any; onerror:any;
      postMessage(data:any){
        const bitmap=data.bitmap,canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
        const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);
        (window as any).cropBitmaps.push({width:bitmap.width,height:bitmap.height,first:Array.from(ctx.getImageData(0,0,1,1).data),last:Array.from(ctx.getImageData(bitmap.width-1,bitmap.height-1,1,1).data)});
        bitmap.close();queueMicrotask(()=>this.onmessage?.({data:{type:'error',text:'Synthetic worker boundary completed'}}));
      }
      terminate(){}
    };
  });
  await page.goto('/');
  const png=Buffer.from(await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=400;c.height=200;const x=c.getContext('2d')!;
    x.fillStyle='#f00';x.fillRect(0,0,400,200);x.fillStyle='#00f';x.fillRect(100,50,200,100);return c.toDataURL().split(',')[1];
  }),'base64');
  await page.locator('#editing').check();await page.locator('[data-field="p1.c1.r1"]').fill('7');await page.locator('[data-field="p1.c1.r1"]').press('Tab');
  await page.locator('#image').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});
  await page.locator('#crop-image').click();
  const box=(await page.locator('#crop-canvas').boundingBox())!;
  await page.mouse.move(box.x+box.width*.75,box.y+box.height*.75);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.25,box.y+box.height*.25,{steps:5});await page.mouse.up();
  await expect(page.locator('#crop-x')).toHaveValue('100');await expect(page.locator('#crop-y')).toHaveValue('50');
  await expect(page.locator('#crop-width')).toHaveValue('200');await expect(page.locator('#crop-height')).toHaveValue('100');
  await page.locator('#crop-width').fill('200');await page.locator('#crop-height').fill('100');await page.locator('#crop-x').fill('100');await page.locator('#crop-y').fill('50');
  await page.locator('#crop-apply').click();await expect(page.locator('dialog')).not.toBeVisible();
  await expect(page.locator('#image-info')).toContainText('200 × 100 px · 切抜き範囲');
  await page.locator('#infer').click();await expect(page.locator('#inference-status')).toContainText('Synthetic worker');
  expect(await page.evaluate(()=>(window as any).cropBitmaps)).toEqual([{width:200,height:100,first:[0,0,255,255],last:[0,0,255,255]}]);
  await expect(page.locator('[data-field="p1.c1.r1"]')).toHaveValue('7');
  await page.locator('#crop-image').click();await page.locator('#crop-x').fill('399');await expect(page.locator('#crop-apply')).toBeDisabled();
  await page.locator('#crop-cancel').click();await expect(page.locator('#image-info')).toContainText('200 × 100');
  const waiting=page.waitForEvent('download');await page.locator('#export').click();const json=JSON.parse(await readFile((await(await waiting).path())!,'utf8'));
  expect(json.entries['p1.c1.r1'].value).toBe(7);expect(JSON.stringify(json)).not.toMatch(/data:image|cropBitmaps|synthetic.png/);
  await page.locator('#crop-image').click();await page.locator('#crop-full').click();await page.locator('#crop-apply').click();
  await expect(page.locator('#image-info')).toContainText('400 × 200 px · 画像全体');
  await page.locator('#infer').click();await expect(page.locator('#inference-status')).toContainText('Synthetic worker');
  expect(await page.evaluate(()=>(window as any).cropBitmaps[1])).toEqual({width:400,height:200,first:[255,0,0,255],last:[255,0,0,255]});
  await page.setViewportSize({width:390,height:844});await page.locator('#crop-image').click();
  expect(await page.locator('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);
  await page.screenshot({path:'../outputs/crop-mobile.png'});
  await page.locator('#crop-x').focus();await page.keyboard.press('Escape');await expect(page.locator('dialog')).not.toBeVisible();
  await page.locator('#clear-image').click();await expect(page.locator('#crop-image')).toBeHidden();
  await page.locator('#image').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:png});await page.locator('#crop-image').click();
  await expect(page.locator('#crop-x')).toHaveValue('0');await expect(page.locator('#crop-width')).toHaveValue('400');
  await page.locator('#crop-cancel').click();expect(outgoing).toEqual([]);expect(errors).toEqual([]);
});
