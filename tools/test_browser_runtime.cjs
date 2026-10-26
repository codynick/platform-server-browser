const fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),ide=path.join(root,'upstream/components/ide'),simDir=path.join(root,'upstream/components/simulator');
const local=!process.env.BASE_URL,base=process.env.BASE_URL||'http://browser.local';
const packages=fs.readdirSync(path.join(ide,'blocks/blocks')).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(ide,'blocks/blocks',n),'utf8')));
function fixture(file,account='alice'){
 const normalized=file.replaceAll('\\','/');
 let text=fs.readFileSync(file,'utf8');if(text.includes('<?'))text=text.slice(text.search(/<!doctype html>/i));
 text=text.replace(/<\?= json_encode\(\$BLOCK_PACKAGES,[\s\S]*?\?>/,JSON.stringify(packages)).replace(/<\?= json_encode\(\$BLOCK_WARNINGS,[\s\S]*?\?>/,'[]').replace(/<\?= \(int\)\$poll_interval_ms \?>/,'500').replace(/<\?=[\s\S]*?\?>/g,'CodyNick');
 if(file.startsWith(simDir))text=text.replaceAll('href="/','href="/simulation/').replaceAll('src="/','src="/simulation/');
 let scripts=`<script>window.CODY_BROWSER_ACCOUNT=${JSON.stringify(account)};</script><script src="/assets/browser-state.js"></script><script src="/assets/browser-adapter.js"></script>`;
 if(normalized.includes('blocks/index.php'))scripts+='<script src="/assets/browser-generator.js"></script><script src="/assets/browser-runtime.js"></script>';
 if(normalized.includes('dashboard/index.php'))text=text.replace('</body>','<script>BrowserState.subscribe(m=>{if(m.key==="cards")pollState();});</script></body>');
 return text.replace('</head>',scripts+'</head>');
}
const design=n=>JSON.parse(fs.readFileSync(path.join(root,'upstream/components/examples/blockly',fs.readdirSync(path.join(root,'upstream/components/examples/blockly')).find(f=>f.startsWith('0'+n+'_'))),'utf8'));
const wait=async(fn,message)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error(message);};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
 try{
  const context=await browser.newContext(),errors=[],live=[];
  context.on('page',page=>page.on('pageerror',error=>{errors.push(error.message);console.error('Browser:',error.message);}));
  context.on('request',request=>{const u=new URL(request.url());if(/\/simulation\/(?:state|command)$|\/dashboard\/cards.php$|\/blocks\/stage.php$/.test(u.pathname)||u.searchParams.get('api')==='run')live.push(request.url());});
  if(local)await context.route(base+'/**',route=>{
   const u=new URL(route.request().url()),p=u.pathname;
   if(u.searchParams.has('api'))return route.fulfill({json:{ok:true,workspace:{blocks:{languageVersion:0,blocks:[]}}}});
   if(p==='/blocks/')return route.fulfill({contentType:'text/html',body:fixture(path.join(ide,'blocks/index.php'))});
   if(p==='/dashboard/')return route.fulfill({contentType:'text/html',body:fixture(path.join(ide,'dashboard/index.php'),u.searchParams.get('account')||'alice')});
   if(p==='/simulation/')return route.fulfill({contentType:'text/html',body:fixture(path.join(simDir,'index.html'))});
   if(p==='/simulation/app.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(simDir,'app.js'),'utf8').replace("history.replaceState(null, '', '/');","history.replaceState(null, '', '/simulation/');").replaceAll("fetch('/","fetch('/simulation/").replaceAll('src="/','src="/simulation/')});
   const file=p.startsWith('/assets/browser-')?path.join(root,'browser',p.slice('/assets/browser-'.length)):p.startsWith('/simulation/')?path.join(simDir,p.slice('/simulation/'.length)):path.join(ide,p.slice(1));
   if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});return route.fulfill({status:404,body:''});
  });
  const code=await context.newPage();
  if(!local){await code.goto(base+'/login');await code.fill('#username','alice');await code.fill('#password','OnlyForEphemeralCI123');await Promise.all([code.waitForURL(base+'/'),code.click('button[type=submit]')]);}
  await code.goto(base+'/blocks/');await code.waitForFunction(()=>typeof BrowserRunner!=='undefined');await code.evaluate(()=>BrowserRunner.ready);
  const sim=await context.newPage(),dash=await context.newPage();await sim.goto(base+'/simulation/');await dash.goto(base+'/dashboard/');
  await sim.waitForFunction(()=>typeof scene!=='undefined'&&scene!==null,{},{timeout:5000}).catch(async error=>{console.error(await sim.evaluate(()=>({status:document.getElementById('connection')?.textContent,hasState:typeof BrowserState,hasPoll:typeof poll,errors:document.body.textContent.slice(0,30)})));throw error;});await sim.evaluate(async()=>{for(const kind of ['temperature','seven','ultrasonic'])await addGadget(kind);});
  const load=async n=>code.evaluate(data=>{BrowserRunner.stop();Blockly.serialization.workspaces.load(data,workspace);document.getElementById('executionTarget').value='simulator';},design(n));
  await load(1);await code.evaluate(()=>BrowserRunner.ready);await new Promise(r=>setTimeout(r,150));
  // After all assets have loaded, programs and cross-tab updates must survive offline.
  await context.setOffline(true);await code.evaluate(()=>runProgram());
  await wait(()=>dash.evaluate(()=>BrowserState.get('cards').some(c=>c.type==='graph'&&JSON.parse(c.value).length>=2)),'No local graph samples');
  await sim.evaluate(()=>{const input=document.getElementById('temperatureValue');input.value='32.5';input.dispatchEvent(new Event('input'));});
  await wait(()=>dash.evaluate(()=>BrowserState.get('cards').some(c=>c.type==='gauge'&&Number(c.value)===32.5)),'Temperature did not reach separate dashboard tab');
  await wait(()=>sim.evaluate(()=>document.getElementById('displayValue').textContent==='32.5'),'Live seven-segment did not update');
  await load(2);await code.evaluate(()=>runProgram());
  await wait(()=>sim.evaluate(()=>BrowserState.snapshot().leds[6]==='#FF0000'),'Traffic light not red');
  await sim.evaluate(()=>{const input=document.getElementById('temperatureValue');input.value='18';input.dispatchEvent(new Event('input'));});
  await wait(()=>sim.evaluate(()=>BrowserState.snapshot().leds[6]==='#0000FF'),'Traffic light not blue');
  await load(3);await code.evaluate(()=>runProgram());await sim.evaluate(()=>{const input=document.getElementById('distanceValue');input.value='5';input.dispatchEvent(new Event('input'));});
  await wait(()=>sim.evaluate(()=>BrowserState.snapshot().leds[6]==='#FF0000'),'Parking assistant did not react');
  await load(4);await code.evaluate(()=>runProgram());await sim.evaluate(()=>BrowserState.command({action:'input',device:'cjp',states:['UP']}));
  await wait(()=>dash.evaluate(()=>BrowserState.get('cards').some(c=>c.value==='Up')),'Joystick status missing');
  await code.evaluate(()=>stopProgram());assert.equal(await sim.evaluate(()=>BrowserState.snapshot().connected),false);
  assert.equal(await dash.evaluate(()=>BrowserState.get('cards').length),1,'Stop removed local cards');
  await load(1);await sim.evaluate(()=>{const value=BrowserState.get('scene');delete value.gadgets.seven;BrowserState.command({action:'scene',scene:value});});await code.evaluate(()=>runProgram());
  assert((await code.evaluate(()=>BrowserState.get('output').error)).includes('then re-run the app'));
  assert.equal(live.length,0,'Live APIs reached the remote server: '+live.join(','));
  await context.setOffline(false);
  await code.setViewportSize({width:1440,height:960});await sim.setViewportSize({width:1440,height:960});await dash.setViewportSize({width:1280,height:800});
  fs.mkdirSync(path.join(root,'test-output'),{recursive:true});
  await code.screenshot({path:path.join(root,'test-output/browser-blocks.png')});await sim.screenshot({path:path.join(root,'test-output/browser-simulator.png')});await dash.screenshot({path:path.join(root,'test-output/browser-dashboard.png')});
  if(local){const bob=await context.newPage();await bob.goto(base+'/dashboard/?account=bob');assert.equal(await bob.evaluate(()=>BrowserState.get('cards').length),0);}
  assert.deepEqual(errors,[]);
  console.log('Four demos run offline across unchanged separate pages; live APIs stay local, Stop retains cards, missing gadgets prompt rerun, account namespace checked.');
 }finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
