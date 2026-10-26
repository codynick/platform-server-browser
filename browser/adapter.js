'use strict';
// Keep the tools' renderers and markup: replace only their live transport.
(() => {
  const original=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin!==location.origin)return original(input,options);
    try{
      let data;
      if(url.pathname==='/simulation/state')data=BrowserState.snapshot();
      else if(url.pathname==='/simulation/command')data=BrowserState.command(JSON.parse(options.body||'{}'));
      else if(url.pathname==='/blocks/stage.php'){
        const command=JSON.parse(options.body||'{}'),sprite=BrowserState.get('sprite');
        if(command.action){if(!['configure','keys'].includes(command.action))throw Error('Sprite commands are postponed in this prototype.');for(const key of ['x','y','direction','size','backdrop','keys','mouse'])if(key in command)sprite[key]=command[key];BrowserState.set('sprite',sprite);}
        data={ok:true,state:sprite};
      }
      else if(url.pathname==='/dashboard/cards.php'){
        if(url.searchParams.get('action')==='state')data={ok:true,cards:BrowserState.get('cards')};
        else if(url.searchParams.get('action')==='set'){
          const form=new URLSearchParams(options.body),cards=BrowserState.get('cards');
          const card=cards.find(item=>item.id===Number(form.get('id')));if(!card)throw Error('Unknown local widget');
          card.value=form.get('value');BrowserState.set('cards',cards);data={ok:true};
        }else throw Error('Unknown local dashboard action');
      }else return original(input,options);
      return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
    }catch(error){return new Response(JSON.stringify({ok:false,error:error.message}),{status:400,headers:{'Content-Type':'application/json'}});}
  };
})();
