import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cropFromDrag, validateCrop } from '../src/image-crop.ts';

test('crop bounds reject fractional, empty, nonfinite and outside selections', () => {
  assert.deepEqual(validateCrop({x:99,y:49,width:1,height:1},100,50),{x:99,y:49,width:1,height:1});
  for (const rect of [
    {x:-1,y:0,width:1,height:1},{x:0,y:0,width:0,height:1},{x:0,y:0,width:1,height:51},
    {x:99,y:0,width:2,height:1},{x:0.1,y:0,width:1,height:1},{x:NaN,y:0,width:1,height:1},
    {x:0,y:0,width:Infinity,height:1},
  ]) assert.throws(()=>validateCrop(rect,100,50));
});

test('reverse and beyond-boundary drags select the same source pixel edges', () => {
  assert.deepEqual(cropFromDrag([80,40],[20,10],100,50),{x:20,y:10,width:60,height:30});
  assert.deepEqual(cropFromDrag([-20,-10],[120,80],100,50),{x:0,y:0,width:100,height:50});
  assert.throws(()=>cropFromDrag([20,20],[20,30],100,50));
  assert.throws(()=>cropFromDrag([NaN,20],[30,30],100,50));
});
