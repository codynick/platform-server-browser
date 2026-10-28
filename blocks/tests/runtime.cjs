const assert=require('node:assert/strict');
const Hardware=require('../hardware.js'),Runtime=require('../runtime.js');
const vm=require('node:vm');const ctx={console,setTimeout,clearTimeout};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(require('fs').readFileSync(require('path').join(__dirname,'../vendor/blockly/blockly.min.js'),'utf8'),ctx);const Blockly=ctx.Blockly;
const specs=JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'../block-specs.js'),'utf8').replace(/^window.HARDWARE_SPECS=/,'').replace(/;\s*$/,''));
global.window=new EventTarget();global.CustomEvent=class extends Event{constructor(t,o){super(t);this.detail=o.detail;}};
const sent=[],raw=[];let fail=false;
const t={send:async s=>{const frame=s.padEnd(20,'_');assert.equal(frame.length,20);sent.push(frame);if(s.startsWith('CN@@TEMP@@')){setTimeout(()=>window.dispatchEvent(new CustomEvent('cjp-line',{detail:'CN@@PIR@@1__________'})),1);setTimeout(()=>window.dispatchEvent(new CustomEvent('cjp-line',{detail:'CN@@TEMP@@23.5______'})),5);}if(s.startsWith('CN@@SOIL@@'))fail=true;},raw:async s=>raw.push(s),preview(){},log(){},fault(){fail=true;}};
const hw=new Hardware(t),controller=new AbortController(),signal=controller.signal;
(async()=>{
await hw.call('cn_rgb_matrix_set',{led:15,color:'#ff0000'},signal);assert.equal(sent.at(-1),'CN@@RGB@@15#FF0000__');
await hw.call('cn_rgb_matrix_set_xy',{x:0,y:1,color:'#00FF00'},signal);assert.equal(sent.at(-1),'CN@@RGB@@07#00FF00__');
await hw.call('cn_seven_segment_display_value',{device:'ULTRASEG',value:23.5},signal);assert.equal(sent.at(-1),'CN@@7SEG@@0223.5  __');
await hw.call('cn_led_matrix_display_text',{text:'Hello',speed:1},signal);assert.equal(raw.at(-1),'CN@@LTXT@@105Hello');
assert.equal(await hw.call('cn_temperature_read',{},signal),23.5);
await assert.rejects(()=>hw.call('cn_sound_play',{note:'C4',duration_ms:40000},signal),/Duration/);
await hw.call('cn_sound_play',{note:'A4',duration_ms:500},signal);assert.equal(sent.at(-1),'CN@@BUZ@@044000500__');
await assert.rejects(()=>hw.call('cn_rgb_matrix_set',{led:16,color:'#ff0000'},signal),/LED/);
await assert.rejects(()=>hw.call('cn_seven_segment_display',{device:0,value:1234567},signal),/Display/);
// Real headless Blockly blocks validate interpreter control/value semantics.
Blockly.defineBlocksWithJsonArray([{type:'cn_event_start',message0:'start %1',args0:[{type:'input_statement',name:'DO'}]}, {type:'cn_forever',message0:'forever %1',args0:[{type:'input_statement',name:'DO'}],previousStatement:null},{type:'cn_wait',message0:'wait %1',args0:[{type:'input_value',name:'SECONDS'}],previousStatement:null,nextStatement:null}]);
const ws=new Blockly.Workspace();Blockly.serialization.workspaces.load({blocks:{languageVersion:0,blocks:[{type:'cn_event_start',inputs:{DO:{block:{type:'controls_repeat_ext',inputs:{TIMES:{block:{type:'math_number',fields:{NUM:3}}},DO:{block:{type:'variables_set',fields:{VAR:{name:'x'}},inputs:{VALUE:{block:{type:'math_number',fields:{NUM:7}}}}}}}}}}}]}},ws);
const runtime=new Runtime(hw,specs);await runtime.run(ws);assert.equal([...runtime.vars.values()][0],7);
Blockly.serialization.workspaces.load({blocks:{languageVersion:0,blocks:[{type:'cn_event_start',inputs:{DO:{block:{type:'cn_forever'}}}}]}},ws);let start=Date.now();const run=runtime.run(ws);setTimeout(()=>runtime.stop(),30);await assert.rejects(()=>run,/Stopped/);assert(Date.now()-start<250);
// Stop interrupts a long wait.
Blockly.serialization.workspaces.load({blocks:{languageVersion:0,blocks:[{type:'cn_event_start',inputs:{DO:{block:{type:'cn_wait',inputs:{SECONDS:{block:{type:'math_number',fields:{NUM:100}}}}}}}}]}},ws);const waiting=runtime.run(ws);setTimeout(()=>runtime.stop(),30);await assert.rejects(()=>waiting,/Stopped/);
await assert.rejects(()=>hw.request('CN@@SOIL@@','CN@@SOIL@@',signal),/No sensor reply/);assert(fail);
ws.dispose();console.log('PASS: firmware frames, serpentine mapping, display/text/sound, sensor matching/timeout, validation, real Blockly repeat/variables, stop in empty forever and long wait');
})().catch(e=>{console.error(e);process.exitCode=1});
