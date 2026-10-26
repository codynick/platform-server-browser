'use strict';
// Shared by the existing tools. Live values never leave this browser profile.
window.BrowserState = (() => {
  const account=window.CODY_BROWSER_ACCOUNT;
  if(!account) throw Error('Missing browser workspace account');
  const prefix='codynick-browser:'+account+':';
  const channel=new BroadcastChannel(prefix+'events');
  const listeners=new Set();
  const defaults={
    scene:{gadgets:{cjp:{x:40,y:40}},temperature:21.1,distance:50,soil:50,wifi_link:true,cloud_link:true},
    output:{leds:Array(16).fill('#000000'),seven_segment:'',notes:[],matrix:{mode:'pixels',pixels:Array(64).fill(0),text:'',speed:1,revision:0},error:'',owner:'',seen:0},
    inputs:{states:[],joystick_states:[],at:0,joystick_at:0},cards:[],
    sprite:{x:0,y:0,direction:90,size:100,visible:true,speech:'',backdrop:'white',keys:[],mouse:{x:0,y:0,down:false}}
  };
  const get=key=>{try{return JSON.parse(localStorage.getItem(prefix+key))??structuredClone(defaults[key]);}catch{return structuredClone(defaults[key]);}};
  const notify=message=>listeners.forEach(fn=>fn(message));
  const set=(key,value)=>{localStorage.setItem(prefix+key,JSON.stringify(value));const message={key,value};channel.postMessage(message);notify(message);return value;};
  channel.onmessage=event=>notify(event.data);
  const emit=message=>{channel.postMessage(message);notify(message);};
  function requireGadgets(gadgets){
    const names={cjp:'CodyJoy Pro',seven:'Seven-segment display',temperature:'Temperature sensor',matrix:'LED matrix',joystick:'Stand-Alone joystick',ultrasonic:'Ultrasonic sensor',soil:'Soil-moisture sensor'};
    for(const gadget of gadgets)if(!get('scene').gadgets[gadget]){
      const message='Add '+(names[gadget]||gadget)+' to the simulation space, then re-run the app.';
      set('output',{...get('output'),error:message,owner:'',seen:0});throw Error(message);
    }
  }
  function snapshot(){
    const output=get('output'),inputs=get('inputs'),now=Date.now();
    return {...output,ok:true,scene:get('scene'),connected:!!output.owner&&now-output.seen<90000,now:now/1000,
      states:now-inputs.at<1000?inputs.states:[],joystick_states:now-inputs.joystick_at<1000?inputs.joystick_states:[],
      wifi:{wifi:0,iot:0,ssid:'',slots:[]}};
  }
  function command(body){
    if(body.action==='scene'){set('scene',body.scene);set('output',{...get('output'),error:''});}
    else if(body.action==='input'){
      const standalone=body.device==='joystick',value=get('inputs');
      value[standalone?'joystick_states':'states']=body.states;value[standalone?'joystick_at':'at']=Date.now();set('inputs',value);
    }else if(body.action==='check_gadgets')requireGadgets(body.gadgets);
    else throw Error('This simulator action is not included in the browser prototype: '+body.action);
    return {ok:true};
  }
  return {get,set,emit,snapshot,command,requireGadgets,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
})();
