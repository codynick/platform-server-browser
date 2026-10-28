#!/bin/bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root.'; exit 1; }
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
domain=${CODYNICK_DOMAIN:-}
if [[ -z $domain && -f /etc/codynick-cas/config.json ]]; then
 domain=$(python3 - <<'PYDOMAIN'
import json
from urllib.parse import urlsplit
with open('/etc/codynick-cas/config.json') as f:c=json.load(f)
print(c.get('DOMAIN') or urlsplit(c.get('PUBLIC_ORIGIN','')).hostname or '')
PYDOMAIN
)
fi
if [[ -z $domain && -f /etc/codynick/domain ]]; then read -r domain < /etc/codynick/domain; fi
if [[ -z $domain ]]; then read -rp 'Existing website domain (e.g. ide.codynick.com): ' domain; fi
[[ $domain =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ && $domain != *..* ]] || exit 1
domain=${domain,,}
root=/var/www/$domain
[[ -f $root/blocks/blocks.js ]] || { echo "Existing editor not found: $root"; exit 1; }
# Defaults allow unattended setup; environment overrides customize a new server.
cas=${CAS_BASE_URL:-https://id.codynick.com/cas}
validate=${CAS_VALIDATE_URL:-$cas/p3/serviceValidate}
idattr=${CAS_ID_ATTRIBUTE:-__principal__}
nameattr=${CAS_NAME_ATTRIBUTE:-name}
emailattr=${CAS_EMAIL_ATTRIBUTE:-email}
if [[ ! -f /etc/codynick-cas/config.json && -t 0 ]]; then
 echo 'First installation: confirm the settings of your existing CAS server.'
 read -rp "CAS base URL [$cas]: " cas_input
 cas=${cas_input:-$cas}
 validate=${CAS_VALIDATE_URL:-$cas/p3/serviceValidate}
 read -rp "CAS validation URL [$validate]: " cas_input
 validate=${cas_input:-$validate}
 read -rp "Stable CodyNick ID attribute [$idattr; __principal__ means CAS user]: " cas_input
 idattr=${cas_input:-$idattr}
 read -rp "Name attribute [$nameattr]: " cas_input
 nameattr=${cas_input:-$nameattr}
 read -rp "Email attribute [$emailattr]: " cas_input
 emailattr=${cas_input:-$emailattr}
fi
apt-get update
apt-get install -y python3-venv python3-pip apache2 curl
backup=$(mktemp -d /root/codynick-cas-backup-XXXXXXXX)
cp -a "$root/blocks" "$root/simulator" "$root/dashboard" "$backup/"
mkdir -p "$backup/apache"
cp -a /etc/apache2/sites-available "$backup/apache/"
for dir in /opt/codynick-cas /etc/codynick-cas; do
 if [[ -e $dir ]]; then cp -a "$dir" "$backup/$(basename "$dir")-$(basename "$(dirname "$dir")")"; fi
done
[[ ! -e /etc/systemd/system/codynick-cas.service ]] || cp -a /etc/systemd/system/codynick-cas.service "$backup/"
printf '%s\n' "$domain" > "$backup/domain"
cp rollback.sh "$backup/rollback.sh"
echo "Backup: $backup"
trap 'echo "Update failed. Restoring previous deployment."; bash "$backup/rollback.sh"' ERR
id codynick-cas >/dev/null 2>&1 || useradd --system --home-dir /var/lib/codynick-cas --shell /usr/sbin/nologin codynick-cas
install -d -m 750 -o codynick-cas -g codynick-cas /var/lib/codynick-cas
install -d -m 755 /opt/codynick-cas
install -d -m 700 /etc/codynick-cas
if [[ -f /var/lib/codynick-cas/projects.sqlite3 ]]; then
 python3 - "$backup/database.sqlite3" <<'PY'
import sqlite3,sys
with sqlite3.connect('/var/lib/codynick-cas/projects.sqlite3') as src, sqlite3.connect(sys.argv[1]) as dst:src.backup(dst)
PY
fi
if [[ ! -f /etc/codynick-cas/config.json ]]; then
 python3 - "$domain" "$cas" "$validate" "$idattr" "$nameattr" "$emailattr" <<'PY'
import json,sys
from urllib.parse import urlsplit
v=sys.argv[1:]
for u in v[1:3]:
 p=urlsplit(u)
 if p.scheme!='https' or not p.hostname or p.query or p.fragment or p.username:raise SystemExit('CAS URLs must be plain HTTPS URLs without query/userinfo')
c=dict(zip(['DOMAIN','CAS_BASE_URL','CAS_VALIDATE_URL','CAS_ID_ATTRIBUTE','CAS_NAME_ATTRIBUTE','CAS_EMAIL_ATTRIBUTE'],v))
c['PUBLIC_ORIGIN']='https://'+v[0]
with open('/etc/codynick-cas/config.json','w') as f:json.dump(c,f,indent=2)
PY
fi
# Derive deployment-specific URLs on EVERY install, including another VPS.
python3 - "$domain" <<'PYCFG'
import json,sys
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode
p='/etc/codynick-cas/config.json'
with open(p) as f:c=json.load(f)
c['DOMAIN']=sys.argv[1];c['PUBLIC_ORIGIN']='https://'+sys.argv[1]
u=urlsplit(c.get('CAS_LOGOUT_URL') or c['CAS_BASE_URL'].rstrip('/')+'/logout')
q=[(k,v) for k,v in parse_qsl(u.query,keep_blank_values=True) if k!='service']
q.append(('service',c['PUBLIC_ORIGIN']+'/blocks/'))
c['CAS_LOGOUT_URL']=urlunsplit((u.scheme,u.netloc,u.path,urlencode(q),u.fragment))
with open(p,'w') as f:json.dump(c,f,indent=2)
PYCFG
chmod 600 /etc/codynick-cas/config.json
cp backend/app.py backend/requirements.txt /opt/codynick-cas/
python3 -m venv /opt/codynick-cas/venv
/opt/codynick-cas/venv/bin/pip install -r /opt/codynick-cas/requirements.txt
cat > /opt/codynick-cas/start.py <<'PY'
import json,os
with open('/etc/codynick-cas/config.json') as f:config=json.load(f)
for k,v in config.items():os.environ[k]=v
os.umask(0o077)
# Loaded as root only to read configuration, then gunicorn drops privileges.
os.execv('/opt/codynick-cas/venv/bin/gunicorn',['gunicorn','--bind','127.0.0.1:8791','--workers','2','--user','codynick-cas','--group','codynick-cas','--chdir','/opt/codynick-cas','--error-logfile','-','--timeout','30','app:app'])
PY
cat > /etc/systemd/system/codynick-cas.service <<'UNIT'
[Unit]
Description=CodyNick CAS and private projects
After=network.target
[Service]
ExecStart=/opt/codynick-cas/venv/bin/python /opt/codynick-cas/start.py
Restart=on-failure
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/codynick-cas
[Install]
WantedBy=multi-user.target
UNIT
python3 patch_frontend.py "$root"
install -m 644 frontend/accounts.js frontend/accounts.css "$root/blocks/"
a2enmod proxy proxy_http headers
python3 - "$domain" <<'PY'
import pathlib,re,sys
name=sys.argv[1]
found=False
for link in pathlib.Path('/etc/apache2/sites-enabled').glob('*'):
 p=link.resolve();s=p.read_text()
 def edit(m):
  global found
  block=m.group()
  if not re.search(r'^\s*ServerName\s+'+re.escape(name)+r'\s*$',block,re.M|re.I) or not re.search(r'<VirtualHost\s+[^>]*:443\s*>',block,re.I):return block
  found=True
  # Refresh older integration settings as well as first-time installations.
  block=re.sub(r'\n # CodyNick CAS integration.*?</FilesMatch>\n', '', block, flags=re.S)
  block=re.sub(r'\n <Location "/auth/confirm">.*?</Location>\n', '', block, flags=re.S)
  # Preserve access logs without recording query strings (CAS tickets).
  block=re.sub(r'(^\s*CustomLog\s+\S+)\s+\S+.*$',r'\1 codynick_private',block,flags=re.M)
  settings='''
 # CodyNick CAS integration
 LogFormat "%h %l %u %t \\"%m %U %H\\" %>s %b" codynick_private
 ProxyPass /auth/ http://127.0.0.1:8791/auth/
 ProxyPassReverse /auth/ http://127.0.0.1:8791/auth/
 ProxyPass /api/ http://127.0.0.1:8791/api/
 ProxyPassReverse /api/ http://127.0.0.1:8791/api/
 <LocationMatch "^/(auth|api)/">
  Header always set Cache-Control "no-store"
  Header always set Referrer-Policy "no-referrer"
 </LocationMatch>
 <FilesMatch "^(index\\.html|blocks\\.js|accounts\\.js)$">
  Header always set Cache-Control "no-store"
 </FilesMatch>
 <Location "/auth/confirm">
  Header always set Referrer-Policy "same-origin"
 </Location>
'''
  return block.replace('</VirtualHost>',settings+'\n</VirtualHost>')
 new=re.sub(r'<VirtualHost\b[^>]*>.*?</VirtualHost>',edit,s,flags=re.S|re.I)
 if new!=s:p.write_text(new)
if not found:raise SystemExit('No enabled HTTPS VirtualHost with exact ServerName '+name+'. Configure it first.')
PY
apache2ctl configtest
systemctl daemon-reload
systemctl enable --now codynick-cas
systemctl restart codynick-cas
systemctl reload apache2
curl --fail --silent --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:8791/api/me
trap - ERR
printf '\nInstalled CAS test update. Open https://%s/blocks/ and Ctrl+F5.\nRollback: bash %s/rollback.sh\n' "$domain" "$backup"
printf 'CAS exact login service: https://%s/auth/callback\nCAS exact logout return service: https://%s/blocks/\n' "$domain" "$domain"
