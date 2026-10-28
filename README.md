# CodyNick Portal 3.11.1

Complete website, simulator, dashboard, CAS authentication, private project
storage and cumulative account/header improvements. See START_HERE.txt.

## Install the ZIP directly (no GitHub upload required)

Upload the extracted `codynick-clean-install` folder to `/root`, then run:

```bash
sudo env CODYNICK_DOMAIN=code.codynick.com bash /root/codynick-clean-install/setup.sh
```

Supports Debian/Ubuntu with apt-get and systemd. Configure DNS and allow inbound
80/443 first. The installer obtains a Let's Encrypt certificate. It uses the
bundled source rather than cloning another repository. It can retry the failed
installation without another OS reinstall. It does not restore any old data.
On an existing installation it preserves private projects and configuration.

For another domain replace CODYNICK_DOMAIN. If omitted, setup remembers the
previous domain or asks on first interactive execution. Passing it explicitly
suppresses the domain question. A new CAS setup asks for base/validation URLs and
ID/name/email attribute names; confirm the values used by id.codynick.com.
`__principal__` means the CAS user element is the stable account identifier.

## Correct fresh-install order

1. Dependencies and complete source selection.
2. HTTP VirtualHost and webroot.
3. HTTPS certificate and exact TLS VirtualHost verification.
4. Static website deployment with backup.
5. CAS backend, account storage, Apache reverse proxy and health check.

DNS/HTTPS failure stops before application deployment. Rerun the same command
after resolving the reported problem. Full OS reinstallation is unnecessary.
This version fixes both premature deployment and the old repository reference.

## GitHub bootstrap after publishing this release

Copy the extracted folder's CONTENTS to repository root and push main in
https://github.com/codynick/platform-server-browser. Then:

```bash
wget -4 -O /tmp/codynick-browser-setup.sh "https://raw.githubusercontent.com/codynick/platform-server-browser/main/setup.sh?$(date +%s)" && sudo env CODYNICK_DOMAIN=code.codynick.com bash /tmp/codynick-browser-setup.sh
```

Raw setup downloads use /root/platform-server-browser and only the matching
GitHub repository. Existing checkouts must be clean and on main. Local ZIP
installation requires no Git checkout and never fetches source from GitHub.

## CAS requirements and behavior

Register the two exact URLs for the selected hostname on the separate CAS server:
- https://code.codynick.com/auth/callback
- https://code.codynick.com/blocks/

The second URL is the logout return target; CAS must permit post-logout redirects.
The installer cannot change the identity server's service registry.
Existing account settings are reused. First-install defaults are
https://id.codynick.com/cas and /p3/serviceValidate; verify them at the prompts.
Environment overrides are CAS_BASE_URL, CAS_VALIDATE_URL, CAS_ID_ATTRIBUTE,
CAS_NAME_ATTRIBUTE, CAS_EMAIL_ATTRIBUTE. In noninteractive runs defaults/overrides
are used. The config is /etc/codynick-cas/config.json; private projects are in
/var/lib/codynick-cas/projects.sqlite3. Backups and rollback paths are printed.

The header is Logo, File, Advanced, Examples, Show/Hide Spaces, Connect, Run,
Sign in/out. Account name only appears below the account button. Legacy-copy
import/removal buttons are absent. Guest file downloads remain available.

Identity confirmation remains enabled under the fixed-callback CAS flow. No
unsupported automatic-login mechanism is silently enabled. The reported live
10-second latency has not been reproduced/diagnosed; sanitized timing is logged.

## Verification

```bash
python3 tests/test_setup.py
python3 cas/test_install.py
node cas/test_accounts.cjs
cd cas/backend && python3 -m unittest -q
```

Setup tests run against temporary files and mocked apt/Apache/Certbot/systemd,
including fresh installation, retries, repeats and remote bootstrap. One test
also executes the actual static install script against a temporary webroot.
They do not issue real certificates, contact live CAS or prove a VPS deployment.
See VALIDATION.md for checks and remaining live verification.
