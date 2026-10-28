"""Run the real setup script in a temporary filesystem with fake system services.
No packages, certificates, websites or host services are modified by these tests.
"""
import os,pathlib,shutil,subprocess,sys,tempfile,unittest
SOURCE=pathlib.Path(__file__).resolve().parents[1]
DISPATCH=r'''import json,os,pathlib,shutil,sys
name=pathlib.Path(sys.argv[0]).name
root=pathlib.Path(os.environ['FIXTURE_ROOT'])
with (root/'calls').open('a') as f:f.write(name+' '+' '.join(sys.argv[1:])+'\n')
domain=os.environ['CODYNICK_DOMAIN']
if name=='a2ensite':
 p=root/'etc/apache2/sites-enabled'/sys.argv[1]
 if not p.exists():p.symlink_to(root/'etc/apache2/sites-available'/sys.argv[1])
elif name=='certbot':
 if os.environ.get('FAIL_TLS'):sys.exit(1)
 p=root/'etc/apache2/sites-available/tls.conf'
 p.write_text('<VirtualHost *:443>\n ServerName '+domain+'\n</VirtualHost>\n')
 q=root/'etc/apache2/sites-enabled/tls.conf'
 if not q.exists():q.symlink_to(p)
elif name=='getent' and os.environ.get('FAIL_DNS'):sys.exit(1)
elif name=='git':
 args=sys.argv[1:]
 if args[0]=='clone':shutil.copytree(os.environ['FIXTURE_BUNDLE'],args[-1]);pathlib.Path(args[-1],'.git').mkdir()
 elif args[2:]==['remote','get-url','origin']:print('https://github.com/codynick/platform-server-browser.git')
 elif args[2:]==['branch','--show-current']:print('main')
 elif args[2:] in (['status','--porcelain'],['pull','--ff-only','origin','main']):pass
 else:raise RuntimeError('Unexpected git command '+str(args))
'''
class SetupTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.root=pathlib.Path(self.temp.name)
  self.bundle=self.root/'package'
  shutil.copytree(SOURCE,self.bundle,ignore=shutil.ignore_patterns('.git','__pycache__'))
  text=(self.bundle/'setup.sh').read_text()
  for prefix in ['/etc/codynick','/etc/apache2','/var/www','/root/platform-server-browser']:
   text=text.replace(prefix,str(self.root/prefix.lstrip('/')))
  (self.bundle/'setup.sh').write_text(text)
  for d in ['etc/apache2/sites-enabled','etc/apache2/sites-available','root','bin']:(self.root/d).mkdir(parents=True,exist_ok=True)
  for cmd in ['apt-get','apache2ctl','systemctl','a2ensite','certbot','getent','git']:
   p=self.root/'bin'/cmd;p.write_text('#!'+sys.executable+'\n'+DISPATCH);p.chmod(0o755)
  for name in ['install.sh','cas/update.sh']:
   (self.bundle/name).write_text('''#!/bin/bash
set -eu
[[ -f "$FIXTURE_ROOT/etc/apache2/sites-enabled/tls.conf" ]] || exit 91
printf '%s\\n' "'''+name+'''" >> "$FIXTURE_ROOT/deployment"
''')
  self.env=dict(os.environ,PATH=str(self.root/'bin')+':'+os.environ['PATH'],FIXTURE_ROOT=str(self.root),FIXTURE_BUNDLE=str(self.bundle),CODYNICK_DOMAIN='code.codynick.com')
 def run_setup(self,raw=False,**env):
  entry=self.bundle/'setup.sh'
  if raw:
   entry=self.root/'downloaded/setup.sh';entry.parent.mkdir(exist_ok=True);shutil.copyfile(self.bundle/'setup.sh',entry)
  return subprocess.run(['bash',str(entry)],env=dict(self.env,**env),capture_output=True,text=True)
 def test_fresh_then_repeat_package(self):
  for _ in range(2):
   result=self.run_setup();self.assertEqual(result.returncode,0,result.stdout+result.stderr)
  self.assertEqual((self.root/'deployment').read_text().splitlines(),['install.sh','cas/update.sh']*2)
  self.assertFalse(any(line.startswith('git ') for line in (self.root/'calls').read_text().splitlines()),'ZIP install must use its bundled source')
  self.assertEqual(len(list((self.root/'etc/apache2/sites-enabled').iterdir())),2)
 def test_actual_static_deployment_after_https_and_repeat(self):
  script=(SOURCE/'install.sh').read_text().replace('/var/www',str(self.root/'var/www')).replace('/root/codynick-portal-backup-',str(self.root/'root/codynick-portal-backup-'))
  (self.bundle/'install.sh').write_text(script)
  for _ in range(2):
   result=self.run_setup();self.assertEqual(result.returncode,0,result.stdout+result.stderr)
  html=(self.root/'var/www/code.codynick.com/blocks/index.html').read_text()
  self.assertIn('id="headerExamples"',html)
  self.assertTrue((self.root/'var/www/code.codynick.com/blocks/accounts.js').exists())
  self.assertEqual(len(list((self.root/'root').glob('codynick-portal-backup-*'))),2)
 def test_download_bootstrap_clones_correct_repo_then_updates(self):
  for _ in range(2):
   result=self.run_setup(raw=True);self.assertEqual(result.returncode,0,result.stdout+result.stderr)
  calls=(self.root/'calls').read_text()
  self.assertIn('clone --branch main --single-branch https://github.com/codynick/platform-server-browser.git',calls)
  self.assertIn('pull --ff-only origin main',calls)
 def test_tls_failure_stops_before_deployment_and_retry_works(self):
  result=self.run_setup(FAIL_TLS='1');self.assertNotEqual(result.returncode,0)
  self.assertFalse((self.root/'deployment').exists())
  result=self.run_setup();self.assertEqual(result.returncode,0,result.stdout+result.stderr)
 def test_dns_failure_stops_before_deployment(self):
  self.assertNotEqual(self.run_setup(FAIL_DNS='1').returncode,0)
  self.assertFalse((self.root/'deployment').exists())
 def test_invalid_domain_rejected_before_package_install(self):
  self.assertNotEqual(self.run_setup(CODYNICK_DOMAIN='https://code.codynick.com').returncode,0)
  self.assertFalse((self.root/'calls').exists())
if __name__=='__main__':unittest.main(verbosity=2)
