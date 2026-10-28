'use strict';
class LiveRouter {
 constructor(hardware,store){this.hardware=hardware;this.t=hardware.t;this.store=store;this.token=null;}
 wait(ms,signal){return this.hardware.wait(ms,signal);}
 device(v,kind){if(typeof v==='string')v=v.replace(/^'|'$/g,'');return this.hardware.device(v,kind);}
 required(type,a){if(type==='cn_log')return null;if(type.startsWith('cn_rgb_')||type.startsWith('cn_sound_'))return 'cjp';if(type.startsWith('cn_led_'))return 'matrix';if(type.startsWith('cn_joystick_')){const id=this.device(a.device,'joy');if(![0,5].includes(id))throw Error('Simulation supports joystick 0 (Standalone) or 5 (CJP).');return id===5?'cjp':'joystick';}if(type.startsWith('cn_seven_'))return this.device(a.device,'seven')===2?'ultraseg':'seven';return {cn_temperature_read:'temperature',cn_soil_read:'soil',cn_motion_detect:'motion',cn_rfid_readuid:'rfid',cn_ultrasonic_read:this.device(a.device,'ultra')===1?'ultraseg':'ultrasonic'}[type];}
 check(type,a,target){if(type==='cn_log')return;if(target==='HARDWARE'){if(!this.t.connected)throw Error('Connect a CJP for this Hardware block.');return;}if(target!=='SIMULATION')throw Error('Unknown block target: '+target);const gadget=this.required(type,a);if(!gadget)throw Error('No simulator implementation for '+type);if(!this.store.read().scene.gadgets[gadget])throw Error('Add '+gadget+' to the simulation space before Run.');}
 async call(type,a,signal,target='HARDWARE'){
 signal?.throwIfAborted();this.check(type,a,target);
 if(type==='cn_log'||target==='HARDWARE')return this.hardware.call(type,a,signal);
 // Reuse the firmware-frame validation path, but decode commands into simulation
 // state instead of touching serial. Sensor reads return the simulator's values.
 const state=this.store.simState();
 if(type.startsWith('cn_joystick_')){const states=this.device(a.device,'joy')===5?state.states:state.joystick_states;if(type.endsWith('_click'))return states.includes('CLICK');if(type.endsWith('_position'))return states.includes(String(a.pos).toUpperCase());return states.length?states.map(s=>s.toLowerCase()).join(', '):'neutral';}
 const readings={cn_temperature_read:state.scene.temperature,cn_soil_read:state.scene.soil,cn_motion_detect:state.scene.motion,cn_rfid_readuid:state.scene.rfid,cn_ultrasonic_read:this.device(a.device,'ultra')===1?state.scene.ultraDistance:state.scene.distance};
 if(Object.hasOwn(readings,type))return readings[type];
 const transport={log:()=>{},preview:()=>{},send:async frame=>this.command(frame),raw:async frame=>this.command(frame)};
 const virtual=new CjpHardware(transport);await virtual.call(type,a,signal);
 }
 command(frame){this.store.update(s=>{
 if(frame.startsWith('CN@@RGB@@'))s.leds[Number(frame.slice(9,11))]=frame.slice(11,18);
 else if(frame.startsWith('CN@@RGBCLR@@'))s.leds.fill('#000000');
 else if(frame.startsWith('CN@@7SEG@@')){const text=frame.slice(12,18).trim();s[Number(frame.slice(10,12))===2?'ultra_segment':'seven_segment']=text;}
 else if(frame.startsWith('CN@@LCLR@@')){s.matrix={mode:'pixels',pixels:Array(64).fill(0),text:'',speed:1,revision:s.matrix.revision+1};}
 else if(frame.startsWith('CN@@LPX@@')){if(s.matrix.mode!=='pixels')s.matrix.pixels=Array(64).fill(0);s.matrix.pixels[Number(frame[10])*8+Number(frame[9])]=Number(frame[11]);s.matrix.mode='pixels';s.matrix.revision++;}
 else if(frame.startsWith('CN@@LTXT@@')){s.matrix.mode='text';s.matrix.speed=Number(frame[10]);s.matrix.text=frame.slice(13,13+Number(frame.slice(11,13)));s.matrix.revision++;}
 else if(frame.startsWith('CN@@BUZ@@')){s.notes.push({id:++s.sequence,frequency:Number(frame.slice(9,13)),duration:Number(frame.slice(13,18)),at:Date.now()/1000});s.notes=s.notes.slice(-16);}
 else throw Error('Unsupported simulator command');
 });}
}
if(typeof module!=='undefined')module.exports=LiveRouter;else window.LiveRouter=LiveRouter;
