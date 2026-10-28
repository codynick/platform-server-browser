'use strict';
/* Site-local CH340 WebUSB transport, exposing the reader/writer subset used by serial.js.
 * Protocol reference: usb-serial-for-android Ch34xSerialDriver (MIT), Andreas Butti
 * and contributors. See THIRD_PARTY.md. Only VID 1A86 / PID 7523 is targeted.
 */
class Ch340UsbPort {
  constructor(device){
    if(device.vendorId!==0x1a86||device.productId!==0x7523)throw Error('This WebUSB driver supports CH340 1A86:7523 only.');
    this.device=device;this.transportName='WebUSB · CH340';this.stopped=true;this.claimed=false;this.closing=null;
    this.readable={getReader:()=>({read:()=>this.read(),cancel:()=>this.close(),releaseLock(){}})};
    this.writable={getWriter:()=>({write:bytes=>this.write(bytes),releaseLock(){}})};
  }
  static async requestPort(){
    if(!navigator.usb)throw Error('WebUSB is unavailable. Open this page in Android Chrome over HTTPS.');
    const device=await navigator.usb.requestDevice({filters:[{vendorId:0x1a86,productId:0x7523}]});
    return new Ch340UsbPort(device);
  }
  async out(request,value=0,index=0){
    const r=await this.device.controlTransferOut({requestType:'vendor',recipient:'device',request,value:value&0xffff,index:index&0xffff});
    if(r.status!=='ok')throw Error(`CH340 control write failed (${request.toString(16)}: ${r.status}).`);
  }
  async controlRead(request,value=0){
    const r=await this.device.controlTransferIn({requestType:'vendor',recipient:'device',request,value,index:0},2);
    if(r.status!=='ok'||!r.data||r.data.byteLength!==2)throw Error(`CH340 control read failed (${request.toString(16)}).`);
    return r.data;
  }
  async baud(rate){
    let factor=Math.floor(1532620800/rate),divisor=3;
    while(factor>0xfff0&&divisor>0){factor>>=3;divisor--;}
    if(factor>0xfff0)throw Error('Unsupported CH340 baud rate.');
    factor=0x10000-factor;
    await this.out(0x9a,0x1312,(factor&0xff00)|divisor|0x80);
    await this.out(0x9a,0x0f2c,factor&0xff);
  }
  async open({baudRate}){
    if(baudRate!==115200)throw Error('CJP requires 115200 baud.');
    try{
      await this.device.open();
      if(!this.device.configuration)await this.device.selectConfiguration(this.device.configurations[0]?.configurationValue??1);
      let chosen;
      for(const iface of this.device.configuration.interfaces){
        for(const alt of iface.alternates){
          const input=alt.endpoints.find(e=>e.type==='bulk'&&e.direction==='in');
          const output=alt.endpoints.find(e=>e.type==='bulk'&&e.direction==='out');
          if(input&&output){chosen={iface,alt,input,output};break;}
        }
        if(chosen)break;
      }
      if(!chosen)throw Error('CH340 bulk input/output endpoints were not found.');
      this.interfaceNumber=chosen.iface.interfaceNumber;
      await this.device.claimInterface(this.interfaceNumber);this.claimed=true;
      if(chosen.iface.alternate.alternateSetting!==chosen.alt.alternateSetting)await this.device.selectAlternateInterface(this.interfaceNumber,chosen.alt.alternateSetting);
      this.inEndpoint=chosen.input.endpointNumber;this.outEndpoint=chosen.output.endpointNumber;
      this.inSize=chosen.input.packetSize;this.outSize=chosen.output.packetSize;
      if(!this.inSize||!this.outSize)throw Error('Invalid CH340 endpoint packet size.');
      await this.controlRead(0x5f);
      await this.out(0xa1);
      await this.baud(9600);
      await this.controlRead(0x95,0x2518);
      await this.out(0x9a,0x2518,0xc3); // enable RX/TX, 8 data bits, no parity, 1 stop bit
      await this.controlRead(0x95,0x0706);
      await this.out(0xa1,0x501f,0xd90a);
      await this.baud(9600);
      await this.out(0xa4,0xff); // DTR/RTS deasserted
      await this.controlRead(0x95,0x0706);
      await this.baud(baudRate);
      await this.out(0x9a,0x2518,0xc3);
      await this.out(0x9a,0x2727,0); // no hardware flow control
      await this.out(0xa4,0x9f); // assert DTR/RTS; the Uno may reset
      this.stopped=false;
    }catch(e){try{await this.close();}catch{}throw e;}
  }
  async read(){
    while(!this.stopped){
      try{
        const r=await this.device.transferIn(this.inEndpoint,this.inSize);
        if(this.stopped)return {done:true};
        if(r.status!=='ok')throw Error('CH340 USB read failed: '+r.status);
        if(r.data?.byteLength)return {done:false,value:new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength)};
      }catch(e){if(this.stopped)return {done:true};throw e;}
    }
    return {done:true};
  }
  async write(bytes){
    if(this.stopped)throw Error('CH340 disconnected.');
    for(let offset=0;offset<bytes.byteLength;){
      const chunk=bytes.subarray(offset,offset+this.outSize);
      const r=await this.device.transferOut(this.outEndpoint,chunk);
      if(r.status!=='ok'||!r.bytesWritten)throw Error('CH340 USB write failed: '+r.status);
      offset+=r.bytesWritten;
    }
  }
  async close(){
    this.stopped=true;
    if(this.closing)return this.closing;
    // Closing cancels pending WebUSB reads. Waiting for a bulk read before closing
    // would hang whenever the device is idle. Do not wait for such reads here.
    this.closing=(async()=>{if(this.device.opened)await this.device.close();this.claimed=false;})();
    try{await this.closing;}finally{this.closing=null;}
  }
}
if(typeof module!=='undefined')module.exports=Ch340UsbPort;else window.Ch340UsbPort=Ch340UsbPort;
