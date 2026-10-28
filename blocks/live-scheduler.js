'use strict';
(()=>{
 const jobs=new Map();let serial=0,worker=null,channel=null;
 const deliver=id=>{const job=jobs.get(id);if(!job)return;if(!job.repeat)jobs.delete(id);job.fn();};
 try{channel=new MessageChannel();channel.port1.onmessage=e=>deliver(e.data);}catch{}
 function fallback(job){job.mode='native';job.handle=(job.repeat?setInterval:setTimeout)(()=>deliver(job.id),job.repeat?job.ms:Math.max(0,job.deadline-Date.now()));}
 try{
  worker=new Worker(new URL('/blocks/live-timer-worker.js',window.location.href));
  worker.onmessage=e=>deliver(e.data.id);
  worker.onerror=e=>{e.preventDefault();worker.terminate();worker=null;for(const job of jobs.values())if(job.mode==='worker')fallback(job);};
 }catch{}
 function schedule(fn,ms,repeat=false){
  const id=++serial,job={id,fn,repeat,ms,deadline:Date.now()+ms};jobs.set(id,job);
  if(!repeat&&ms===0&&channel){job.mode='message';channel.port2.postMessage(id);}
  else if(worker){job.mode='worker';worker.postMessage({id,ms,repeat});}
  else fallback(job);
  return ()=>{jobs.delete(id);if(job.mode==='worker')worker?.postMessage({id,cancel:true});if(job.mode==='native'){clearTimeout(job.handle);clearInterval(job.handle);}};
 }
 window.CodyScheduler={
  wait(ms,signal){return new Promise((resolve,reject)=>{signal?.throwIfAborted();const done=()=>{signal?.removeEventListener('abort',abort);resolve();};const cancel=schedule(done,ms);const abort=()=>{cancel();signal?.removeEventListener('abort',abort);reject(signal.reason||Error('Stopped'));};signal?.addEventListener('abort',abort,{once:true});});},
  every(fn,ms){return schedule(fn,ms,true);}
 };
})();
