/* Dashboard layout preferences are independent of Live program data. */
'use strict';
(function(root){
 const key='codynick-dashboard-layout-v1';
 const integer=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Math.round(Number(v)))):fallback;
 function clean(v){return {x:integer(v.x,0,11,0),y:integer(v.y,0,10000,0),w:integer(v.w,1,12,2),h:integer(v.h,1,6,1)};}
 function read(storage){try{const value=JSON.parse(storage.getItem(key)||'{}');const out={};for(const [id,v] of Object.entries(value||{}).slice(0,1000))if(v&&typeof v==='object')Object.defineProperty(out,id,{value:clean(v),enumerable:true,writable:true,configurable:true});return out;}catch{return {};}}
 function save(storage,changes){const value={...read(storage)};for(const [id,v] of Object.entries(changes))Object.defineProperty(value,id,{value:clean(v),enumerable:true,writable:true,configurable:true});storage.setItem(key,JSON.stringify(value));return value;}
 function columns(width){return width<600?2:width<1000?6:12;}
 function defaults(card){const graph=card.type==='graph',gauge=card.type==='gauge';return {x:0,y:0,w:graph?6:gauge?4:2,h:graph||gauge?2:1};}
 function minimum(card,cols){return {w:Math.min(cols,card.type==='graph'?3:card.type==='gauge'?2:1),h:['graph','gauge'].includes(card.type)?2:1};}
 function preferred(card,saved){if(Object.hasOwn(saved,card.id))return clean(saved[card.id]);const d=defaults(card);if(Number(card.column_span)>1)d.w=Math.min(12,Number(card.column_span)*3);if(Number(card.height_multiplier)>1)d.h=Math.min(6,Number(card.height_multiplier)*2);return clean(d);}
 const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 function arrange(cards,saved,cols,priority){cols=integer(cols,1,12,12);const result={},placed=[];
  const list=cards.map((card,index)=>({card,index,p:preferred(card,saved)}));
  list.sort((a,b)=>(a.card.id===priority?-1:b.card.id===priority?1:0)||a.p.y-b.p.y||a.p.x-b.p.x||a.index-b.index);
  for(const {card,p} of list){const min=minimum(card,cols);const r={...p,w:Math.min(cols,Math.max(min.w,p.w)),h:Math.max(min.h,p.h)};r.x=Math.min(r.x,cols-r.w);
   // Preserve a free requested position. Otherwise scan down to the first free slot.
   if(placed.some(other=>overlap(r,other))){let found=false;for(let y=r.y;!found;y++)for(let x=0;x<=cols-r.w;x++){const candidate={...r,x,y};if(!placed.some(other=>overlap(candidate,other))){Object.assign(r,candidate);found=true;break;}}}
   Object.defineProperty(result,card.id,{value:r,enumerable:true});placed.push(r);
  }return result;
 }
 function compactNumber(value,digits=3){const n=Number(value);if(!Number.isFinite(n))return '';if(n===0)return '0';const abs=Math.abs(n);if(abs<0.001||abs>=1e12)return n.toExponential(1);for(const [size,suffix]of [[1e9,'B'],[1e6,'M'],[1e3,'k']])if(abs>=size)return String(Number((n/size).toPrecision(digits)))+suffix;return String(Number(n.toPrecision(Math.max(4,digits))));}
 function fitText(ctx,text,width){text=String(text);if(width<=0)return '';if(ctx.measureText(text).width<=width)return text;while(text&&ctx.measureText(text+'…').width>width)text=text.slice(0,-1);return text?text+'…':'';}
 const api={key,clean,read,save,columns,defaults,minimum,preferred,overlap,arrange,compactNumber,fitText};
 if(typeof module!=='undefined')module.exports=api;else root.CodyDashboardLayout=api;
})(typeof window==='undefined'?globalThis:window);
