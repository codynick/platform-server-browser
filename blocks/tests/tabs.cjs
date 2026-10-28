const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');const contexts=[],channels=[],storage=new Map();
function tab(){const handlers={};const el=()=>({textContent:'',innerHTML:''});const elements={};const c={console,structuredClone,Event,Date,JSON,Math,Number,Promise,Map,Object,Array,setTimeout,clearTimeout,setInterval:()=>1,window:null,document:{getElementById:id=>elements[id]??=el(),addEventListener(){}},addEventListener:(name,fn)=>(handlers[name]??=[]).push(fn),dispatchEvent:e=>{for(const fn of handlers[e.type]||[])fn(e);},localStorage:{getItem:k=>storage.get(k)||null,setItem(k,v){storage.set(k,v);for(const other of contexts)if(other!==c)other.dispatchEvent({type:'storage',key:k});}},BroadcastChannel:class{constructor(){channels.push(this);}postMessage(data){for(const other of channels)if(other!==this)other.onmessage?.({data});}}};c.window=c;vm.createContext(c);contexts.push(c);vm.runInContext(fs.readFileSync(path.join(root,'blocks/live-store.js'),'utf8'),c);return c;}
const editor=tab(),dashboard=tab(),simulation=tab();
const script=[...fs.readFileSync(path.join(root,'dashboard/index.html'),'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];vm.runInContext(script,dashboard);vm.runInContext('renderAllCards=cards=>{window.rendered=cards;};',dashboard);
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
(async()=>{
editor.CodyLiveStore.dashboard('dash_create_info',{NAME:'temp',TITLE:'Temperature'});editor.CodyLiveStore.dashboard('dash_create_graph',{NAME:'history',TITLE:'History'});
for(const value of [21.1,32.7,15.4]){const scene=simulation.CodyLiveStore.read().scene;scene.temperature=value;simulation.CodyLiveStore.simCommand({action:'scene',scene});const read=editor.CodyLiveStore.simState().scene.temperature;editor.CodyLiveStore.dashboard('dash_info_set',{NAME:'temp',VALUE:read,SOURCE:'Simulation'});editor.CodyLiveStore.dashboard('dash_append',{NAME:'history',VALUE:read,SOURCE:'Simulation'});await flush();assert.equal(dashboard.rendered.find(w=>w.id==='temp').value,String(value));const plot=dashboard.rendered.find(w=>w.id==='history');assert.equal(JSON.parse(plot.value).at(-1).y,value);}
assert.equal(JSON.parse(dashboard.rendered.find(w=>w.id==='history').value).length,3);
// Even if BroadcastChannel is unavailable, storage and focus events refresh the separate dashboard.
for(const channel of channels)channel.onmessage=null;
editor.CodyLiveStore.dashboard('dash_info_set',{NAME:'temp',VALUE:44});await flush();assert.equal(dashboard.rendered.find(w=>w.id==='temp').value,'44');dashboard.dispatchEvent({type:'focus'});await flush();assert.equal(dashboard.rendered.find(w=>w.id==='temp').value,'44');
console.log('PASS: three isolated browser contexts; repeated separate-tab info/graph updates without polling or restarting, storage fallback and focus refresh');
})().catch(e=>{console.error(e);process.exitCode=1});
