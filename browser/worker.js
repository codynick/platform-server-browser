'use strict';
let sequence=0;
const pending=new Map();
const api=(action,...args)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});postMessage({id,action,args});});
onmessage=async event=>{
  const data=event.data;
  if(data.reply){const job=pending.get(data.id);if(job){pending.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.value);}return;}
  if(data.code){
    try{const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;await new AsyncFunction('api',data.code)(api);postMessage({finished:true});}
    catch(error){postMessage({failed:error.message});}
  }
};
