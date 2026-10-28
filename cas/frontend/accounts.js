'use strict';
(async()=>{
 const editor=window.CodyAccountEditor;
 const initialAccount=localStorage.getItem('codynick-active-account');

 let user,csrf,current=null,checked=false,busy=false;
 let observed=initialAccount,generation=0,reloading=false;
 const toolbar=editor?document.querySelector('.toolbar'):null;
 const label=document.createElement('span'),sign=document.createElement('button'),out=document.createElement('button');
 label.textContent='';label.className='account-name';sign.textContent='Sign in';out.textContent='Sign out';
 const account=document.createElement('div');account.className='account-controls';account.setAttribute('aria-label','CodyNick account');
 sign.onclick=()=>{if(confirm('Sign in will reload this page. Download unsaved work first. Continue?'))location.href='/auth/login';};
 label.style.visibility='visible';
 if(toolbar){account.append(sign,out,label);toolbar.append(account);}
 const say=m=>editor?editor.status(m):console.info(m);
 async function api(path,method='GET',data){
  const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf||''},body:data?JSON.stringify(data):undefined});
  const result=await r.json();if(!r.ok)throw Error(result.error||'Request failed');return result;
 }
 function clear(wipe){
  editor?.reset();current=null;
  if(wipe)for(const k of ['codynick-live-state-v1','codynick-dashboard-layout-v1'])localStorage.removeItem(k);
  // The editor resets in place: reloading it also recreates both live iframes.
  // Each standalone/embedded live view reloads at most once to drop its memory.
  if(!editor&&!reloading){reloading=true;location.reload();}
 }
 function accountChanged(marker,wipe){
  if(observed===marker)return;
  observed=marker;generation++;user=null;csrf=null;current=null;
  sign.hidden=false;out.hidden=true;label.textContent='';
  document.body.style.visibility='hidden';
  clear(wipe);
 }
 let checking=false,refreshPending=false;
 async function check(){
  if(checking||reloading)return;checking=true;
  const started=generation;
  try{
   const data=await api('/api/me'),next=data.user?.user_id||null;
   // Discard an answer started before another tab's account transition.
   if(started!==generation)return;
   const marker=next||'__guest__';
   const previous=localStorage.getItem('codynick-active-account');
   accountChanged(marker,previous!==marker);
   if(previous!==marker)localStorage.setItem('codynick-active-account',marker);
   user=data.user;csrf=data.csrf;checked=true;
   if(reloading)return;
   document.body.style.visibility='visible';
   
   label.textContent=user?(user.name||user.user_id):'';sign.hidden=!!user;out.hidden=!user;
  }catch(e){label.textContent='';sign.disabled=true;out.disabled=true;sign.title='Account service unavailable. Reload to retry.';csrf=null;}finally{checking=false;if(refreshPending){refreshPending=false;void check();}}
 }
 out.onclick=async()=>{if(busy||!confirm('Sign out of CodyNick and the central account? Download unsaved changes first. This may affect sign-in to other CodyNick services.'))return;busy=true;try{const result=await api('/auth/logout','POST');accountChanged('__guest__',true);localStorage.setItem('codynick-active-account','__guest__');location.href=result.logout_url;}catch(e){say(e.message);}finally{busy=false;}};
 if(editor){
  const examples=document.getElementById('headerExamples');
  if(examples)examples.onclick=()=>document.getElementById('menuExamples').click();
  const save=async()=>{
   if(busy)return;
   if(!user){say('Sign in to save a private account project, or use Download Project.');return;}
   busy=true;
   try{
    const title=document.getElementById('designName').value.trim()||'Untitled';
    const data={title,project:editor.project()};
    // A changed title creates a new project; same title updates only the loaded/saved project.
    const existing=current&&current.title===title;
    if(existing)data.revision=current.revision;
    current=await api('/api/projects'+(existing?'/'+current.id:''),existing?'PUT':'POST',data);
    say('Saved privately to your account.');
   }catch(e){say(e.message);}finally{busy=false;}
  };
  document.getElementById('saveNamed').onclick=save;
  document.getElementById('loadNamed').onclick=async()=>{
   if(window.blockProgramRunning){say('Stop the program before loading.');return;}
   try{
    if(!user)throw Error('Sign in to load your account projects.');
    const data=await api('/api/projects');const select=document.getElementById('designList');select.replaceChildren();
    for(const p of data.projects){const o=document.createElement('option');o.value=p.id;o.textContent=p.title;select.append(o);}
    document.getElementById('designDialogTitle').textContent='My private projects';document.getElementById('designListStatus').textContent='Saved in your CodyNick account';
    document.getElementById('designDialog').showModal();
   }catch(e){say(e.message);}
  };
  document.getElementById('loadNamedConfirm').onclick=async()=>{
   try{
    const id=document.getElementById('designList').value;if(!id)return;
    const p=await api('/api/projects/'+id);
    if(!confirm('Replace the workspace with “'+p.title+'”? Download unsaved work first.'))return;
    editor.load(p.project.workspace);current={id:p.id,title:p.title,revision:p.revision};document.getElementById('designName').value=p.title;document.getElementById('designDialog').close();say('Private project loaded.');
   }catch(e){say(e.message);}
  };
  const del=document.createElement('button');del.textContent='Delete selected';document.querySelector('#designDialog .design-actions').prepend(del);
  del.onclick=async()=>{const id=document.getElementById('designList').value;if(!id||!confirm('Permanently delete the selected account project?'))return;try{await api('/api/projects/'+id,'DELETE');if(current?.id===id)current=null;document.getElementById('designDialog').close();say('Project deleted.');}catch(e){say(e.message);}};
  for(const id of ['newProject','loadExample','importFile'])document.getElementById(id).addEventListener(id==='importFile'?'change':'click',()=>{current=null;});
 }
 window.addEventListener('storage',e=>{
  if(e.key!=='codynick-active-account')return;
  // Storage notifications are one-way: never echo a notification or write back
  // a cached identity. Checking happens on the next poll/focus after cleanup.
  const marker=localStorage.getItem('codynick-active-account');
  accountChanged(marker,false);
  if(checking)refreshPending=true;else void check();
 });
 await check();setInterval(()=>{if(!document.hidden)return check();},15000);window.addEventListener('focus',check);
})();
