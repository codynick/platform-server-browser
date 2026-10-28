# Validation for 3.11.1

Passed:
- 6 setup orchestration tests: complete ZIP fresh/repeat installation, raw
  bootstrap clone/update of the correct repository, DNS failure before deploy,
  TLS failure before deploy followed by successful retry, invalid domain
  rejection, and actual static deployment/repeat into an isolated webroot.
- 15 CAS/backend tests: ticket handling, renew, Origin/CSRF, confirmation,
  replay/expiry, session invalidation, ownership, save conflicts and size limits.
- Account frontend checks: Save/Load behavior, guest protection, account-change
  cleanup, passive/duplicate notifications, stale response rejection, central
  logout navigation, Examples wiring and absence of old-browser-copy controls.
- Installer Python fixtures: Apache idempotence and two-domain return URL config.
- All 13 existing Node suites for editor/runtime/simulation/connection behavior.
- Bash/Python/JavaScript syntax and archive integrity checks.

Limits:
Setup tests mock system services and certificate issuance. They do not perform a
real OS install, Let's Encrypt challenge or live CAS sign-in. No graphical
browser verification was performed. The reported 10-second latency remains
undetermined. Identity confirmation is retained. CAS registration/redirect
policy must be configured on the separate identity server.
