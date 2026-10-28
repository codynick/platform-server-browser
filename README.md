# CodyNick Portal 3.11.1

CodyNick is a browser-based visual programming environment for combining real
CodyNick gadgets, simulated gadgets, and live dashboards in one project.

Repository: [codynick/platform-server-browser](https://github.com/codynick/platform-server-browser)

## One command for installation and upgrades

Run this same command in an interactive terminal on the VPS:

```bash
wget -4 -O /tmp/codynick-browser-setup.sh "https://raw.githubusercontent.com/codynick/platform-server-browser/main/setup.sh?$(date +%s)" && sudo bash /tmp/codynick-browser-setup.sh
```

- **First installation:** the installer asks for the website domain, such as
  `code.codynick.com`, and saves it.
- **Future upgrades:** the installer reuses the saved domain and existing CAS
  settings. Use the same command; no domain is included in it.
- **Source:** the command downloads `setup.sh` from the repository's `main`
  branch, then clones or updates that repository on the VPS.
- **Publication:** commit and push a release to `main` before running the command
  to install that release.

The same command supports a clean OS installation and upgrades. There is no
need to upload update packages to the VPS separately.

## Server requirements

Use a Debian/Ubuntu VPS with `apt-get`, systemd, and root or sudo access.
`wget` must be available to run the command above. If it is missing, install it
with `sudo apt-get update && sudo apt-get install -y wget`.

Before installation:

1. Point the chosen domain's DNS A record to the VPS public IPv4 address.
2. If an AAAA record exists, ensure it points to a working IPv6 address on this
   VPS; otherwise remove the incorrect record.
3. Allow inbound TCP ports **80 and 443** through server/provider firewalls.
4. Keep the separate CAS identity server available at `id.codynick.com`.

The installer installs dependencies, creates the Apache website, obtains/checks
HTTPS, deploys the application, and installs the CAS backend and private project
storage. **HTTPS is configured before application/CAS deployment.**

If installation stops, fix the reported error and run the same command again.
A failed installation does not require reinstalling the OS.

## First-installation CAS settings

Use these working settings for the CodyNick identity server:

| Setting | Value |
| --- | --- |
| CAS base URL | `https://id.codynick.com/cas` |
| CAS validation URL | `https://id.codynick.com/cas/serviceValidate` |
| Stable CodyNick ID attribute | `cn_id` |
| Name attribute | `first_name` |
| Email attribute | `email` |

The first-installation prompts look like this. Text after the colon shows what
to enter; an empty response accepts the displayed default.

```text
First installation: confirm the settings of your existing CAS server.
CAS base URL [https://id.codynick.com/cas]:
CAS validation URL [https://id.codynick.com/cas/p3/serviceValidate]: https://id.codynick.com/cas/serviceValidate
Stable CodyNick ID attribute [__principal__; __principal__ means CAS user]: cn_id
Name attribute [name]: first_name
Email attribute [email]:
```

**Override the suggested `/p3/serviceValidate` URL with `/serviceValidate`.**
Also enter `cn_id` and `first_name` instead of accepting `__principal__` and
`name`. Press Enter for the base URL and email attribute shown above.

These are configuration values to enter at the prompts; documenting them does
not change the installer's built-in defaults. Existing configurations are reused
during upgrades, so the first-installation questions are not repeated.

## CAS service registration

On `id.codynick.com`, allow these exact URLs for `code.codynick.com`:

```text
https://code.codynick.com/auth/callback
https://code.codynick.com/blocks/
```

- `/auth/callback` is the login service URL.
- `/blocks/` is the return destination after central logout. CAS must permit
  post-logout redirection.

No URL patterns are required. For another website domain, register the same paths
with that hostname. Moving to another VPS while keeping the domain does not
change these registered URLs. The installer cannot edit the separate CAS server's
service registry.

## Features and account behavior

- Blockly editor with per-block Hardware/Simulation routing.
- Real hardware connection through the browser; programs execute in the editor
  tab, which must remain open.
- Simulator and dashboard, including separate live-view tabs.
- CAS login, private account projects, account Save/Load, and project deletion.
- Guest use and portable `.codynick` file upload/download.
- Sign out clears the local workspace/account state and visits central CAS
  logout. Its return to the editor depends on the CAS redirect policy above.
- Header: **Logo · File · Advanced · Examples · Show/Hide Spaces · Connect · Run ·
  Sign in/out**, with only the username below the account button.
- File, Advanced, Examples, and Spaces controls are vertically centered against
  the logo on desktop. Examples opens the example chooser.
- Legacy browser-copy import/removal buttons are absent.

The fixed-callback CAS flow retains its explicit identity confirmation step at
`/auth/confirm`. This release does not remove that extra click.

## Upgrade procedure

1. Copy the complete cumulative release contents into the root of your local
   repository. Keep the existing `.git` directory; do not add a nested package
   folder around the source.
2. Review, commit, and push the release to `main` using your own GitHub account.
3. Close all old CodyNick editor, simulator, and dashboard tabs.
4. Run the same single-line VPS command shown above.
5. Open the editor at your domain's `/blocks/` path and press **Ctrl+F5**.

Example commands from your local repository, with `main` checked out:

```bash
git status
git add .
git commit -m "Upgrade CodyNick Portal"
git push origin main
```

For a README-only change, stage only that file:

```bash
git add README.md
git commit -m "Document setup command and working CAS settings"
git push origin main
```

An upgrade preserves existing CAS configuration and private project data. The
VPS Git checkout must be clean and on `main`; setup stops instead of overwriting
uncommitted server-checkout changes. Already-open tabs keep running old scripts
until closed/reloaded.

## Server locations and diagnostics

| Item | Location |
| --- | --- |
| Repository checkout used by GitHub setup | `/root/platform-server-browser` |
| Saved domain | `/etc/codynick/domain` |
| Website | `/var/www/<your-domain>/` |
| CAS configuration | `/etc/codynick-cas/config.json` |
| Private project database | `/var/lib/codynick-cas/projects.sqlite3` |
| Backend service | `codynick-cas` |

Check the account service and its logs:

```bash
sudo systemctl status codynick-cas --no-pager
sudo journalctl -u codynick-cas --since "10 minutes ago" --no-pager
```

Authentication responses include `Server-Timing`; sanitized logs record request
path, status, and duration. Do not share ticket query strings or session cookies
when reporting a problem. The previously reported roughly 10-second sign-in
delay has not been independently diagnosed by the packaged tests.

Installation prints backup locations and rollback commands. Static deployment
and CAS deployment have separate backups. A rollback preserves the private
project database; it does not restore deleted projects. For a complete backup,
include the CAS configuration and database using a consistent SQLite backup.
A clean OS reinstall without restoring those files creates fresh local settings
and an empty project database; accounts on the separate CAS server remain there.

## Development checks

With Python backend dependencies and Node installed, run:

```bash
python3 tests/test_setup.py
python3 cas/test_install.py
node cas/test_accounts.cjs
(cd cas/backend && python3 -m unittest -q)
```

The setup fixture tests use temporary files and mocked server services, including
fresh setup, repeated setup, DNS/TLS failures, and retry behavior. Existing Node
suites cover editor, runtime, connection, simulation, and dashboard behavior.
See `VALIDATION.md` for scope and limitations. These tests do not replace live
HTTPS, CAS, hardware, and browser verification.
