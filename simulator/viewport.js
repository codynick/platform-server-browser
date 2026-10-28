/* Camera coordinates are separate from gadget positions and program state. */
'use strict';
(function(root){
 const MIN_SCALE=.15,MAX_SCALE=3;
 function zoomAt(view,point,delta){const factor=Math.exp(-Math.max(-500,Math.min(500,delta))*.0015),scale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,view.scale*factor));return {scale,x:point.x-(point.x-view.x)*scale/view.scale,y:point.y-(point.y-view.y)*scale/view.scale};}
 function pan(view,dx,dy){return {...view,x:view.x+dx,y:view.y+dy};}
 function fit(bounds,width,height){const scale=Math.max(MIN_SCALE,Math.min(1,(width-32)/Math.max(1,bounds.right-bounds.left),(height-32)/Math.max(1,bounds.bottom-bounds.top)));return {scale,x:(width-(bounds.right-bounds.left)*scale)/2-bounds.left*scale,y:(height-(bounds.bottom-bounds.top)*scale)/2-bounds.top*scale};}
 const api={MIN_SCALE,MAX_SCALE,zoomAt,pan,fit};if(typeof module!=='undefined')module.exports=api;else root.CodySimulatorViewport=api;
})(typeof window==='undefined'?globalThis:window);
