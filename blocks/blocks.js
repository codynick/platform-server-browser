'use strict';
(()=>{
const $=id=>document.getElementById(id),B=window.Blockly;
let toastTimer;window.portalToast=message=>{const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);};
if(!B){$('workspaceStatus').textContent='Blockly failed to load. Check that vendor files were installed.';return;}
const specs=window.HARDWARE_SPECS;
const Blockly=B;
function quotePython(value){return JSON.stringify(String(value??''));}
function buildDynamicBlockJson(spec) {
  const args0 = [];
  for (const arg of (spec.args || [])) {
    if (arg.kind === 'value') {
      args0.push({type: 'input_value', name: arg.name, check: arg.check || null});
    } else if (arg.kind === 'number') {
      args0.push({
        type: 'field_number',
        name: arg.name,
        value: Number(arg.default ?? 0)
      });
    } else if (arg.kind === 'dropdown') {
      args0.push({
        type: 'field_dropdown',
        name: arg.name,
        options: arg.options || [['value', String(arg.default ?? '')]]
      });
    } else if (arg.kind === 'colour') {
      // Use Blockly's color picker only when FieldColour exists.
      // Otherwise use a normal dropdown so older/newer Blockly bundles do not crash.
      if (Blockly.FieldColour) {
        args0.push({
          type: 'field_colour',
          name: arg.name,
          colour: arg.default || '#4c97ff'
        });
      } else {
        args0.push({
          type: 'field_dropdown',
          name: arg.name,
          options: [
            ['red', '#FF0000'],
            ['cyan', '#00FFFF'],
            ['blue', '#0000FF'],
            ['yellow', '#FFFF00'],
            ['magenta', '#FF00FF'],
            ['green', '#00FF00'],
            ['orange', '#FF8000'],
            ['white', '#FFFFFF']
          ]
        });
      }
    } else {
      args0.push({
        type: 'field_input',
        name: arg.name,
        text: String(arg.default ?? '')
      });
    }
  }

  if(spec.type!=='cn_log')args0.push({type:'field_dropdown',name:'TARGET',options:[['Hardware','HARDWARE'],['Simulation','SIMULATION']]});
  const json = {
    type: spec.type,
    message0: spec.label+(spec.type==='cn_log'?'':' target %'+args0.length),
    inputsInline: true,
    args0,
    colour: spec.colour || '#4c97ff',
    tooltip: spec.tooltip || '',
    helpUrl: ''
  };

  if (spec.output) {
    json.output = spec.output;
  } else {
    json.previousStatement = null;
    json.nextStatement = null;
  }

  return json;
}

function defineEventBlocks() {
  Blockly.Blocks['cn_event_start'] = {
    init: function() {
      this.appendDummyInput().appendField('when CodyNick starts');
      this.hat = 'cap';
      this.appendStatementInput('DO');
      this.setColour('#ffbf00');
      this.setTooltip('Runs once when the generated Python program starts.');
      this.setDeletable(true);
    }
  };

  Blockly.Blocks['cn_event_loop'] = {
    init: function() {
      this.appendDummyInput().appendField('main loop');
      this.hat = 'cap';
      this.appendStatementInput('DO');
      this.setColour('#ffab19');
      this.setTooltip('Blocks here are generated inside while True.');
      this.setDeletable(true);
    }
  };
}


B.defineBlocksWithJsonArray(specs.map(buildDynamicBlockJson));
DashboardBlocks.definitions();
defineEventBlocks();
B.defineBlocksWithJsonArray([
{type:'cn_wait',message0:'wait %1 seconds',args0:[{type:'input_value',name:'SECONDS',check:'Number'}],previousStatement:null,nextStatement:null,colour:'#ffab19'},
{type:'cn_forever',message0:'forever %1',args0:[{type:'input_statement',name:'DO'}],previousStatement:null,colour:'#ffab19'},
{type:'cn_timer_value',message0:'timer (seconds)',output:'Number',colour:'#00838f'},
{type:'cn_timer_reset',message0:'reset timer',previousStatement:null,nextStatement:null,colour:'#00838f'}]);
const BLOCK_PACKAGES=[{categories:[...new Set(specs.map(s=>s.category))].map(name=>({name,colour:specs.find(s=>s.category===name).colour})),blocks:specs}];
function makeBlock(type) {
  return { kind: 'block', type };
}

let toolboxMode = 'general';

function buildToolbox() {
  const dynamicCategories = new Map();

  for (const pkg of BLOCK_PACKAGES) {
    for (const cat of (pkg.categories || [])) {
      if (!dynamicCategories.has(cat.name)) {
        dynamicCategories.set(cat.name, {
          kind: 'category',
          name: cat.name,
          colour: cat.colour || '#4c97ff',
          contents: []
        });
      }
    }

    for (const block of (pkg.blocks || [])) {
      if (!dynamicCategories.has(block.category)) {
        dynamicCategories.set(block.category, {
          kind: 'category',
          name: block.category,
          colour: block.colour || '#4c97ff',
          contents: []
        });
      }
      dynamicCategories.get(block.category).contents.push(makeBlock(block.type));
    }
  }

  const general = [
      {
        kind: 'category',
        name: 'Events',
        colour: '#ffbf00',
        contents: [makeBlock('cn_event_start'), makeBlock('cn_event_loop')]
      },
      {
        kind: 'category',
        name: 'Operators',
        colour: '#59c059',
        contents: [
          makeBlock('logic_compare'),
          makeBlock('logic_operation'),
          makeBlock('logic_negate'),
          makeBlock('logic_boolean'),
          { kind: 'block', type: 'math_number', fields: { NUM: 0 } },
          makeBlock('math_arithmetic'),
          makeBlock('math_single'),
          makeBlock('math_round'),
          makeBlock('math_random_int')
        ]
      },
      {
        kind: 'category',
        name: 'Control',
        colour: '#ffab19',
        contents: [
          { kind: 'block', type: 'cn_wait', inputs: { SECONDS: { shadow: { type: 'math_number', fields: { NUM: 1 } } } } },
          makeBlock('controls_if'),
          { kind: 'block', type: 'controls_if', extraState: { hasElse: true } },
          { kind: 'block', type: 'controls_whileUntil', fields: { MODE: 'WHILE' } },
          { kind: 'block', type: 'controls_whileUntil', fields: { MODE: 'UNTIL' } },
          makeBlock('cn_forever'),
          {
            kind: 'block',
            type: 'controls_repeat_ext',
            inputs: {
              TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } }
            }
          },
          makeBlock('controls_flow_statements')
        ]
      },
      {
        kind: 'category',
        name: 'Text',
        colour: '#9966ff',
        contents: [
          { kind: 'block', type: 'text', fields: { TEXT: 'hello' } },
          makeBlock('text_join'),
          makeBlock('text_print')
        ]
      },
      {
        kind: 'category',
        name: 'Timer',
        colour: '#00838f',
        contents: [makeBlock('cn_timer_value'), makeBlock('cn_timer_reset')]
      },
      {
        kind: 'category',
        name: 'Variables',
        colour: '#ff8c1a',
        custom: 'VARIABLE'
      }
  ];
  return {kind: 'categoryToolbox', contents: toolboxMode === 'general' ? general
    : toolboxMode==='dashboard'?DashboardBlocks.categories():Array.from(dynamicCategories.values())};
}

const CodyNickTheme = Blockly.Theme.defineTheme('codynickScratchLike', {
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#f7fbff',
    toolboxBackgroundColour: '#ffffff',
    toolboxForegroundColour: '#334155',
    flyoutBackgroundColour: '#f8fafc',
    flyoutForegroundColour: '#334155',
    flyoutOpacity: 0.98,
    scrollbarColour: '#cbd5e1',
    scrollbarOpacity: 0.95,
    insertionMarkerColour: '#22c55e',
    insertionMarkerOpacity: 0.35,
    markerColour: '#ff6680',
    cursorColour: '#4c97ff'
  },
  fontStyle: {
    family: 'Inter, Arial, Helvetica, sans-serif',
    weight: '700',
    size: 13
  }
});



const categoryColours={'#59c059':['logic_compare','logic_operation','logic_negate','logic_boolean','math_number','math_arithmetic','math_single','math_round','math_random_int'],'#ffab19':['cn_wait','cn_forever','controls_if','controls_repeat_ext','controls_whileUntil','controls_flow_statements']};
for(const [colour,types] of Object.entries(categoryColours))for(const type of types){const definition=B.Blocks[type],originalInit=definition.init;definition.init=function(){originalInit.call(this);this.setColour(colour);};}
// Keep argument inputs inline; statement bodies in loops/conditions remain nested.
for(const type of new Set([...specs.map(spec=>spec.type),...BlockRuntime.types])){const def=B.Blocks[type];if(!def?.init)continue;const init=def.init;def.init=function(){init.call(this);this.setInputsInline(true);};}
const workspace=B.inject('blocklyDiv',{toolbox:buildToolbox(),media:'/blocks/vendor/blockly/media/',renderer:'zelos',theme:CodyNickTheme,trashcan:true,move:{scrollbars:true,drag:true,wheel:false},grid:{spacing:32,length:3,colour:'#dbeafe',snap:true},zoom:{controls:true,wheel:true,startScale:.72,maxScale:2.2,minScale:.35,scaleSpeed:1.12}});
const runtime=new BlockRuntime(new LiveRouter(new CjpHardware(window.CJP),window.CodyLiveStore),specs,(kind,id)=>workspace.highlightBlock(id));
window.codyWorkspace=workspace;
for(const mode of ['general','hardware','dashboard'])$(mode+'ToolboxTab').onclick=()=>{toolboxMode=mode;workspace.updateToolbox(buildToolbox());for(const name of ['general','hardware','dashboard'])$(name+'ToolboxTab').setAttribute('aria-selected',String(name===mode));$('toolboxWorkspace').setAttribute('aria-labelledby',mode+'ToolboxTab');B.svgResize(workspace);};
$('toggleConsole').onclick=()=>{$('consoleModal').classList.add('open');};
$('closeConsole').onclick=()=>{$('consoleModal').classList.remove('open');};
$('toggleSpaces').onclick=()=>{const main=$('liveMain');const hide=!main.classList.contains('stage-collapsed');main.classList.toggle('stage-collapsed',hide);$('toggleSpaces').textContent=hide?'Show Spaces':'Hide Spaces';B.svgResize(workspace);};
for(const name of ['simulator','dashboard'])$('show-'+name).onclick=()=>{for(const other of ['simulator','dashboard']){$(other+'Frame').hidden=other!==name;$('show-'+other).setAttribute('aria-pressed',String(other===name));}};
$('show-simulator').setAttribute('aria-pressed','true');$('show-dashboard').setAttribute('aria-pressed','false');
$('consoleModal').onclick=e=>{if(e.target===$('consoleModal'))$('consoleModal').classList.remove('open');};
window.addEventListener('keydown',e=>{if(e.key==='Escape')$('consoleModal').classList.remove('open');});
let saving=null,loading=false;
const key='codynick-webserial-blocks-v2';
B.serialization.registry.register('codynick_live_scene',{priority:5,save:ws=>ws===workspace?{scene:CodyLiveStore.read().scene}:undefined,load:(data,ws)=>{if(ws===workspace&&data?.scene)CodyLiveStore.simCommand({action:'scene',scene:data.scene});},clear:()=>{}});
function status(s){$('workspaceStatus').textContent=s;}
window.addEventListener('resize',()=>B.svgResize(workspace));
function save(){/* Account work stays in memory until explicit server Save. */}
workspace.addChangeListener(e=>{if(e.isUiEvent||loading)return;clearTimeout(saving);saving=setTimeout(save,600);});
function load(data){if(window.blockProgramRunning)throw Error('Stop the program before loading.');const types=new Set([...specs.map(s=>s.type),...BlockRuntime.types]);const roots=data?.blocks?.blocks;if(!Array.isArray(roots))throw Error('Not a Blockly workspace file.');let count=0;function check(b,depth=0){if(!b)return;if(depth>150||++count>2000)throw Error('Project too large or deeply nested.');if(!types.has(b.type))throw Error('Unsupported block in project: '+b.type);for(const v of Object.values(b.inputs||{})){check(v.block,depth+1);check(v.shadow,depth+1);}check(b.next?.block,depth+1);}roots.forEach(b=>check(b));const previous=B.serialization.workspaces.save(workspace);loading=true;try{B.serialization.workspaces.load(data,workspace);for(const block of workspace.getAllBlocks(false))block.setInputsInline(true);}catch(e){B.serialization.workspaces.load(previous,workspace);throw e;}finally{loading=false;}save();B.svgResize(workspace);}
const number=n=>({type:'math_number',fields:{NUM:n}}),str=s=>({type:'text',fields:{TEXT:s}}),hardware=(type,fields={})=>({type,fields}),wait=n=>({type:'cn_wait',inputs:{SECONDS:{block:number(n)}}});
function sequence(...blocks){for(let i=0;i<blocks.length-1;i++)blocks[i].next={block:blocks[i+1]};return blocks[0];}
function example(name){if(['sim-dashboard','mixed'].includes(name))return liveExample(name);let root;if(name==='blink')root={type:'cn_event_loop',x:60,y:50,inputs:{DO:{block:sequence(hardware('cn_rgb_matrix_set',{led:0,color:'#FF0000'}),wait(.5),hardware('cn_rgb_matrix_clear'),wait(.5))}}};
else if(name==='temperature')root={type:'cn_event_loop',x:60,y:50,inputs:{DO:{block:sequence({type:'cn_seven_segment_display_value',fields:{device:"'STANDALONE'"},inputs:{value:{block:hardware('cn_temperature_read')}}},wait(1))}}};
else root={type:'cn_event_loop',x:60,y:50,inputs:{DO:{block:sequence(hardware('cn_rgb_matrix_clear'),{type:'controls_if',inputs:{IF0:{block:hardware('cn_joystick_click',{device:"'CJP'"})},DO0:{block:hardware('cn_rgb_matrix_set',{led:0,color:'#00FF00'})}}},wait(.1))}}};return {blocks:{languageVersion:0,blocks:[root]}};}
function liveExample(name){const target=name==='mixed'?'HARDWARE':'SIMULATION';const sensor={type:'cn_temperature_read',fields:{TARGET:target}};
const start={type:'cn_event_start',x:30,y:30,inputs:{DO:{block:sequence({type:'dash_clear'},hardware('dash_create_gauge',{NAME:'temperature',TITLE:'Temperature'}),hardware('dash_create_graph',{NAME:'history',TITLE:'Temperature history'}))}}};
const set={type:'variables_set',fields:{VAR:{name:'temperature'}},inputs:{VALUE:{block:sensor}}};const variable=()=>({type:'variables_get',fields:{VAR:{name:'temperature'}}});
const loop={type:'cn_event_loop',x:30,y:270,inputs:{DO:{block:sequence(set,{type:'dash_gauge_set',fields:{NAME:'temperature'},inputs:{VALUE:{block:variable()}}},{type:'dash_append',fields:{NAME:'history'},inputs:{VALUE:{block:variable()}}},hardware('cn_rgb_matrix_set',{led:0,color:'#00FF00',TARGET:'SIMULATION'}),wait(.5))}}};
return {codynick_live_scene:{scene:{...CodyLiveStore.read().scene,gadgets:{...CodyLiveStore.read().scene.gadgets,cjp:{x:40,y:40},temperature:{x:440,y:360}}}},blocks:{languageVersion:0,blocks:[start,loop]}};}
function replaceWith(data){if(workspace.getAllBlocks(false).length&&!confirm('Replace the current workspace? Download it first if you want to keep a copy.'))return;load(data);}
$('loadExample').onclick=async()=>{try{const name=$('example').value;if(name==='cross-displays'){const response=await fetch('examples/Real-temperature-Sim-distance.codynick',{cache:'no-cache'});if(!response.ok)throw Error('Could not load example');replaceWith((await response.json()).workspace);}else if(name)replaceWith(example(name));$('examplesDialog').close();}catch(e){status(e.message);}finally{$('example').value='';}};
$('newProject').onclick=()=>{try{replaceWith({blocks:{languageVersion:0,blocks:[{type:'cn_event_start',x:60,y:50}]}});}catch(e){status(e.message);}};
$('saveProject').onclick=()=>{const project={format:'codynick-webserial',version:2,workspace:B.serialization.workspaces.save(workspace)};const url=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='CodyNick-project.codynick';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('importFile').onchange=async()=>{try{const f=$('importFile').files[0];if(!f)return;if(f.size>2*1024*1024)throw Error('Project must be smaller than 2 MB');const data=JSON.parse(await f.text());replaceWith(data.workspace??data);status('Project loaded.');}catch(e){status('Upload failed: '+e.message);}finally{$('importFile').value='';}};
function lock(on){window.blockProgramRunning=on;window.CJP.controls();const button=$('blockRunBtn');button.disabled=false;button.textContent=on?'Stop':'Run';button.classList[on?'remove':'add']('run-btn');button.classList[on?'add':'remove']('stop-btn');button.title=on?'Stop this browser program':'Run this browser program';button.setAttribute('aria-label',on?'Stop program':'Run program');button.setAttribute('aria-pressed',String(on));for(const id of ['example','menuExamples','loadExample','importFile','menuUpload','newProject','loadNamed','loadNamedConfirm'])$(id).disabled=on;/* runtime uses a snapshot so edits cannot change a running program */}
$('saveNamed').onclick=()=>{try{const name=($('designName').value||'Untitled').trim();const saved=JSON.parse(localStorage.getItem('codynick-named-designs')||'{}');if(Object.hasOwn(saved,name)&&!confirm('Replace the saved design “'+name+'”?'))return;Object.defineProperty(saved,name,{value:B.serialization.workspaces.save(workspace),enumerable:true,configurable:true,writable:true});localStorage.setItem('codynick-named-designs',JSON.stringify(saved));status('Saved “'+name+'” in this browser.');}catch(e){status('Save failed: '+e.message);}};
$('loadNamed').onclick=()=>{try{const saved=JSON.parse(localStorage.getItem('codynick-named-designs')||'{}');$('designList').replaceChildren();for(const name of Object.keys(saved).sort()){const option=document.createElement('option');option.textContent=name;option.value=name;$('designList').append(option);}if(!Object.keys(saved).length){status('No named designs saved in this browser yet.');return;}$('designDialog').showModal();}catch(e){status('Load failed: '+e.message);}};
$('loadNamedConfirm').onclick=()=>{try{const name=$('designList').value;if(!name)return;const saved=JSON.parse(localStorage.getItem('codynick-named-designs')||'{}');replaceWith(saved[name]);$('designName').value=name;$('designDialog').close();}catch(e){status('Load failed: '+e.message);}};
$('closeDesignDialog').onclick=()=>$('designDialog').close();
$('blockRunBtn').onclick=async()=>{if(window.blockProgramRunning){runtime.stop();$('blockRunBtn').disabled=true;status('Stopping… Waiting for any active hardware reply.');return;}if(window.CJP.occupied){status('Wait for the serial connection operation to finish.');return;}let snapshot;try{snapshot=new B.Workspace();B.serialization.workspaces.load(B.serialization.workspaces.save(workspace),snapshot);}catch(e){snapshot?.dispose();status(e.message);return;}lock(true);status('Running in this browser…');const token=Date.now()+'-'+Math.random();let heartbeat;try{runtime.preflight(snapshot);runtime.activeNeedsHardware=runtime.executable(snapshot).some(b=>specs.some(s=>s.type===b.type&&s.type!=='cn_log')&&(b.getFieldValue('TARGET')||'HARDWARE')==='HARDWARE');CodyLiveStore.start(token);heartbeat=window.CodyScheduler?window.CodyScheduler.every(()=>CodyLiveStore.heartbeat(token),800):(()=>{const timer=setInterval(()=>CodyLiveStore.heartbeat(token),800);return ()=>clearInterval(timer);})();await runtime.run(snapshot);status('Program finished.');}catch(e){status(e.message==='Stopped'?'Program stopped.':'Program ended: '+(e.message||'Break/continue used outside a loop'));window.CJP.log('PROGRAM '+(e.message||e));}finally{heartbeat?.();CodyLiveStore.stop(token);snapshot.dispose();lock(false);}};
window.addEventListener('cjp-disconnected',()=>{if(window.blockProgramRunning&&runtime.activeNeedsHardware)runtime.stop();});
window.CodyAccountEditor={
 project:()=>({format:'codynick-webserial',version:2,workspace:B.serialization.workspaces.save(workspace)}),
 load,status,reset:()=>{runtime.stop();workspace.clear();$('designName').value='';}
};
load(example('blink'));

})();
