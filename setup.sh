#!/usr/bin/env bash
set -euo pipefail
trap 'echo "Setup/update failed at line $LINENO. Fix the reported error and rerun the same command; no OS reinstall is needed." >&2' ERR
[[ ${EUID} -eq 0 ]] || { echo 'Run as root (sudo bash setup.sh).' >&2; exit 1; }
command -v apt-get >/dev/null || { echo 'This installer supports Debian/Ubuntu with apt-get.' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
settings_dir=/etc/codynick
saved_domain=$settings_dir/domain
domain=${CODYNICK_DOMAIN:-}
if [[ -z $domain && -f $saved_domain ]]; then domain=$(cat "$saved_domain"); fi
if [[ -z $domain ]]; then
 [[ -t 0 ]] || { echo 'Set CODYNICK_DOMAIN or run from an interactive terminal on first setup.' >&2; exit 1; }
 read -rp 'Website domain (for example code.codynick.com): ' domain
fi
domain=${domain,,}
[[ ${#domain} -le 253 && "$domain" == *.* ]] || { echo 'Enter a domain without https://, path or port.' >&2; exit 1; }
IFS='.' read -r -a labels <<< "$domain"
for label in "${labels[@]}"; do
 [[ ${#label} -le 63 && $label =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || { echo "Invalid domain: $domain" >&2; exit 1; }
done
[[ $domain != *. && ! $domain =~ ^[0-9.]+$ ]] || exit 1
export DEBIAN_FRONTEND=noninteractive
install -d -m 700 "$settings_dir"
printf '%s\n' "$domain" > "$saved_domain"
chmod 600 "$saved_domain"
webroot=/var/www/$domain
printf 'Installing/updating CodyNick for %s\n' "$domain"
echo '[1/6] Installing server dependencies'
apt-get update
apt-get install -y git ca-certificates apache2 certbot python3-certbot-apache python3-venv python3-pip curl

echo '[2/6] Selecting complete source package'
# A full ZIP installs its own source. A raw setup.sh download fetches GitHub.
if [[ -f $source_dir/VERSION && -f $source_dir/install.sh && -f $source_dir/cas/update.sh ]]; then
 repo=$source_dir
 echo "Using the supplied complete package: $repo"
else
 repo=/root/platform-server-browser
 if [[ -e $repo ]]; then
  [[ -d $repo/.git ]] || { echo "$repo is not a Git checkout. Use the complete package setup.sh instead." >&2; exit 1; }
  [[ $(git -C "$repo" remote get-url origin) =~ ^https://github.com/codynick/platform-server-browser(\.git)?$ ]] || { echo 'Unexpected repository origin.' >&2; exit 1; }
  [[ -z $(git -C "$repo" status --porcelain) ]] || { echo 'Server checkout has local changes; preserve them before updating.' >&2; exit 1; }
  [[ $(git -C "$repo" branch --show-current) == main ]] || { echo 'Server checkout must be on main.' >&2; exit 1; }
  git -C "$repo" pull --ff-only origin main
 else
  git clone --branch main --single-branch https://github.com/codynick/platform-server-browser.git "$repo"
 fi
fi
for required in VERSION install.sh cas/update.sh cas/patch_frontend.py cas/backend/app.py cas/frontend/accounts.js cas/frontend/accounts.css blocks/index.html; do
 [[ -f $repo/$required ]] || { echo "Incomplete source package: $required" >&2; exit 1; }
done

echo '[3/6] Creating/checking HTTP site'
mkdir -p "$webroot"
# Match exact ServerName declarations rather than substring matches in -S output.
if ! python3 - "$domain" <<'PY'
import pathlib,re,sys
for link in pathlib.Path('/etc/apache2/sites-enabled').glob('*'):
 text=link.read_text()
 if re.search(r'^\s*ServerName\s+'+re.escape(sys.argv[1])+r'\s*$',text,re.M|re.I):sys.exit(0)
sys.exit(1)
PY
then
 config=/etc/apache2/sites-available/codynick-$domain.conf
 if [[ ! -e $config ]]; then
  cat > "$config" <<EOF
<VirtualHost *:80>
    ServerName $domain
    DocumentRoot $webroot
    <Directory $webroot>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>
    ErrorLog \${APACHE_LOG_DIR}/codynick-$domain-error.log
    CustomLog \${APACHE_LOG_DIR}/codynick-$domain-access.log combined
</VirtualHost>
EOF
 else
  echo "Re-enabling existing site: $config"
 fi
 a2ensite "codynick-$domain.conf"
fi
apache2ctl configtest
systemctl enable --now apache2
systemctl reload apache2

echo '[4/6] Obtaining/checking HTTPS BEFORE deployment'
getent ahosts "$domain" >/dev/null || { echo "DNS must point $domain to this VPS before installation." >&2; exit 1; }
echo 'Inbound TCP ports 80 and 443 must be reachable.'
certbot --apache --non-interactive --agree-tos --register-unsafely-without-email --redirect --keep-until-expiring -d "$domain"
apache2ctl configtest
systemctl reload apache2
# Fail before deployment if Certbot did not create the requested TLS virtual host.
python3 - "$domain" <<'PY'
import pathlib,re,sys
for link in pathlib.Path('/etc/apache2/sites-enabled').glob('*'):
 for block in re.findall(r'<VirtualHost\b[^>]*>.*?</VirtualHost>',link.read_text(),re.S|re.I):
  if re.search(r'<VirtualHost\s+[^>]*:443\s*>',block,re.I) and re.search(r'^\s*ServerName\s+'+re.escape(sys.argv[1])+r'\s*$',block,re.M|re.I):sys.exit(0)
raise SystemExit('No enabled HTTPS VirtualHost for '+sys.argv[1]+'; deployment has not started.')
PY

echo '[5/6] Deploying complete website with backup'
CODYNICK_DOMAIN="$domain" bash "$repo/install.sh"
echo '[6/6] Installing/updating CAS and private projects'
CODYNICK_DOMAIN="$domain" bash "$repo/cas/update.sh"
printf '\nCodyNick %s ready: https://%s/blocks/\n' "$(cat "$repo/VERSION")" "$domain"
echo 'Close old tabs, reopen the editor and press Ctrl+F5.'
echo 'Rerun this same setup command to retry or reinstall this package.'
