'use strict';
window.BrowserGenerator=(()=>{
  let gadgets;
  const quote=value=>JSON.stringify(String(value??''));
  const field=(block,name)=>block.getFieldValue(name);
  const call=(action,...args)=>'(await api('+[quote(action),...args].join(', ')+'))';
  function variable(block){const id=field(block,'VAR');return 'variables['+quote(block.workspace.getVariableMap().getVariableById(id)?.name||id)+']';}
  const input=(block,name,fallback='0')=>block.getInputTargetBlock(name)?value(block.getInputTargetBlock(name)):fallback;
  function device(block){const selected=field(block,'device');if(!["'CJP'","'STANDALONE'",'0','5'].includes(selected))throw Error('This device selection is not supported in browser mode.');return ["'CJP'",'5'].includes(selected)?'cjp':'joystick';}
  function value(block){
    const type=block.type;
    switch(type){
      case 'math_number':return String(Number(field(block,'NUM')));
      case 'text':return quote(field(block,'TEXT'));
      case 'variables_get':return variable(block);
      case 'logic_boolean':return field(block,'BOOL')==='TRUE'?'true':'false';
      case 'logic_compare':return '('+input(block,'A')+' '+({EQ:'===',NEQ:'!==',LT:'<',LTE:'<=',GT:'>',GTE:'>='}[field(block,'OP')])+' '+input(block,'B')+')';
      case 'logic_operation':return '('+input(block,'A','false')+(field(block,'OP')==='AND'?' && ':' || ')+input(block,'B','false')+')';
      case 'logic_negate':return '(!'+input(block,'BOOL','false')+')';
      case 'math_arithmetic':return '('+input(block,'A')+' '+({ADD:'+',MINUS:'-',MULTIPLY:'*',DIVIDE:'/',POWER:'**'}[field(block,'OP')])+' '+input(block,'B')+')';
      case 'math_round':return 'Math.'+({ROUND:'round',ROUNDUP:'ceil',ROUNDDOWN:'floor'}[field(block,'OP')])+'('+input(block,'NUM')+')';
      case 'math_single':{const x=input(block,'NUM');if(field(block,'OP')==='POW10')return '(10 ** '+x+')';return field(block,'OP')==='NEG'?'(-'+x+')':'Math.'+({ABS:'abs',ROOT:'sqrt',LN:'log',LOG10:'log10',EXP:'exp'}[field(block,'OP')]||'abs')+'('+x+')';}
      case 'math_random_int':return call('random',input(block,'FROM','1'),input(block,'TO','10'));
      case 'text_join':return '['+Array.from({length:block.itemCount_??2},(_,i)=>input(block,'ADD'+i,'""')).join(',')+'].map(String).join("")';
      case 'cn_timer_value':return call('timer');
      case 'cn_temperature_read':gadgets.add('temperature');return call('sensor','"temperature"');
      case 'cn_soil_read':gadgets.add('soil');return call('sensor','"soil"');
      case 'cn_ultrasonic_read':if(!["'STANDALONE'",'0'].includes(field(block,'device')))throw Error('Only stand-alone ultrasonic is supported.');gadgets.add('ultrasonic');return call('sensor','"distance"');
      case 'cn_joystick_position':
      case 'cn_joystick_click':{const kind=device(block);gadgets.add(kind);return call('joystick',quote(kind),quote(type.endsWith('click')?'CLICK':String(field(block,'pos')).replaceAll("'",'').toUpperCase()));}
      default:throw Error('Block '+type+' is not available in browser execution yet.');
    }
  }
  function stack(block){let result='';for(let current=block;current;current=current.getNextBlock())result+=statement(current);return result;}
  const body=(block,name)=>stack(block.getInputTargetBlock(name));
  function statement(block){
    const type=block.type,f=name=>field(block,name),q=name=>quote(f(name)),n=name=>String(Number(f(name)));
    if(type.startsWith('dash_create')){const kind=type==='dash_create'?q('TYPE'):quote(type.slice(12));return call('create',q('NAME'),kind,q('TITLE'))+';\n';}
    if(['dash_set','dash_info_set','dash_gauge_set'].includes(type))return call('set',q('NAME'),input(block,'VALUE'))+';\n';
    switch(type){
      case 'dash_clear':return call('clear')+';\n';
      case 'dash_append':return call('append',q('NAME'),input(block,'VALUE'))+';\n';
      case 'dash_history':return call('history',q('NAME'),n('COUNT'))+';\n';
      case 'dash_range':return call('settings',q('NAME'),'{min_value:'+n('MIN')+',max_value:'+n('MAX')+'}')+';\n';
      case 'dash_appearance':return call('settings',q('NAME'),'{color:'+q('COLOR')+',column_span:'+n('WIDTH')+',height_multiplier:'+n('HEIGHT')+'}')+';\n';
      case 'dash_font':return call('settings',q('NAME'),'{font_name:'+q('FONT')+',font_size:'+n('SIZE')+',horizontal_alignment:'+q('HORIZONTAL')+',vertical_alignment:'+q('VERTICAL')+'}')+';\n';
      case 'variables_set':return variable(block)+' = '+input(block,'VALUE')+';\n';
      case 'math_change':return variable(block)+' = Number('+variable(block)+' || 0) + '+input(block,'DELTA')+';\n';
      case 'text_print':return call('log',input(block,'TEXT','""'))+';\n';
      case 'cn_log':return call('log',q('message'))+';\n';
      case 'cn_wait':return call('wait',input(block,'SECONDS'))+';\n';
      case 'cn_timer_reset':return call('resetTimer')+';\n';
      case 'controls_if':{let code='';for(let i=0;i<=block.elseifCount_;i++)code+=(i?'else ':'')+'if ('+input(block,'IF'+i,'false')+') {\n'+body(block,'DO'+i)+'}\n';if(block.elseCount_)code+='else {\n'+body(block,'ELSE')+'}\n';return code;}
      case 'controls_repeat_ext':return '{ const times = Math.max(0,Math.floor('+input(block,'TIMES','10')+')); for(let i=0;i<times;i++){\n'+body(block,'DO')+call('wait','0.001')+';\n}}\n';
      case 'controls_whileUntil':return 'while ('+(f('MODE')==='UNTIL'?'!':'')+'('+input(block,'BOOL','false')+')) {\n'+body(block,'DO')+call('wait','0.001')+';\n}\n';
      case 'cn_forever':return 'while(true){\n'+body(block,'DO')+call('wait','0.001')+';\n}\n';
      case 'controls_flow_statements':return f('FLOW')==='BREAK'?'break;\n':call('wait','0.001')+'; continue;\n';
      case 'cn_rgb_matrix_set':gadgets.add('cjp');return call('led',n('led'),q('color'))+';\n';
      case 'cn_rgb_matrix_clear':gadgets.add('cjp');return call('ledClear')+';\n';
      case 'cn_seven_segment_display':
      case 'cn_seven_segment_display_value':if(!["'STANDALONE'",'0'].includes(f('device')))throw Error('Only stand-alone seven-segment is supported.');gadgets.add('seven');return call('seven',type.endsWith('_value')?input(block,'value'):n('value'))+';\n';
      default:throw Error('Block '+type+' is not available in browser execution yet.');
    }
  }
  function generate(workspace){
    gadgets=new Set();const roots=workspace.getTopBlocks(true);let start='',loop='';
    for(const root of roots){if(root.type==='cn_event_start')start+=body(root,'DO');else if(root.type==='cn_event_loop')loop+=body(root,'DO');}
    return {code:'"use strict";\nconst variables = Object.create(null);\n'+start+'\nwhile(true){\n'+loop+'\nawait api("wait",0.02);\n}',gadgets:[...gadgets]};
  }
  return {generate};
})();
