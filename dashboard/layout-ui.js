/* Pointer and keyboard controls for the snapped dashboard grid. */
'use strict';
(()=>{
 const L=window.CodyDashboardLayout,grid=document.getElementById('dashboardGrid');
 const toggle=document.getElementById('editLayout'),reset=document.getElementById('resetLayout'),status=document.getElementById('layoutStatus');
 let saved=L.read(localStorage),editing=false,gesture=null,positions={},frame=0;
 const cards=()=>latestCards;
 const cols=()=>L.columns(grid.clientWidth);
 function redraw(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;cards().forEach(updateCardValues);});}
 function apply(data=cards(),override=saved,priority){
  const count=cols();grid.style.gridTemplateColumns=`repeat(${count},minmax(0,1fr))`;
  positions=L.arrange(data,override,count,priority);
  for(const el of grid.querySelectorAll('.card')){const r=positions[el.dataset.cardId];if(!r)continue;el.style.gridColumn=`${r.x+1} / span ${r.w}`;el.style.gridRow=`${r.y+1} / span ${r.h}`;
   for(const handle of el.querySelectorAll('[data-layout-action]')){handle.tabIndex=editing?0:-1;handle.setAttribute('aria-disabled',String(!editing));}
  }
 }
 function commit(layout){
  // Save displaced positions too, while retaining wider desktop sizes on smaller screens.
  const changes={};for(const card of cards()){const id=card.id,r=layout[id];if(!r)continue;const old=L.preferred(card,saved);Object.defineProperty(changes,id,{value:{...old,x:r.x,y:r.y},enumerable:true,writable:true});}
  if(gesture)changes[gesture.id]={...layout[gesture.id]};
  try{saved=L.save(localStorage,changes);status.textContent='Layout saved in this browser.';}catch(e){saved={...saved,...changes};status.textContent='Layout changed, but could not be saved. Browser storage may be full.';}
  apply();redraw();
 }
 function finish(cancel){if(!gesture)return;const g=gesture;if(cancel){gesture=null;apply();status.textContent='Layout change cancelled.';}else{if(g.changed)commit(positions);gesture=null;}
  g.handle.classList.remove('layout-active');if(g.handle.hasPointerCapture?.(g.pointerId))g.handle.releasePointerCapture(g.pointerId);
  renderedState=null;pollState();
 }
 toggle.addEventListener('click',()=>{finish(true);editing=!editing;grid.classList.toggle('layout-editing',editing);toggle.textContent=editing?'Lock layout':'Edit layout';toggle.setAttribute('aria-pressed',String(editing));reset.hidden=!editing;status.textContent=editing?'Drag a title to move; drag a corner to resize. Arrow keys work on focused handles.':'Layout locked.';apply();});
 reset.addEventListener('click',()=>{finish(true);try{localStorage.removeItem(L.key);saved={};apply();redraw();status.textContent='Default layout restored.';}catch(e){status.textContent='Could not reset saved layout.';}});
 grid.addEventListener('pointerdown',e=>{const handle=e.target.closest('[data-layout-action]');if(!editing||!handle||e.button!==0)return;const card=handle.closest('.card'),id=card.dataset.cardId;const rect=grid.getBoundingClientRect(),count=cols();
  gesture={id,handle,pointerId:e.pointerId,mode:handle.dataset.layoutAction,startX:e.clientX,startY:e.clientY,scrollY:window.scrollY,r:{...positions[id]},stepX:(rect.width+12)/count,stepY:132,changed:false};
  handle.setPointerCapture(e.pointerId);handle.classList.add('layout-active');handle.focus({preventScroll:true});e.preventDefault();
 });
 grid.addEventListener('pointermove',e=>{if(!gesture||e.pointerId!==gesture.pointerId)return;const g=gesture,count=cols(),card=cards().find(c=>c.id===g.id);if(!card){finish(true);return;}
  const dx=Math.round((e.clientX-g.startX)/g.stepX),dy=Math.round((e.clientY-g.startY+window.scrollY-g.scrollY)/g.stepY),min=L.minimum(card,count),r={...g.r};
  if(g.mode==='move'){r.x=Math.max(0,Math.min(count-r.w,r.x+dx));r.y=Math.max(0,Math.min(10000,r.y+dy));}else{r.w=Math.max(min.w,Math.min(count-r.x,r.w+dx));r.h=Math.max(min.h,Math.min(6,r.h+dy));}
  g.changed=JSON.stringify(r)!==JSON.stringify(g.r);apply(cards(),{...saved,[g.id]:r},g.id);redraw();e.preventDefault();
 });
 grid.addEventListener('pointerup',e=>{if(gesture?.pointerId===e.pointerId)finish(false);});
 grid.addEventListener('pointercancel',e=>{if(gesture?.pointerId===e.pointerId)finish(true);});
 grid.addEventListener('lostpointercapture',()=>{if(gesture)finish(true);});
 grid.addEventListener('keydown',e=>{if(e.key==='Escape'){finish(true);return;}const handle=e.target.closest('[data-layout-action]');if(!editing||!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();const id=handle.closest('.card').dataset.cardId,card=cards().find(c=>c.id===id),count=cols(),min=L.minimum(card,count),r={...positions[id]},dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
  if(handle.dataset.layoutAction==='move'){r.x=Math.max(0,Math.min(count-r.w,r.x+dx));r.y=Math.max(0,Math.min(10000,r.y+dy));}else{r.w=Math.max(min.w,Math.min(count-r.x,r.w+dx));r.h=Math.max(min.h,Math.min(6,r.h+dy));}
  gesture={id};apply(cards(),{...saved,[id]:r},id);commit(positions);gesture=null;
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')finish(true);});
 window.addEventListener('blur',()=>finish(true));
 window.addEventListener('resize',()=>{finish(true);apply();redraw();});
 window.addEventListener('storage',e=>{if(e.key===L.key||e.key===null){finish(true);saved=L.read(localStorage);apply();redraw();}});
 window.CodyDashboardLayoutUI={apply,get busy(){return !!gesture;}};apply();redraw();
})();
