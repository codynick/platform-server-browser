Verified for 3.11.0:
- Backend account and CAS checks: ownership, renew, fixed callback, CSRF/Origin,
  replay, expiry, size limits and session invalidation.
- Frontend: legacy controls absent, account controls attach to header, username
  only, stable polling, passive notifications, stale response rejection, bounded
  live-view reload and central logout navigation.
- Installer: Apache patch idempotence; domain-derived origin/logout return tested
  on two different domains, preserving identity settings and custom logout path.
- Existing 13 Node suites pass; shell and JavaScript syntax checked.
- Graphical browser download failed; no visual-browser validation performed.
- No live CAS, VPS installation, or reproduction of the 10-second delay performed.
