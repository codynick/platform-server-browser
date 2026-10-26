# CodyNick Platform Server Browser 0.1.1-browser

## Install or Update: One Fixed Command

**Prototype: use a separate Ubuntu test VM/server. Do not install over platform-server.**
The installer refuses conversion of an existing server-edition installation.

```bash
wget -4 -O /tmp/codynick-browser-setup.sh "https://raw.githubusercontent.com/codynick/platform-server-browser/main/setup.sh?$(date +%s)" && sudo bash /tmp/codynick-browser-setup.sh
```

Wait for **CodyNick Browser 0.1.1-browser: READY**. Progress survives SSH disconnects:

```bash
sudo tail -n 80 -F /var/log/codynick-multi/install.log
sudo codynick-multi-user status
```

## Optional HTTPS for a Public Server

The same setup command asks for an HTTPS domain and contact email. Accept the
Let's Encrypt agreement explicitly when prompted. For local VM testing, press
Enter at the domain prompt to keep HTTP. Existing HTTPS settings are reused on
upgrades, so the background installer never needs interactive input.

Before enabling HTTPS, point the domain's A record at this server. If an AAAA
record exists, its IPv6 address must also reach this server. Permit inbound TCP
80 and 443 in the provider firewall and any host firewall. The installer does
not change firewall rules, DNS or SSH settings. Correct system time is required.

Certbot uses HTTP-01 webroot validation, then Apache redirects HTTP to HTTPS
except the certificate-validation path. The TLS proxy sets Secure session cookies.
Certificate renewal uses certbot.timer and reloads Apache after successful renewal;
this does not enable automatic OS updates. Re-running setup does not force a new
certificate. Configuration is stored root-only in /etc/codynick-multi/https.json.

If certificate issuance fails, the installer reports failure (not READY). Correct
DNS/ports/time and rerun the SAME setup command; accounts and designs are retained.
The certificate details are in /var/log/letsencrypt/letsencrypt.log. After setup,
check renewal with sudo certbot renew --dry-run and timer state with
sudo systemctl status certbot.timer --no-pager. Keep port 80 open for renewal.

Changing HTTP to HTTPS creates a different browser origin: saved server designs
remain, but re-add local simulator gadgets on the HTTPS page. Use HTTPS in every
tool tab so their local state is shared.

## First Test

1. Sign in at your test server address. Open Block Coding.
2. Open Simulator and Dashboard in separate tabs on the same origin and browser profile.
3. In Simulator, add temperature and seven-segment gadgets.
4. In Block Coding, Load **Demo 1 - Temperature Monitor** and press Run.
5. Move the temperature slider. Display, gauge and graph update locally.
6. After all pages have loaded, disconnect the network: live updates continue.
7. Stop retains the last dashboard values. Reconnect before saving designs.

The other pre-installed demos are Temperature Traffic Light (CJP, temperature,
seven-segment), Parking Assistant (CJP, ultrasonic), and Joystick Status (CJP).
CJP is always present on the simulation stage.

## What Changed

The existing Simulator and Dashboard markup, styles and rendering are preserved.
Blockly generates JavaScript executed in a dedicated worker. A small local adapter
supplies the tools' live data; BroadcastChannel and browser storage coordinate
the separate tabs. Sensor, LED, display and dashboard updates do not contact the server.
Run/Stop is local; the Blockly server-execution endpoint is disabled.

Login, account administration and design Save/Load remain server features.
The Python IDE is retained and still executes Python on the server; it is outside
this browser-runtime milestone. Its database dashboard is not mixed into the
local browser dashboard.

## Supported in This Prototype

The four demos; variables, text, comparisons, arithmetic, conditions, repeat/while/
forever, waits and timer; simulated temperature, distance, soil and CJP joystick;
individual RGB LEDs, clear LEDs and live seven-segment; dashboard info/gauge/graph
creation, values, history, range, colour, size, font and alignment settings.
Unsupported blocks fail clearly rather than falling back to server execution.
Missing gadgets prompt users to add them and re-run.

AI and physical USB/Web Serial are postponed. Sprite execution, LED-matrix,
buzzer and Wi-Fi/IoT blocks are outside this first milestone. Their existing
pages/toolbox entries remain for inspection, but unsupported code will not run.
No Simulator or Dashboard visual redesign is included.

## Local Data and Lifecycle

Live state is per origin, browser profile and account name. Two computers using
the same login do not share live readings/cards. Saved designs remain server-side.
Closing the running Blockly page stops its program. Only one Blockly program per
account/browser profile runs at a time. Closing an inactive tool page does not
stop the running program. Background throttling and power saving can affect timing.

This is not a complete offline installation: assets and login must load first,
and saving needs connectivity. Clearing browser site data removes local scenes
and cards. Existing server-side dashboard database records are not used by local
browser programs.

## Accounts and Deployment

The first web account is administrator. Use Manage students for additional accounts.
These are web accounts, not Linux/SSH accounts. For minimum change, the base
service names, paths and admin command remain codynick-multi-*.
Use a dedicated test host/domain: the two editions cannot be installed side-by-side
on one OS with the default configuration.

This remains a trusted-user prototype, not a sandbox for hostile Python.
Use HTTPS on a remotely exposed server. No hotspot/network configuration changes.
The original platform-server repository and installed systems are untouched.

## Development

Based on platform-server 0.1.9 with Git history preserved. Original release tags
remain unchanged. tools/seal.py records browser-edition release checksums.
Browser tests open the existing tools in separate pages, switch the network
offline, run all four demos, and check that live data APIs never reach the server.
CI also installs on Ubuntu, tests account/design preservation and repeats upgrade.

## Revision History

### 0.1.1-browser

Optional guided Certbot HTTPS setup, persistent Apache TLS/redirect configuration,
automatic certificate renewal, Secure cookies and certificate-failure diagnostics.
No change to the browser simulation/dashboard designs.

### 0.1.0-browser

First browser-runtime prototype: worker execution, local cross-tab simulator and
dashboard transport, four pre-installed demos, unsupported-block errors and an
installation guard protecting an existing server edition.
