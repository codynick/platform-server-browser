'use strict';
const timers=new Map();
self.onmessage=({data})=>{
 const {id,ms,repeat,cancel}=data;
 if(cancel){clearTimeout(timers.get(id));clearInterval(timers.get(id));timers.delete(id);return;}
 const done=()=>{if(!repeat)timers.delete(id);self.postMessage({id});};
 timers.set(id,repeat?setInterval(done,ms):setTimeout(done,ms));
};
