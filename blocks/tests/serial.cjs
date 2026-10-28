const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const els={},eventTarget=new EventTarget();const el=()=>{const classes=new Set();return {textContent:'',disabled:false,classList:{toggle(c,on){on?classes.add(c):classes.delete(c)},contains:c=>classes.has(c)}};};
let pending=null,mode='ok';const listeners={};const port={open:async()=>{},close:async()=>{},readable:{getReader:()=>({read:()=>new Promise(resolve=>pending=resolve),releaseLock(){},cancel:async()=>{pending?.({done:true});}})},writable:{getWriter:()=>({releaseLock(){},write:async bytes=>{assert.equal(bytes.length,20);queueMicrotask(()=>pending({done:false,value:new TextEncoder().encode('CN@@CJP-Neo|1.19.6\0\0\n')}));}})}};
const ctx={console,TextEncoder,TextDecoder,Date,Event,CustomEvent,Promise,setTimeout:(fn,ms)=>setTimeout(fn,ms===2200?0:ms),document:{getElementById:id=>els[id]??=el()},navigator:{serial:{requestPort:async()=>{if(mode==='cancel'){const e=Error('Cancelled');e.name='NotFoundError';throw e;}return port;},addEventListener:(name,fn)=>listeners[name]=fn}}};ctx.window=ctx;ctx.isSecureContext=true;ctx.dispatchEvent=eventTarget.dispatchEvent.bind(eventTarget);vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../serial.js'),'utf8'),ctx);
(async()=>{
assert.equal(els.connect.textContent,'Connect');assert(!els.connect.classList.contains('connected'));
await els.connect.onclick();assert.equal(els.connect.textContent,'Disconnect');assert(els.connect.classList.contains('connected'));assert(ctx.CJP.connected);assert(!els.disconnect);
await els.connect.onclick();assert.equal(els.connect.textContent,'Connect');assert(!els.connect.classList.contains('connected'));assert(!ctx.CJP.connected);
mode='cancel';await els.connect.onclick();assert.equal(els.connect.textContent,'Connect');assert(!els.connect.disabled);
mode='ok';await els.connect.onclick();ctx.CJP.fault();assert(!els.connect.classList.contains('connected'));assert.equal(els.connect.textContent,'Disconnect');await els.connect.onclick();assert.equal(els.connect.textContent,'Connect');
await els.connect.onclick();listeners.disconnect({port});await new Promise(r=>setTimeout(r,5));assert.equal(els.connect.textContent,'Connect');assert(!els.connect.classList.contains('connected'));
console.log('PASS: single button connects/disconnects, success styling, cancellation, fault cleanup, USB unplug');
})().catch(e=>{console.error(e);process.exitCode=1});
