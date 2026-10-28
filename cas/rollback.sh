#!/bin/bash
set -euo pipefail
[[ $EUID == 0 ]] || exit 1
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
read -r domain < domain
root=/var/www/$domain
systemctl stop codynick-cas || true
for section in blocks simulator dashboard; do
 rm -rf -- "$root/$section"
 cp -a "$section" "$root/$section"
done
cp -a apache/sites-available/. /etc/apache2/sites-available/
for base in opt etc; do
 rm -rf -- "/$base/codynick-cas"
 if [[ -d codynick-cas-$base ]]; then cp -a "codynick-cas-$base" "/$base/codynick-cas"; fi
done
if [[ -f codynick-cas.service ]]; then
 cp -a codynick-cas.service /etc/systemd/system/
 systemctl daemon-reload
 systemctl restart codynick-cas
else
 systemctl disable codynick-cas || true
 rm -f /etc/systemd/system/codynick-cas.service
 systemctl daemon-reload
fi
apache2ctl configtest
systemctl reload apache2
echo 'Previous website/configuration restored. Private database retained; no accounts or projects deleted.'
