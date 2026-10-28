const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),events=new EventTarget();const els={},persist=new Map(),sent=[];
const element=()=>({children:[],style:{},textContent:'',hidden:false,value:'',files:[],append(b){this.children.push(b)},close(){this.open=false;},setAttribute(){},classList:{add(){},remove(){}}});
const ctx={console,setTimeout,clearTimeout,setInterval,clearInterval,structuredClone,performance,AbortController,Event,CustomEvent,TextEncoder,TextDecoder,Blob,URL,confirm:()=>true,requestAnimationFrame:f=>f(),localStorage:{getItem:k=>persist.get(k)||null,setItem:(k,v)=>persist.set(k,v)},document:{getElementById:id=>els[id]??=element(),createElement:element}};ctx.window=ctx;ctx.addEventListener=events.addEventListener.bind(events);ctx.removeEventListener=events.removeEventListener.bind(events);ctx.dispatchEvent=events.dispatchEvent.bind(events);vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'vendor/blockly/blockly.min.js'),'utf8'),ctx);ctx.Blockly.inject=()=>new ctx.Blockly.Workspace();ctx.Blockly.svgResize=()=>{};
ctx.CJP={connected:false,controls(){},notice(){},preview(){},log(){},send:async text=>{sent.push(text);if(text.startsWith('CN@@TEMP@@'))setTimeout(()=>events.dispatchEvent(new CustomEvent('cjp-line',{detail:'CN@@TEMP@@27.4______'})),1);},raw:async()=>{},fault(){}};
for(const file of ['hardware.js','runtime.js','block-specs.js','live-store.js','live-router.js','dashboard-blocks.js','blocks.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.codyWorkspace.highlightBlock=()=>{};
(async()=>{
const B=ctx.Blockly,ws=ctx.codyWorkspace;ctx.document.getElementById('example');
const b=ws.newBlock('cn_rgb_matrix_set');assert.equal(b.getFieldValue('TARGET'),'HARDWARE');b.setFieldValue('SIMULATION','TARGET');const save=B.serialization.workspaces.save(ws);assert(JSON.stringify(save).includes('SIMULATION'));
// Existing imports omit TARGET and retain Hardware. Program/logic/log/dashboard have no target.
for(const type of ['cn_wait','cn_log','dash_clear','math_number'])assert.equal(ws.newBlock(type).getField('TARGET'),null);
let router=new ctx.LiveRouter(new ctx.CjpHardware(ctx.CJP),ctx.CodyLiveStore);const controller=new AbortController();
await assert.rejects(()=>router.call('cn_rgb_matrix_set',{led:0,color:'#FF0000'},controller.signal,'HARDWARE'),/Connect a CJP/);
await router.call('cn_rgb_matrix_set',{led:0,color:'#FF0000'},controller.signal,'SIMULATION');assert.equal(ctx.CodyLiveStore.read().leds[0],'#FF0000');assert.equal(sent.length,0);
assert.throws(()=>router.check('cn_temperature_read',{},'SIMULATION'),/Add temperature/);
// Load integrated simulation example and run it while CJP is disconnected.
els.example.value='sim-dashboard';els.loadExample.onclick();assert(ws.getAllBlocks(false).some(b=>b.type==='dash_gauge_set'));
const running=els.blockRunBtn.onclick();setTimeout(()=>{const scene=ctx.CodyLiveStore.read().scene;scene.temperature=32.7;ctx.CodyLiveStore.simCommand({action:'scene',scene});},650);setTimeout(()=>els.blockRunBtn.onclick(),1900);await running;
let state=ctx.CodyLiveStore.read();assert.equal(els.workspaceStatus.textContent,'Program stopped.');assert.equal(state.widgets.temperature.value,32.7);assert.equal(state.widgets.temperature.description,'Source: Simulation');assert(state.widgets.history.history.length>0);assert.equal(state.leds[0],'#00FF00');assert.equal(sent.length,0);
// A hardware-targeted block prevents all execution if CJP absent.
els.example.value='mixed';els.loadExample.onclick();let count=state.widgets.history.history.length;await els.blockRunBtn.onclick();assert(els.workspaceStatus.textContent.includes('Connect a CJP'));assert.equal(ctx.CodyLiveStore.read().widgets.history.history.length,count);
// Mixed example uses actual serial sensor replies and simulation outputs together.
ctx.CJP.connected=true;const mixed=els.blockRunBtn.onclick();setTimeout(()=>els.blockRunBtn.onclick(),350);await mixed;state=ctx.CodyLiveStore.read();assert.equal(state.widgets.temperature.value,27.4);assert.equal(state.widgets.temperature.description,'Source: Hardware');assert(sent.some(s=>s.startsWith('CN@@TEMP@@')));assert(!sent.some(s=>s.startsWith('CN@@RGB@@')));
// Shipped cross-display project: real temp -> sim display, sim distance -> real display.
const project=JSON.parse(fs.readFileSync(path.join(root,'examples/Real-temperature-Sim-distance.codynick'),'utf8'));
B.serialization.workspaces.load(project.workspace,ws);
sent.length=0;
const cross=els.blockRunBtn.onclick();
setTimeout(()=>{const scene=ctx.CodyLiveStore.read().scene;scene.distance=123.4;ctx.CodyLiveStore.simCommand({action:'scene',scene});},650);
// Wait for a complete updated sample instead of stopping midway through a loop
// on slower hosts (which previously left the dashboard at its preceding value).
try {
 const deadline=Date.now()+8000;
 while(true){
  const current=ctx.CodyLiveStore.read();
  if(Number(current.widgets.distance?.value)===123.4 && current.widgets.distance_history?.history.length>=2 && Number(current.widgets.distance_history.history.at(-1)?.y)===123.4 && current.widgets.temperature_history?.history.length>=2)break;
  assert(Date.now()<deadline,'Timed out waiting for the cross-display dashboard sample');
  await new Promise(resolve=>setTimeout(resolve,20));
 }
} finally { els.blockRunBtn.onclick(); await cross; }
state=ctx.CodyLiveStore.read();
assert.equal(els.workspaceStatus.textContent,'Program stopped.');
assert.equal(state.seven_segment,'27.4');
assert(sent.some(frame=>frame.startsWith('CN@@7SEG@@00123.4')));
assert(!sent.some(frame=>frame.startsWith('CN@@ULTRA')));
assert.equal(Number(state.widgets.temperature.value),27.4);
assert.equal(state.widgets.temperature.description,'Source: Hardware');
assert.equal(Number(state.widgets.distance.value),123.4);
assert.equal(state.widgets.distance.description,'Source: Simulation');
assert(state.widgets.temperature_history.history.length>=2);
assert(state.widgets.distance_history.history.length>=2);
assert.equal(Object.keys(state.widgets).length,4);
// Additional supported simulated gadgets and runtime type validation.
ctx.CodyLiveStore.simCommand({action:'scene',scene:{...state.scene,gadgets:{...state.scene.gadgets,motion:{x:0,y:0},rfid:{x:0,y:0},ultraseg:{x:0,y:0}},motion:true,rfid:'ABCDEF12',ultraDistance:123}});
assert.equal(await router.call('cn_motion_detect',{},controller.signal,'SIMULATION'),true);assert.equal(await router.call('cn_rfid_readuid',{},controller.signal,'SIMULATION'),'ABCDEF12');assert.equal(await router.call('cn_ultrasonic_read',{device:'ULTRASEG'},controller.signal,'SIMULATION'),123);
assert.throws(()=>router.check('cn_joystick_click',{device:3},'SIMULATION'),/joystick 0/);
// Missing simulated gadget yields block-specific preflight failure even when CJP connected.
const s=ctx.CodyLiveStore.read().scene;delete s.gadgets.temperature;s.gadgets.seven={x:0,y:0};ctx.CodyLiveStore.simCommand({action:'scene',scene:s});els.example.value='temperature';els.loadExample.onclick();for(const block of ws.getAllBlocks(false))if(block.getField('TARGET'))block.setFieldValue('SIMULATION','TARGET');await els.blockRunBtn.onclick();assert(els.workspaceStatus.textContent.includes('Add temperature'));
// Prototype-named dashboard widgets stay safe and validation rolls back invalid writes.
ctx.CodyLiveStore.dashboard('dash_create_info',{NAME:'__proto__',TITLE:'safe'});assert(ctx.CodyLiveStore.cards().some(c=>c.id==='__proto__'));assert.throws(()=>ctx.CodyLiveStore.dashboard('dash_range',{NAME:'__proto__',MIN:10,MAX:0}),/Maximum/);
ws.dispose();console.log('PASS: target defaults/serialization, no global switch, disconnected simulation, mixed real/sim routing, dashboard provenance, missing-device preflight and extra gadgets');
})().catch(e=>{console.error(e);process.exitCode=1});
