'use strict';
class BlockRuntime {
 constructor(hardware,specs,report=()=>{}){this.hw=hardware;this.specs=new Map(specs.map(s=>[s.type,s]));this.report=report;this.vars=new Map();this.controller=null;this.sources=new Set();this.variableSources=new Map();}
 stop(){this.controller?.abort(new Error('Stopped'));}
 async tick(){this.signal.throwIfAborted();await this.hw.wait(0,this.signal);}
 field(b,n){return b.getFieldValue(n);}
 async input(b,n,fallback=0){const v=b.getInputTargetBlock(n);return v?this.value(v):fallback;}
 async args(b){const a={};for(const arg of this.specs.get(b.type).args||[]){let v=arg.kind==='value'?await this.input(b,arg.name):this.field(b,arg.name);if(arg.kind==='number')v=Number(v);if(arg.kind==='dropdown'&&typeof v==='string'&&/^'.*'$/.test(v))v=v.slice(1,-1);a[arg.name]=v;}return a;}
 async gadget(b){const target=this.field(b,'TARGET')||'HARDWARE';const v=await this.hw.call(b.type,await this.args(b),this.signal,target);if(this.specs.get(b.type).output)this.sources.add(target==='SIMULATION'?'Simulation':'Hardware');return v;}
 executable(workspace){const result=[];const visit=b=>{for(;b;b=b.getNextBlock()){if(!b.isEnabled())continue;result.push(b);for(const input of b.inputList||[]){const child=input.connection?.targetBlock();if(child)visit(child);}}};for(const root of workspace.getTopBlocks(true))if(root.isEnabled()&&['cn_event_start','cn_event_loop'].includes(root.type)){result.push(root);visit(root.getInputTargetBlock('DO'));}return result;}
 preflight(workspace){for(const b of this.executable(workspace)){if(!this.specs.has(b.type))continue;try{this.hw.check?.(b.type,{device:this.field(b,'device')},this.field(b,'TARGET')||'HARDWARE');}catch(e){throw Error(b.type+' ['+b.id+']: '+e.message);}}}
 variable(b){return this.field(b,'VAR');}
 async value(b){await this.tick();if(!b||!b.isEnabled())return 0;const f=n=>this.field(b,n),v=(n,d)=>this.input(b,n,d);if(this.specs.has(b.type))return this.gadget(b);switch(b.type){
 case 'math_number':return Number(f('NUM'));
 case 'text':return f('TEXT');
 case 'logic_boolean':return f('BOOL')==='TRUE';
 case 'logic_null':return null;
 case 'logic_negate':return !await v('BOOL',false);
 case 'logic_operation':return f('OP')==='AND'?(await v('A',false)&&await v('B',false)):(await v('A',false)||await v('B',false));
 case 'logic_compare':{const a=await v('A'),c=await v('B');switch(f('OP')){case 'EQ':return a===c;case 'NEQ':return a!==c;case 'LT':return a<c;case 'LTE':return a<=c;case 'GT':return a>c;case 'GTE':return a>=c;}break;}
 case 'math_arithmetic':{const a=Number(await v('A')),c=Number(await v('B'));return {ADD:()=>a+c,MINUS:()=>a-c,MULTIPLY:()=>a*c,DIVIDE:()=>a/c,POWER:()=>a**c}[f('OP')]();}
 case 'math_single':{const n=Number(await v('NUM'));const fn={NEG:x=>-x,ABS:Math.abs,ROOT:Math.sqrt,LN:Math.log,LOG10:Math.log10,EXP:Math.exp,POW10:x=>10**x}[f('OP')];if(!fn)throw Error('Unsupported math operation');return fn(n);}
 case 'math_round':return {ROUND:Math.round,ROUNDUP:Math.ceil,ROUNDDOWN:Math.floor}[f('OP')](Number(await v('NUM')));
 case 'math_random_int':{const a=Math.ceil(Number(await v('FROM',1))),c=Math.floor(Number(await v('TO',10)));return Math.floor(Math.random()*(Math.max(a,c)-Math.min(a,c)+1))+Math.min(a,c);}
 case 'variables_get':for(const source of this.variableSources.get(this.variable(b))||[])this.sources.add(source);return this.vars.get(this.variable(b))??0;
 case 'text_join':{const parts=[];for(let i=0;i<(b.itemCount_??2);i++)parts.push(String(await v('ADD'+i,'')));return parts.join('');}
 case 'cn_timer_value':return (performance.now()-this.timer)/1000;
 default:throw Error('Unsupported value block: '+b.type);
 }throw Error('Invalid block '+b.type);}
 async chain(b){for(;b;b=b.getNextBlock()){await this.tick();if(!b.isEnabled())continue;this.report('block',b.id);if(this.specs.has(b.type)){await this.gadget(b);continue;}if(b.type.startsWith('dash_')){this.sources.clear();const a={};for(const f of ['NAME','TYPE','TITLE','COUNT','MIN','MAX','COLOR','WIDTH','HEIGHT','FONT','SIZE','HORIZONTAL','VERTICAL'])a[f]=this.field(b,f);if(b.getInput('VALUE'))a.VALUE=await this.input(b,'VALUE');a.SOURCE=[...this.sources].join(' + ')||'Program';this.hw.store.dashboard(b.type,a);continue;}const v=(n,d)=>this.input(b,n,d),body=n=>this.chain(b.getInputTargetBlock(n));switch(b.type){
 case 'cn_event_start':case 'cn_event_loop':await body('DO');break;
 case 'cn_wait':{const seconds=Number(await v('SECONDS',1));if(!Number.isFinite(seconds)||seconds<0||seconds>86400)throw Error('Wait must be between 0 and 86400 seconds');await this.hw.wait(seconds*1000,this.signal);break;}
 case 'cn_timer_reset':this.timer=performance.now();break;
 case 'text_print':this.hw.t.log('PROGRAM '+await v('TEXT',''));break;
 case 'math_change':this.sources=new Set(this.variableSources.get(this.variable(b))||[]);this.vars.set(this.variable(b),Number(this.vars.get(this.variable(b))??0)+Number(await v('DELTA',1)));this.variableSources.set(this.variable(b),new Set(this.sources));break;
 case 'variables_set':this.sources.clear();this.vars.set(this.variable(b),await v('VALUE'));this.variableSources.set(this.variable(b),new Set(this.sources));break;
 case 'controls_if':{let found=false;for(let i=0;i<1+(b.elseifCount_||0);i++){if(await v('IF'+i,false)){await body('DO'+i);found=true;break;}}if(!found&&b.elseCount_)await body('ELSE');break;}
 case 'controls_repeat_ext':{const count=Math.floor(Number(await v('TIMES',10)));if(!Number.isFinite(count)||count<0)throw Error('Repeat count must be a nonnegative number');for(let i=0;i<count;i++){await this.tick();try{await body('DO');}catch(e){if(e==='break')break;if(e!=='continue')throw e;}}break;}
 case 'cn_forever':case 'controls_whileUntil':while(b.type==='cn_forever'||(Boolean(await v('BOOL',false))!==(this.field(b,'MODE')==='UNTIL'))){await this.tick();try{await body('DO');}catch(e){if(e==='break')break;if(e!=='continue')throw e;}await this.hw.wait(10,this.signal);}break;
 case 'controls_flow_statements':throw this.field(b,'FLOW')==='BREAK'?'break':'continue';
 default:throw Error('Unsupported statement block: '+b.type);
 }}}
 async run(workspace){if(this.controller)throw Error('Program already running');this.controller=new AbortController();this.signal=this.controller.signal;this.vars.clear();this.variableSources.clear();this.sources.clear();this.timer=performance.now();try{this.preflight(workspace);const roots=workspace.getTopBlocks(true).filter(b=>b.isEnabled());const starts=roots.filter(b=>b.type==='cn_event_start'),loops=roots.filter(b=>b.type==='cn_event_loop');if(!starts.length&&!loops.length)throw Error('Place your blocks inside a start or loop block.');for(const b of this.executable(workspace)){const supported=this.specs.has(b.type)||BlockRuntime.types.includes(b.type);if(!supported)throw Error('Unsupported block: '+b.type);}for(const b of starts)await this.chain(b.getInputTargetBlock('DO'));while(loops.length){for(const b of loops)await this.chain(b.getInputTargetBlock('DO'));await this.hw.wait(50,this.signal);}}finally{this.controller=null;this.report('block',null);}}
}
BlockRuntime.types=['cn_event_start','cn_event_loop','cn_wait','cn_forever','cn_timer_value','cn_timer_reset','math_number','text','logic_boolean','logic_null','logic_negate','logic_operation','logic_compare','math_arithmetic','math_single','math_round','math_random_int','variables_get','math_change','text_join','variables_set','text_print','controls_if','controls_repeat_ext','controls_whileUntil','controls_flow_statements','dash_clear','dash_create','dash_create_info','dash_create_gauge','dash_create_graph','dash_set','dash_info_set','dash_gauge_set','dash_append','dash_history','dash_range','dash_appearance','dash_font'];
if(typeof module!=='undefined')module.exports=BlockRuntime;else window.BlockRuntime=BlockRuntime;
