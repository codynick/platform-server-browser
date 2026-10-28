import pathlib,sys,re
root=pathlib.Path(sys.argv[1])
p=root/'blocks/blocks.js';s=p.read_text()
if 'CodyAccountEditor' not in s:
 start=s.index('function save(){try{localStorage.setItem(key,')
 end=s.index('\nworkspace.addChangeListener',start)
 s=s[:start]+"function save(){/* Account work stays in memory until explicit server Save. */}"+s[end:]
 start=s.index('try{const previous=localStorage.getItem(key);')
 end=s.index('\n})();',start)
 s=s[:start]+'''window.CodyAccountEditor={
 project:()=>({format:'codynick-webserial',version:2,workspace:B.serialization.workspaces.save(workspace)}),
 load,status,reset:()=>{runtime.stop();workspace.clear();$('designName').value='';}
};
load(example('blink'));
'''+s[end:]
 p.write_text(s)
for page in ['blocks/index.html','simulator/index.html','dashboard/index.html']:
 p=root/page;s=p.read_text()
 if '/blocks/accounts.js' not in s:s=s.replace('</head>','<style>body{visibility:hidden}</style><script src="/blocks/accounts.js" defer></script></head>')
 s=re.sub(r'/blocks/accounts\.js(?:\?[^\"]*)?', '/blocks/accounts.js?v=20261027-header5', s)
 if page.startswith('blocks/'):
  if 'id="headerExamples"' not in s:
   s=s.replace('<button id="toggleSpaces">','<button id="headerExamples" title="Open example projects">Examples</button>\n      <button id="toggleSpaces">')
  s=s.replace('Saved on this device','Private projects in your account').replace('Projects and dashboard layouts are saved locally in your browser.','Sign in to save private projects to your account. Download to keep guest work.').replace('Save named project in this browser','Save private account project').replace('Load a project saved in this browser','Load private account project')
 if page.startswith('blocks/') and '/blocks/accounts.css' not in s:
  s=s.replace('</head>','<link rel="stylesheet" href="/blocks/accounts.css?v=20261027-header5"></head>')
 s=re.sub(r'/blocks/accounts\.css(?:\?[^\"]*)?', '/blocks/accounts.css?v=20261027-header5', s)
 p.write_text(s)

# Apply on both first-time and already-patched installations.
p=root/'blocks/live-store.js'
s=p.read_text()
old="if(s&&s.scene?.gadgets&&s.widgets){memory={...defaults(),...s};}"
new="if(s&&s.scene?.gadgets&&s.widgets){memory={...defaults(),...s};}else{memory=defaults();}"
if new not in s and old in s:s=s.replace(old,new);p.write_text(s)
