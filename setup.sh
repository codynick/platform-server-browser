#!/usr/bin/env bash
set -euo pipefail
trap 'echo "Setup/update failed at line $LINENO. Review the error above; fix it and rerun the same command." >&2' ERR
[[ ${EUID} -eq 0 ]] || { echo 'Run as root (sudo bash setup.sh).' >&2; exit 1; }
command -v apt-get >/dev/null || { echo 'This installer supports Debian/Ubuntu servers with apt-get.' >&2; exit 1; }
settings_dir=/etc/codynick
saved_domain=$settings_dir/domain
domain=${CODYNICK_DOMAIN:-}
if [[ -z "$domain" && -f "$saved_domain" ]]; then
 domain=$(cat "$saved_domain")
fi
if [[ -z "$domain" ]]; then
 [[ -t 0 ]] || { echo 'First setup needs a terminal to enter the domain, or set CODYNICK_DOMAIN.' >&2; exit 1; }
 read -r -p 'Website domain (for example ide.codynick.com): ' domain
fi
domain=${domain,,}
[[ ${#domain} -le 253 && "$domain" == *.* ]] || { echo 'Enter a valid domain name, without https://, a path, or a port.' >&2; exit 1; }
IFS='.' read -r -a labels <<< "$domain"
for label in "${labels[@]}"; do
 [[ ${#label} -le 63 && "$label" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || { echo "Invalid domain name: $domain" >&2; exit 1; }
done
[[ "$domain" != *. && ! "$domain" =~ ^[0-9.]+$ ]] || { echo 'Use a DNS domain name, not an IP address.' >&2; exit 1; }
echo "Installing/updating CodyNick for $domain"
# Remember the selection before deployment so failed certificate requests can be retried.
install -d -m 700 "$settings_dir"
printf '%s\n' "$domain" > "$saved_domain"
chmod 600 "$saved_domain"
repo=/root/platform-server-browser-upload
webroot=/var/www/$domain
export DEBIAN_FRONTEND=noninteractive
echo '[1/6] Installing server dependencies'
apt-get update
apt-get install -y git ca-certificates apache2 certbot python3-certbot-apache

echo '[2/6] Getting the latest CodyNick release'
if [[ -e "$repo" ]]; then
 [[ -d "$repo/.git" ]] || { echo "$repo exists but is not a Git checkout. Move it aside manually." >&2; exit 1; }
 [[ "$(git -C "$repo" remote get-url origin)" =~ ^https://github.com/codynick/platform-server-browser-upload(\.git)?$ ]] || { echo 'Unexpected repository origin; refusing to update.' >&2; exit 1; }
 [[ -z "$(git -C "$repo" status --porcelain)" ]] || { echo 'Server checkout has local changes. Commit or back them up before rerunning.' >&2; exit 1; }
 [[ "$(git -C "$repo" branch --show-current)" == main ]] || { echo 'Server checkout must be on main.' >&2; exit 1; }
 git -C "$repo" pull --ff-only origin main
else
 git clone --branch main --single-branch https://github.com/codynick/platform-server-browser-upload.git "$repo"
fi

echo '[3/6] Deploying website (with a rollback backup)'
mkdir -p "$webroot"
CODYNICK_DOMAIN="$domain" bash "$repo/install.sh"

echo '[4/6] Checking Apache website configuration'
# Reuse an existing domain configuration, including its SSL settings.
if ! apache2ctl -S 2>&1 | grep -F "$domain" >/dev/null; then
 config=/etc/apache2/sites-available/codynick-$domain.conf
 [[ ! -e "$config" ]] || { echo "$config already exists but is not active. Review it and enable it manually." >&2; exit 1; }
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
 a2ensite "codynick-$domain.conf"
fi
apache2ctl configtest
systemctl enable --now apache2
systemctl reload apache2

echo '[5/6] Checking HTTPS'
getent ahosts "$domain" >/dev/null || { echo "DNS does not resolve $domain. Point its DNS to this server, then rerun." >&2; exit 1; }
echo "Certbot will reuse a valid certificate or obtain/renew one as needed for $domain."
echo 'DNS must point to this server; inbound TCP ports 80 and 443 must be open.'
certbot --apache --non-interactive --agree-tos --register-unsafely-without-email --redirect --keep-until-expiring -d "$domain"

apache2ctl configtest
systemctl reload apache2
echo '[6/6] Installing/updating CAS and private projects'
CODYNICK_DOMAIN="$domain" bash "$repo/cas/update.sh"

printf '\nCodyNick %s is ready: https://%s/blocks/\nCheck File > About for the installed version.\n' "$(cat "$repo/VERSION")" "$domain"
echo 'Certificate renewal is managed by Certbot. Rerun the same command for future updates.'
