const vm=require('vm'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const handlers={},menuEvents={},els={};
const element=()=>({clicks:0,events:{},showModal(){this.open=true;},close(){this.open=false;},click(){this.clicks++;},addEventListener(k,f){this.events[k]=f;}});
function menu(id){const summary={focus(){this.focused=true;}};return {open:true,querySelector:()=>summary,addEventListener:(k,f)=>(menuEvents[id]??={})[k]=f,contains:el=>el===id};}
els.projectMenu=menu('file');els.advancedMenu=menu('advanced');
const ctx={window:{CODYNICK_VERSION:'3.10.2',CODYNICK_RELEASE_DATE:'2026-10-27'},document:{getElementById:id=>els[id]??=element(),addEventListener:(k,f)=>handlers[k]=f}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../project-menu.js'),'utf8'),ctx);
assert.equal(els.aboutVersion.textContent,'3.10.2');assert.equal(els.aboutDate.dateTime,'2026-10-27');assert(els.aboutDate.textContent.includes('2026'));
els.menuAbout.onclick();assert(els.aboutDialog.open);els.closeAbout.onclick();assert(!els.aboutDialog.open);
els.menuExamples.onclick();assert(els.examplesDialog.open);assert.equal(els.example.value,'sim-dashboard');els.example.events.dblclick();assert.equal(els.loadExample.clicks,1);els.closeExamples.onclick();assert(!els.examplesDialog.open);
els.menuSave.onclick();assert.equal(els.saveNamed.clicks,1);els.menuUpload.onclick();assert.equal(els.importFile.clicks,1);
handlers.keydown({key:'Escape'});assert(!els.projectMenu.open&&!els.advancedMenu.open);assert(els.projectMenu.querySelector().focused);
els.projectMenu.open=true;els.advancedMenu.open=true;menuEvents.file.toggle();assert(!els.advancedMenu.open);
els.projectMenu.open=true;handlers.click({target:'outside'});assert(!els.projectMenu.open);
els.advancedMenu.open=true;menuEvents.advanced.click({target:{closest:()=>true}});assert(!els.advancedMenu.open);
console.log('PASS: File/Advanced dismissal, example chooser, About version/date and Save/Upload shortcuts');
