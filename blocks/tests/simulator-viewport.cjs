const assert=require('node:assert/strict'),V=require('../../simulator/viewport.js');
const original={scale:.8,x:45,y:-20},point={x:250,y:180};const enlarged=V.zoomAt(original,point,-120);
assert(enlarged.scale>original.scale);assert(Math.abs((point.x-original.x)/original.scale-(point.x-enlarged.x)/enlarged.scale)<1e-9);assert(Math.abs((point.y-original.y)/original.scale-(point.y-enlarged.y)/enlarged.scale)<1e-9);
assert.equal(V.zoomAt({scale:V.MAX_SCALE,x:0,y:0},point,-10000).scale,V.MAX_SCALE);assert.equal(V.zoomAt({scale:V.MIN_SCALE,x:0,y:0},point,10000).scale,V.MIN_SCALE);
assert.deepEqual(V.pan(original,100,-30),{scale:.8,x:145,y:-50});assert.deepEqual(original,{scale:.8,x:45,y:-20});
const bounds={left:40,top:40,right:850,bottom:900},fit=V.fit(bounds,700,600);assert(bounds.left*fit.scale+fit.x>=15.99);assert(bounds.right*fit.scale+fit.x<=684.01);assert(bounds.top*fit.scale+fit.y>=15.99);assert(bounds.bottom*fit.scale+fit.y<=584.01);
console.log('PASS: simulator pointer-anchored zoom, bounded scale, independent pan and fit bounds');
