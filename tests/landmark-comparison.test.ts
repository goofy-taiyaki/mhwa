import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareLandmarks } from '../src/landmark-comparison.ts';
const size={width:1200,height:800};
const points=Array.from({length:478},(_,i)=>({x:.5+.2*Math.cos(i*.13),y:.5+.3*Math.sin(i*.13),z:0}));
test('recovers translation rotation and uniform scale in pixel coordinates',()=>{
  const angle=.27,c=Math.cos(angle),s=Math.sin(angle);
  const moved=points.map(p=>({x:(1.3*(c*p.x*1200-s*p.y*800)+70)/2400,y:(1.3*(s*p.x*1200+c*p.y*800)-30)/1600,z:0}));
  const result=compareLandmarks(points,moved,size,{width:2400,height:1600});
  assert.ok(result.rawRmsPx>10);
  assert.ok(result.alignedRmsPx<1e-9);
  assert.ok(Math.abs(result.sampleToReference.scale-1/1.3)<1e-10);
  assert.ok(Math.abs(result.sampleToReference.rotationRadians+angle)<1e-10);
});
test('local deformation survives fitting and identity is zero',()=>{
  assert.ok(compareLandmarks(points,points,size,size).alignedRmsPx<1e-9);
  const moved=points.map((p,i)=>({...p,x:p.x+(i<20?.04:0)}));
  assert.ok(compareLandmarks(points,moved,size,size).alignedRmsPx>5);
});
test('rejects invalid dimensions missing points and nonfinite coordinates',()=>{
  assert.throws(()=>compareLandmarks(points,points.slice(1),size,size));
  assert.throws(()=>compareLandmarks(points,points,size,{width:0,height:1}));
  assert.throws(()=>compareLandmarks(points,points.map(p=>({...p,x:NaN})),size,size));
});

test('held-out deformation cannot alter the transform fitted on unchanged anchors',()=>{
  const alignmentIndices = Array.from({length:100},(_,i)=>i);
  const evaluationIndices = Array.from({length:378},(_,i)=>i+100);
  const moved=points.map((p,i)=>({...p,x:p.x+(i>=100?24/size.width:0)}));
  const result=compareLandmarks(points,moved,size,size,{alignmentIndices,evaluationIndices});
  assert.equal(result.fitMode,'held_out_points');
  assert.ok(result.alignmentRmsPx<1e-9);
  assert.ok(Math.abs(result.evaluationRmsPx-24)<1e-9);
  assert.ok(compareLandmarks(points,moved,size,size).alignedRmsPx<result.evaluationRmsPx);
  alignmentIndices.pop();
  assert.equal(result.alignmentIndices.length,100);
});

test('held-out fit recovers camera transform while preserving local deformation',()=>{
  const selection={alignmentIndices:[0,12,24,36],evaluationIndices:[100,200,300]};
  const angle=-.3,c=Math.cos(angle),s=Math.sin(angle),scale=1.7;
  const moved=points.map((p,i)=>{
    const x=p.x*size.width+(selection.evaluationIndices.includes(i)?12:0);
    const y=p.y*size.height;
    return {x:(scale*(c*x-s*y)+90)/2400,y:(scale*(s*x+c*y)-12)/1600,z:0};
  });
  const result=compareLandmarks(points,moved,size,{width:2400,height:1600},selection);
  assert.ok(Math.abs(result.evaluationRmsPx-12)<1e-9);
  assert.ok(result.alignmentRmsPx<1e-9);
});

test('rejects overlapping duplicate missing out-of-range and degenerate anchors',()=>{
  for (const selection of [
    {alignmentIndices:[0,1,2],evaluationIndices:[2,3]},
    {alignmentIndices:[0,0,2],evaluationIndices:[3]},
    {alignmentIndices:[0,1],evaluationIndices:[3]},
    {alignmentIndices:[0,1,2],evaluationIndices:[]},
    {alignmentIndices:[0,1,2],evaluationIndices:[478]},
    {alignmentIndices:[0,1,2],evaluationIndices:[3.5]},
    {alignmentIndices:[0,1,2],evaluationIndices:[3,3]},
  ]) assert.throws(()=>compareLandmarks(points,points,size,size,selection));
  const collapsed=points.map((p,i)=>i<3?{x:0,y:0,z:0}:p);
  assert.throws(()=>compareLandmarks(points,collapsed,size,size,{alignmentIndices:[0,1,2],evaluationIndices:[3]}));
});
