import {test,expect} from '@playwright/test';

test('production inference rejects a blank image without changing the recipe or sending data',async({page,context,baseURL})=>{
 const external:string[]=[],writes:string[]=[];
 context.on('request',r=>{if(/^https?:/.test(r.url())){if(new URL(r.url()).origin!==new URL(baseURL!).origin)external.push(r.url());if(r.method()!=='GET')writes.push(r.url());}});
 await page.goto('/');await expect(page.locator('#summary')).toContainText('0 /');
 await page.locator('#editing').check();const field=page.locator('[data-field="p1.c1.r1"]');await field.fill('7');await field.press('Tab');
 const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=200;const x=c.getContext('2d')!;x.fillStyle='#ddd';x.fillRect(0,0,200,200);return c.toDataURL().split(',')[1];}),'base64');
 await page.locator('#image').setInputFiles({name:'blank.png',mimeType:'image/png',buffer:png});await expect(page.locator('#infer')).toBeEnabled();
 page.on('dialog',d=>d.accept());await page.locator('#infer').click();await expect(page.locator('#inference-status')).toContainText('顔を検出できませんでした',{timeout:60000});
 await expect(field).toHaveValue('7');expect(external).toEqual([]);expect(writes).toEqual([]);
 await page.getByRole('link',{name:'ライセンスと画像の扱い'}).click();await expect(page.getByRole('heading',{name:'ライセンスと画像の扱い'})).toBeVisible();
 await page.getByRole('link',{name:'Apache License 2.0 本文'}).click();await expect(page.locator('body')).toContainText('TERMS AND CONDITIONS');
});
