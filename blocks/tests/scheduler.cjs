const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {Worker:Thread,MessageChannel:Channel}=require('worker_threads');
const workers=[],channels=[];let mainTimers=0;
class Worker {
 constructor(){const src=fs.readFileSync(path.join(__dirname,'../live-timer-worker.js'),'utf8');this.thread=new Thread("const {parentPort}=require('worker_threads');global.self={postMessage:data=>parentPort.postMessage(data)};"+src+";parentPort.on('message',data=>self.onmessage({data}));",{eval:true});workers.push(this);this.thread.on('message',data=>this.onmessage?.({data}));}
 postMessage(data){this.thread.postMessage(data);}
 terminate(){this.thread.terminate();}
}
class MessageChannel extends Channel {constructor(){super();channels.push(this);}}
const ctx={Worker,MessageChannel,URL,Date,Promise,Error,Map,setTimeout:(fn,ms)=>{mainTimers++;return setTimeout(fn,Math.max(ms,1000));},clearTimeout,setInterval,clearInterval};ctx.window=ctx;ctx.location={href:'https://code.codynick.com/blocks/'};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../live-scheduler.js'),'utf8'),ctx);
(async()=>{
const started=Date.now();for(let i=0;i<40;i++)await ctx.CodyScheduler.wait(0);assert(Date.now()-started<500);assert.equal(mainTimers,0);
await ctx.CodyScheduler.wait(30);assert.equal(mainTimers,0);
let ticks=0;const cancel=ctx.CodyScheduler.every(()=>ticks++,20);await new Promise(r=>setTimeout(r,90));cancel();assert(ticks>=2);const before=ticks;await new Promise(r=>setTimeout(r,50));assert.equal(ticks,before);
const controller=new AbortController();const waiting=ctx.CodyScheduler.wait(10000,controller.signal);controller.abort(Error('Stopped'));await assert.rejects(()=>waiting,/Stopped/);
const Hardware=require('../hardware.js');global.window=ctx;const hw=new Hardware({});await hw.wait(0);assert.equal(mainTimers,0);delete global.window;
console.log('PASS: 40 runtime yields bypass clamped main timers, worker delays/heartbeat, cancellation, hardware wait integration');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{for(const w of workers)w.terminate();for(const c of channels){c.port1.close();c.port2.close();}});
