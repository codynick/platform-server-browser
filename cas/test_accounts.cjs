const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/frontend/accounts.js','utf8');
async function fixture({account='A',marker='A',editor=true}={}){
 const store=new Map([['codynick-active-account',marker],['codynick-live-state-v1','private live state']]);let reloads=0,resets=0,writes=0,posted=[],saved=[];const listeners={};
 const created=[];const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'My project',style:{},append(){},prepend(){},replaceChildren(){},addEventListener(){},click(){this.clicked=true;},remove(){},showModal(){},close(){}});return elements.get(id);};
 const state={account,delay:null};const project={format:'codynick-webserial',workspace:{blocks:{blocks:[]}}};
 const context={console,sessionStorage:{},localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>{writes++;store.set(k,v);},removeItem:k=>store.delete(k)},location:{reload:()=>reloads++},document:{body:el('body'),createElement:()=>{const e={style:{},remove(){},append(){},setAttribute(){}};created.push(e);return e;},querySelector:()=>el('toolbar'),getElementById:el},setInterval:fn=>{context.poll=fn;},confirm:()=>true,prompt:()=>null,
 fetch:async(path,opts)=>{posted.push([path,opts]);const data=opts.body?JSON.parse(opts.body):null;let result;if(path==='/api/me'){result={user:state.account?{user_id:state.account,name:state.account}:null,csrf:'csrf'};if(state.delay){const d=state.delay;state.delay=null;await d;}}else if(path==='/auth/logout'){state.account=null;result={ok:true,logout_url:'https://id.codynick.com/cas/logout'};}else if(path==='/api/projects'&&opts.method==='POST'){saved.push(data);result={id:'p1',title:data.title,revision:1};}else if(path==='/api/projects/p1'&&opts.method==='PUT')result={id:'p1',title:data.title,revision:2};else result={projects:[]};return {ok:true,json:async()=>result};}};
 context.window={CodyAccountEditor:editor?{status:m=>context.message=m,project:()=>project,reset:()=>resets++,load:()=>{}}:undefined,addEventListener(name,fn){listeners[name]=fn;}};
 vm.runInNewContext(source,context);await new Promise(r=>setImmediate(r));
 return {context,state,store,created,posted,saved,el,listeners,writes:()=>writes,reloads:()=>reloads,resets:()=>resets};
}
(async()=>{
 let f=await fixture();assert.equal(f.reloads(),0);assert(f.store.has('codynick-live-state-v1'));
 await f.el('saveNamed').onclick();assert.equal(f.saved.length,1);assert.equal(f.saved[0].project.format,'codynick-webserial');
 await f.el('saveNamed').onclick();assert(f.posted.some(([p,o])=>p==='/api/projects/p1'&&o.method==='PUT'&&JSON.parse(o.body).revision===1));
 f=await fixture({editor:false});assert.equal(f.reloads(),0,'new standalone tab preserves running state');assert(f.store.has('codynick-live-state-v1'));
 f=await fixture({account:'B',marker:'A'});assert.equal(f.reloads(),0);assert.equal(f.resets(),1);assert(!f.store.has('codynick-live-state-v1'));
 f=await fixture({account:null,marker:'__guest__'});await f.el('saveNamed').onclick();assert.match(f.context.message,/Sign in/);assert.equal(f.saved.length,0);
 f=await fixture();f.state.account=null;await f.context.poll();assert.equal(f.reloads(),0);assert.equal(f.resets(),1);assert(!f.store.has('codynick-live-state-v1'));
 // Repeated polling with the same identity must cause no writes/resets/reloads.
 const stableWrites=f.writes();await f.context.poll();await f.context.poll();
 assert.equal(f.writes(),stableWrites);assert.equal(f.resets(),1);assert.equal(f.reloads(),0);
 // Real sign-out control is tested through its POST plus the next account check.
 f=await fixture({editor:false,account:'B',marker:'A'});assert.equal(f.reloads(),1);
 await f.context.poll();assert.equal(f.reloads(),1,'live view reload bounded to once');
 f=await fixture();f.state.account='B';f.store.set('codynick-active-account','B');
 f.listeners.storage({key:'codynick-active-account'});
 await new Promise(r=>setImmediate(r));
 assert.equal(f.resets(),1);assert.equal(f.reloads(),0);assert.equal(f.writes(),0,'passive notification never echoed');
 f.listeners.storage({key:'codynick-active-account'});await new Promise(r=>setImmediate(r));
 assert.equal(f.resets(),1,'duplicate notifications do not reset again');
 // A delayed pre-logout response cannot overwrite another tab's guest marker.
 f=await fixture();let release;
 f.state.delay=new Promise(r=>release=r);const old=f.context.poll();
 f.state.account=null;f.store.set('codynick-active-account','__guest__');
 f.listeners.storage({key:'codynick-active-account'});release();await old;
 await new Promise(r=>setImmediate(r));
 assert.equal(f.store.get('codynick-active-account'),'__guest__');
 assert.equal(f.writes(),0);assert.equal(f.resets(),1);assert.equal(f.reloads(),0);
 f=await fixture();await f.created.find(e=>e.textContent==='Sign out').onclick();
 assert.equal(f.state.account,null);assert.equal(f.context.location.href,'https://id.codynick.com/cas/logout');
 assert.equal(f.store.get('codynick-active-account'),'__guest__');assert.equal(f.reloads(),0);
 f=await fixture({account:null,marker:'__guest__'});f.created.find(e=>e.textContent==='Sign in').onclick();
 assert.equal(f.context.location.href,'/auth/login','sign-in navigates to backend CAS redirect');
 assert(!source.includes('Import old browser project'));assert(!source.includes('Remove old browser copies'));
 assert(source.includes("document.querySelector('.toolbar')"));
 f=await fixture();assert.equal(f.created.find(e=>e.className==='account-name').textContent,'A');
 f=await fixture();f.el('headerExamples').onclick();assert.equal(f.el('menuExamples').clicked,true);
 console.log('PASS: account Save/update, guest protection, identity change/expiry cleanup, standalone-tab state preservation');
})().catch(e=>{console.error(e);process.exit(1);});
