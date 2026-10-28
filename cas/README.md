# Integrated CAS component

This folder is deployed automatically by the repository's setup.sh. See the root
README for the single-line command and initial CAS settings. Existing servers can
also run CODYNICK_DOMAIN=code.codynick.com bash cas/update.sh from this repository.

The updater preserves identity configuration and private project data. It derives
PUBLIC_ORIGIN and the CAS logout service return URL from CODYNICK_DOMAIN on every
run. An existing custom CAS_LOGOUT_URL endpoint is preserved; its service query
parameter is refreshed. CAS logout still requires the identity server to allow
the exact editor URL and enable post-logout redirection.

The account confirmation step remains enabled. Skipping it under the current
fixed callback design needs additional CAS capability to correlate the response
to the originating login. Do not disable its CSRF/Origin or one-time-token checks.

Close existing editor, simulator and dashboard tabs before upgrading. Reopen the
editor afterward. Old open tabs keep executing their previously loaded scripts.

Each deployment prints a backup path with rollback.sh. The static install also
has its own backup. Use the static backup to restore the complete previous UI if
rolling back a combined setup. The private database is retained by rollback.

Tests:
  cd cas/backend && python3 -m unittest -q
  node cas/test_accounts.cjs
  python3 cas/test_install.py

Backend dependencies are pinned in backend/requirements.txt. Request path,
status and duration are logged for auth requests; ticket URLs and user data
are not logged. Server-Timing is also returned to support latency diagnosis.
