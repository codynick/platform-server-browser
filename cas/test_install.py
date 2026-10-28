"""Exercise the installer's exact Apache patch in an isolated fixture."""
import ast,pathlib,re,subprocess,tempfile
source=pathlib.Path(__file__).with_name('update.sh').read_text()
blocks=re.findall(r"<<'PY'\n(.*?)\nPY",source,re.S)
for code in blocks:ast.parse(code)
config_code=re.search(r"<<'PYCFG'\n(.*?)\nPYCFG",source,re.S).group(1)
ast.parse(config_code)
patch=next(code for code in blocks if 'LogFormat' in code)
with tempfile.TemporaryDirectory() as temp:
 root=pathlib.Path(temp);sites=root/'enabled';sites.mkdir()
 p=sites/'portal.conf'
 original='''<VirtualHost *:80>
 ServerName ide.codynick.com
 CustomLog /var/log/apache2/http.log combined
</VirtualHost>
<VirtualHost *:443>
 ServerName ide.codynick.com
 DocumentRoot /var/www/ide.codynick.com
 CustomLog /var/log/apache2/portal.log combined
</VirtualHost>
<VirtualHost *:443>
 ServerName other.codynick.com
 CustomLog /var/log/apache2/other.log combined
</VirtualHost>
'''
 p.write_text(original)
 code=patch.replace('/etc/apache2/sites-enabled',str(sites))
 subprocess.run(['python3','-c',code,'ide.codynick.com'],check=True)
 updated=p.read_text()
 assert updated.count('# CodyNick CAS integration')==1
 assert 'http.log combined' in updated and 'other.log combined' in updated
 assert 'portal.log codynick_private' in updated
 assert '%m %U %H' in updated and '%r' not in updated
 subprocess.run(['python3','-c',code,'ide.codynick.com'],check=True)
 assert updated==p.read_text(),'patch must be idempotent'
with tempfile.TemporaryDirectory() as temp:
 import json
 from urllib.parse import urlsplit,parse_qs
 config=pathlib.Path(temp)/'config.json'
 config.write_text(json.dumps({'CAS_BASE_URL':'https://id.codynick.com/cas','CAS_ID_ATTRIBUTE':'uid','CAS_LOGOUT_URL':'https://id.codynick.com/custom/logout?keep=yes&service=https%3A%2F%2Fold.example%2Fblocks%2F'}))
 code=config_code.replace('/etc/codynick-cas/config.json',str(config))
 for domain in ['code.codynick.com','another.example']:
  subprocess.run(['python3','-c',code,domain],check=True)
  data=json.loads(config.read_text())
  assert data['PUBLIC_ORIGIN']=='https://'+domain
  assert data['CAS_ID_ATTRIBUTE']=='uid'
  q=parse_qs(urlsplit(data['CAS_LOGOUT_URL']).query)
  assert q['service']==['https://'+domain+'/blocks/'] and q['keep']==['yes']
  before=config.read_text();subprocess.run(['python3','-c',code,domain],check=True)
  assert before==config.read_text()
for name in ['update.sh','rollback.sh']:
 subprocess.run(['bash','-n',str(pathlib.Path(__file__).with_name(name))],check=True)
print('PASS: embedded Python parsing, targeted Apache patch, idempotency, shell syntax')
