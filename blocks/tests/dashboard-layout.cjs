const assert=require('node:assert/strict'),L=require('../../dashboard/layout.js');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
const cards=[{id:'temperature',type:'info'},{id:'distance',type:'info'},{id:'history',type:'graph'},{id:'gauge',type:'gauge'}];
assert(L.defaults(cards[0]).w<L.defaults(cards[2]).w);
function noOverlap(layout,cols){const entries=Object.values(layout);for(const r of entries){assert(r.x>=0&&r.x+r.w<=cols);assert(r.y>=0);}for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)assert(!L.overlap(entries[i],entries[j]));}
const initial=L.arrange(cards,{},12);noOverlap(initial,12);
const moved=L.arrange(cards,{temperature:{x:0,y:0,w:2,h:1},history:{x:0,y:0,w:8,h:3}},12,'history');
assert.deepEqual(moved.history,{x:0,y:0,w:8,h:3});assert(!L.overlap(moved.temperature,moved.history));noOverlap(moved,12);
L.save(storage,moved);const restored=L.read(storage);assert.deepEqual(L.arrange(cards,restored,12),moved);
// Layout persists independently when a Live program clears/recreates named widgets.
const events=new EventTarget(),ctx={window:null,localStorage:storage,structuredClone,Event,Date,console,addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../live-store.js'),'utf8'),ctx);
ctx.CodyLiveStore.dashboard('dash_create_graph',{NAME:'history'});ctx.CodyLiveStore.dashboard('dash_clear',{});ctx.CodyLiveStore.dashboard('dash_create_graph',{NAME:'history'});
assert.deepEqual(L.read(storage).history,moved.history);
for(const width of [330,720,1400])noOverlap(L.arrange(cards,restored,L.columns(width)),L.columns(width));
assert.equal(L.read(storage).history.w,8,'responsive rendering must not modify saved width');
const packed=L.arrange(Array.from({length:100},(_,i)=>({id:String(i),type:i%2?'info':'graph'})),{},2);noOverlap(packed,2);
L.save(storage,JSON.parse('{"__proto__":{"x":2,"y":1,"w":4,"h":2}}'));assert(Object.hasOwn(L.read(storage),'__proto__'));assert.equal({}.x,undefined);
values.set(L.key,'not JSON');assert.deepEqual(L.read(storage),{});
L.save(storage,{broken:{x:-2,y:-10,w:Infinity,h:99}});assert.deepEqual(L.read(storage).broken,{x:0,y:0,w:2,h:6});
assert.equal(L.compactNumber(12500),'12.5k');assert.equal(L.compactNumber(0.000001),'1.0e-6');assert.equal(L.compactNumber(-1234567),'-1.23M');
const measure={measureText:text=>({width:text.length*6})};assert.equal(L.fitText(measure,'Temperature',36),'Tempe…');assert.equal(L.fitText(measure,'x',20),'x');assert.equal(L.fitText(measure,'x',0),'');
console.log('PASS: dashboard packing, movement priority, persistence across program recreation, responsive sizes, bounds, 100 widgets, safe IDs and compact graph labels');
