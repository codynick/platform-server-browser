#!/bin/bash
set -Eeuo pipefail
TAG=v0.1.0-browser
ROOT=/opt/codynick-multi
if [[ $EUID != 0 ]]; then echo 'Run this installer with sudo bash.'; exit 1; fi
mkdir -p "$ROOT" /var/log/codynick-multi
exec 9>/run/lock/codynick-multi-setup.lock
flock -n 9 || { echo 'Another setup is running.'; exit 1; }
if systemctl is-active --quiet codynick-multi-install.service; then
  echo 'Installation is already running. Progress: sudo tail -f /var/log/codynick-multi/install.log'
  exit 0
fi
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
wget -4 --timeout=30 --tries=5 -O "$tmp/release.tar.gz" \
  "https://codeload.github.com/codynick/platform-server-browser/tar.gz/refs/tags/$TAG"
mkdir "$tmp/source"
tar -xzf "$tmp/release.tar.gz" -C "$tmp/source" --strip-components=1
python3 "$tmp/source/install.py" verify "$tmp/source"
release="$ROOT/releases/$TAG"
mkdir -p "$release"
cp -a "$tmp/source/." "$release/"
python3 "$release/install.py" prepare
touch /var/log/codynick-multi/install.log
systemd-run --unit=codynick-multi-install --collect \
  --property=StandardOutput=append:/var/log/codynick-multi/install.log \
  --property=StandardError=append:/var/log/codynick-multi/install.log \
  /usr/bin/flock /run/lock/codynick-multi-worker.lock /usr/bin/python3 -u "$release/install.py" install
exec 9>&-
echo 'Installation continues after SSH disconnects. Do not reboot until READY.'
echo 'Progress: sudo tail -n 80 -F /var/log/codynick-multi/install.log'
tail -n 30 -F /var/log/codynick-multi/install.log 9>&-
