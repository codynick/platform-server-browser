const assert=require('assert/strict'),Port=require('../ch340-usb.js');
class Device {
 constructor(){this.vendorId=0x1a86;this.productId=0x7523;this.opened=false;this.configuration=null;this.configurations=[{configurationValue:1}];this.commands=[];this.out=[];this.pending=null;this.inResult=null;}
 async open(){this.opened=true;}
 async selectConfiguration(){const alt={alternateSetting:0,endpoints:[{type:'interrupt',direction:'in',endpointNumber:1,packetSize:8},{type:'bulk',direction:'in',endpointNumber:2,packetSize:32},{type:'bulk',direction:'out',endpointNumber:3,packetSize:8}]};this.configuration={interfaces:[{interfaceNumber:0,alternate:alt,alternates:[alt]}]};}
 async claimInterface(n){this.claimed=n;}
 async controlTransferIn(setup,n){this.commands.push(['in',setup]);return {status:'ok',data:new DataView(new Uint8Array([0x30,0]).buffer)};}
 async controlTransferOut(setup){this.commands.push(['out',setup]);return {status:this.fail?'stall':'ok'};}
 async transferOut(ep,bytes){assert.equal(ep,3);this.out.push(...bytes);return {status:'ok',bytesWritten:bytes.length};}
 async transferIn(ep,n){assert.equal(ep,2);assert.equal(n,32);if(this.inResult)return this.inResult;return new Promise((resolve,reject)=>this.pending={resolve,reject});}
 async close(){this.opened=false;this.pending?.reject(Error('transfer cancelled'));}
}
(async()=>{
 const d=new Device(),p=new Port(d);await p.open({baudRate:115200});assert.equal(p.inEndpoint,2);assert.equal(p.outEndpoint,3);assert.equal(d.claimed,0);
 assert(d.commands.some(([k,s])=>s.request===0x9a&&s.value===0x1312&&s.index===0xcc83));assert(d.commands.some(([k,s])=>s.request===0x9a&&s.value===0x2518&&s.index===0xc3));assert(d.commands.some(([k,s])=>s.request===0xa4&&s.value===0x9f));
 const bytes=new TextEncoder().encode('CN@@RGB@@00#FF0000__');await p.writable.getWriter().write(bytes);assert.deepEqual(d.out,[...bytes]);
 d.inResult={status:'ok',data:new DataView(new TextEncoder().encode('CN@@CJP-Neo|1.19.6\0\0\n').buffer)};const reader=p.readable.getReader();const r=await reader.read();assert.equal(new TextDecoder().decode(r.value),'CN@@CJP-Neo|1.19.6\0\0\n');
 d.inResult=null;const pending=reader.read();await reader.cancel();assert.equal((await pending).done,true);await p.close();assert(!d.opened);
 const bad=new Device();bad.fail=true;await assert.rejects(()=>new Port(bad).open({baudRate:115200}),/control write/);assert(!bad.opened);
 const wrong=new Device();wrong.productId=0;assert.throws(()=>new Port(wrong),/1A86:7523/);
 let filter;Object.defineProperty(globalThis,'navigator',{value:{usb:{requestDevice:async opts=>{filter=opts.filters;return new Device();}}},configurable:true});await Port.requestPort();assert.deepEqual(filter,[{vendorId:0x1a86,productId:0x7523}]);
 console.log('PASS: CH340 filter, endpoints, baud/8N1/control lines, chunked write, identity read, idle-read cancellation, setup failure cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
