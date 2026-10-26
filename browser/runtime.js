'use strict';
window.BrowserRunner=(()=>{
  let worker=null,timerStart=performance.now(),heartbeat,runId=0;
  const owner=Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-');
  const workerReady=fetch('/assets/browser-worker.js').then(response=>{if(!response.ok)throw Error('Cannot load browser worker.');return response.text();}).then(source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
  workerReady.catch(()=>{});
  const state=BrowserState;
  const output=changes=>state.set('output',{...state.get('output'),...changes});
  const card=name=>{const item=state.get('cards').find(c=>c.name===name);if(!item)throw Error('Create dashboard widget "'+name+'" before using it.');return item;};
  const encode=value=>typeof value==='string'?value:JSON.stringify(value);
  function update(item){state.set('cards',state.get('cards').map(c=>c.id===item.id?item:c));}
  function stop(broadcast=true){
    runId++;
    worker?.terminate();worker=null;clearInterval(heartbeat);
    if(broadcast)state.emit({stop:true});
    if(broadcast||state.get('output').owner===owner)output({owner:'',seen:0});
  }
  state.subscribe(message=>{if(message.stop)stop(false);});
  async function invoke(action,args){
    switch(action){
      case 'wait':{const seconds=Number(args[0]);if(!Number.isFinite(seconds))throw Error('Wait must be a finite number.');return new Promise(resolve=>setTimeout(resolve,Math.max(1,Math.min(3600000,seconds*1000))));}
      case 'timer':return (performance.now()-timerStart)/1000;
      case 'resetTimer':timerStart=performance.now();return;
      case 'random':return Math.floor(Math.random()*(Math.floor(args[1])-Math.ceil(args[0])+1))+Math.ceil(args[0]);
      case 'sensor':return state.get('scene')[args[0]];
      case 'joystick':return state.snapshot()[args[0]==='cjp'?'states':'joystick_states'].includes(args[1]);
      case 'led':{const leds=state.get('output').leds;const index=Number(args[0]);if(!Number.isInteger(index)||index<0||index>15)throw Error('LED index must be 0 to 15.');leds[index]=args[1];output({leds});return;}
      case 'ledClear':output({leds:Array(16).fill('#000000')});return;
      case 'seven':{const n=Number(args[0]);const text=Number.isFinite(n)?String(Math.round(n*10)/10):'----';output({seven_segment:text.replace('.','').length>4?'----':text});return;}
      case 'clear':state.set('cards',[]);return;
      case 'create':{
        const [name,type,title]=args,cards=state.get('cards').filter(c=>c.name!==name);
        const id=Math.max(0,...cards.map(c=>c.id))+1;
        cards.push({id,name,type,title,color:'blue',min_value:0,max_value:50,value:type==='graph'?'[]':'0',description:'',column_span:1,height_multiplier:1,y_padding_percent:0,x_axis_label:type==='graph'?'Sample':'',y_axis_label:'',valid:true,errors:[],history:[],limit:20,sample:0,
          ...(type==='info'||type==='gauge'?{font_size:32,font_name:'Arial',horizontal_alignment:'center',vertical_alignment:'center'}:{})});
        state.set('cards',cards);return;
      }
      case 'set':{const item=card(args[0]);item.value=encode(args[1]);update(item);return;}
      case 'settings':{const item=card(args[0]);Object.assign(item,args[1]);update(item);return;}
      case 'history':{const item=card(args[0]);if(item.type!=='graph')throw Error('History requires a graph widget.');item.limit=Math.max(1,Math.min(1000,Number(args[1])));item.history=item.history.slice(-item.limit);item.value=JSON.stringify(item.history);update(item);return;}
      case 'append':{const item=card(args[0]);if(item.type!=='graph')throw Error('Add sample requires a graph widget.');const value=Number(args[1]);if(args[1]==null||!Number.isFinite(value))return;item.history.push({x:++item.sample,y:value});item.history=item.history.slice(-item.limit);item.value=JSON.stringify(item.history);update(item);return;}
      case 'log':console.log('[CodyNick browser]',...args);return;
      default:throw Error('Unsupported local command: '+action);
    }
  }
  function preview(workspace){return BrowserGenerator.generate(workspace).code;}
  async function run(workspace){
    stop();
    const requestedRun=runId;
    try{
      if(document.getElementById('executionTarget').value!=='simulator')throw Error('Choose Simulator. Physical USB is not included in this edition yet.');
      const program=BrowserGenerator.generate(workspace);state.requireGadgets(program.gadgets);
      timerStart=performance.now();output({error:'',owner,seen:Date.now()});
      const workerURL=await workerReady;
      if(requestedRun!==runId)return;
      const current=worker=new Worker(workerURL);
      heartbeat=setInterval(()=>{if(worker===current)output({seen:Date.now()});},1000);
      current.onmessage=async event=>{
        const data=event.data;
        if(data.failed){stop();output({error:data.failed});toast(data.failed,true);return;}
        if(data.finished){stop();return;}
        try{const value=await invoke(data.action,data.args);if(worker===current)current.postMessage({reply:true,id:data.id,value});}
        catch(error){if(worker===current)current.postMessage({reply:true,id:data.id,error:error.message});}
      };
      current.onerror=event=>{stop();toast(event.message||'Browser worker failed',true);};
      current.postMessage({code:program.code});setStatus('workspaceStatus','Running locally','ok');toast('Running in this browser.');
      // Design autosave/manual Save is independent of local execution.
    }catch(error){output({error:error.message});toast(error.message,true);}
  }
  addEventListener('pagehide',()=>{if(worker||state.get('output').owner===owner)stop();});
  return {run,ready:workerReady,stop:()=>{stop();setStatus('workspaceStatus','Stopped','ok');toast('Local program stopped.');},preview,invoke};
})();
