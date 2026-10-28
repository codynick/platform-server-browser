#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo 'Run as root: bash install.sh' >&2; exit 1; fi
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
version="$(cat "$source_dir/VERSION")"
domain=${CODYNICK_DOMAIN:-code.codynick.com}
domain=${domain,,}
[[ ${#domain} -le 253 && "$domain" == *.* ]] || { echo 'Enter a valid domain name, without https://, a path, or a port.' >&2; exit 1; }
IFS='.' read -r -a labels <<< "$domain"
for label in "${labels[@]}"; do
 [[ ${#label} -le 63 && "$label" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || { echo "Invalid domain name: $domain" >&2; exit 1; }
done
[[ "$domain" != *. && ! "$domain" =~ ^[0-9.]+$ ]] || { echo 'Use a DNS domain name, not an IP address.' >&2; exit 1; }
target_dir=/var/www/$domain
for name in VERSION index.html landing.css blocks/version.js blocks/accounts.js blocks/accounts.css blocks/index.html blocks/editor.css blocks/serial.js blocks/blocks.js blocks/hardware.js blocks/runtime.js blocks/block-specs.js blocks/vendor/blockly/blockly.min.js blocks/stage.css blocks/webserial.css blocks/python-preview.js blocks/project-menu.js blocks/ch340-usb.js blocks/linux-help.js blocks/live-store.js blocks/live-scheduler.js blocks/live-timer-worker.js blocks/live-router.js blocks/dashboard-blocks.js blocks/examples/Real-temperature-Sim-distance.codynick simulator/index.html simulator/app.js simulator/viewport.js dashboard/index.html dashboard/layout.js dashboard/layout-ui.js assets/tool-navigation.css assets/favicon.ico assets/codynick-logo.png; do
 [[ -f "$source_dir/$name" ]] || { echo "Missing package file: $name" >&2; exit 1; }
done
[[ -d "$target_dir" ]] || { echo "Website directory does not exist: $target_dir" >&2; exit 1; }
backup_dir="$(mktemp -d /root/codynick-portal-backup-XXXXXXXX)"
printf '%s\n' "$domain" > "$backup_dir/deploy-domain"
staging_dir="$(mktemp -d "$target_dir/.codynick-install-XXXXXXXX")"
trap 'rm -rf -- "$staging_dir"' EXIT
for section in blocks simulator dashboard; do cp -a -- "$source_dir/$section" "$staging_dir/$section"; done
chmod -R u+rwX,go+rX "$staging_dir"
chown -R root:root "$staging_dir"
# Preserve the old root page and all obsolete assets from our earlier releases.
for name in index.html landing.css app.js style.css hardware.js runtime.js block-specs.js blocks.js; do
 if [[ -e "$target_dir/$name" || -L "$target_dir/$name" ]]; then cp -a -- "$target_dir/$name" "$backup_dir/$name"; fi
done
for section in blocks simulator dashboard; do
 if [[ -e "$target_dir/$section" || -L "$target_dir/$section" ]]; then mv -- "$target_dir/$section" "$backup_dir/$section"; fi
 if ! mv -- "$staging_dir/$section" "$target_dir/$section"; then
  for restore in blocks simulator dashboard; do
   if [[ -e "$backup_dir/$restore" ]]; then rm -rf -- "$target_dir/$restore"; mv -- "$backup_dir/$restore" "$target_dir/$restore"; fi
  done
  echo 'Installation failed; previous sections restored.' >&2; exit 1
 fi
done
mkdir -p "$target_dir/assets" "$backup_dir/assets"
for name in tool-navigation.css favicon.ico codynick-logo.png; do
 if [[ -e "$target_dir/assets/$name" ]]; then cp -a -- "$target_dir/assets/$name" "$backup_dir/assets/$name"; fi
 install -m 644 -o root -g root -- "$source_dir/assets/$name" "$target_dir/assets/"
done
install -m 644 -o root -g root -- "$source_dir/index.html" "$source_dir/landing.css" "$target_dir/"
for name in app.js style.css hardware.js runtime.js block-specs.js blocks.js; do rm -f -- "$target_dir/$name"; done
# Remove only the old root-level Blockly directory, preserving other vendor assets.
if [[ -e "$target_dir/vendor/blockly" || -L "$target_dir/vendor/blockly" ]]; then
 mkdir -p "$backup_dir/vendor"
 mv -- "$target_dir/vendor/blockly" "$backup_dir/vendor/blockly"
fi
cp -- "$source_dir/rollback.sh" "$backup_dir/rollback.sh"
printf '\nInstalled CodyNick Portal %s\nHome: https://%s/\nEditor: https://%s/blocks/\nBackup: %s\nRollback: bash %s/rollback.sh\n\nOpen the site and press Ctrl+F5. Website deployment complete.\n' "$version" "$domain" "$domain" "$backup_dir" "$backup_dir"
