## 3.11.1 — clean installation repair

- Create HTTP and HTTPS site before deploying any application/CAS components.
- Correct bootstrap repository to codynick/platform-server-browser.
- Install complete extracted ZIP directly without fetching other source.
- Retry/repeat installation tests and early DNS/TLS failure checks.
- Include latest centered header controls and dedicated Examples button.
- First-install CAS endpoint/attribute prompts; preserve configured installs.

## 3.11.0

- Bundle CAS and private projects into the same setup.sh install/update flow.
- Derive callback and central-logout return URLs from the selected domain.
- Place account controls at top right with username only below the button.
- Remove legacy-browser import and cleanup controls.
- Preserve 3.10.2 compact standalone tool headers and current simulator features.
- Refresh Apache integration on repeat installs, including confirmation policy.
- Add sanitized request timing diagnostics; live login latency remains unverified.
- Retain identity confirmation until CAS supports correlated automatic login.

# v3.10.2 — 2026-10-27

- Keep standalone tool branding, title and Block Editor on one compact header row.
- Remove the forced empty navigation row; allow natural wrapping on narrow screens.
- Preserve compact logo-free headers in embedded views.
- Verify both desktop headers stay within 80 px in Chrome.

# v3.10.1 — 2026-10-27

- Right-align Block Editor in the top navigation row of standalone tool pages.
- Hide simulator/dashboard logos in embedded views and reduce header height.
- Isolate the coding workspace stacking context so scrollbars stay behind menus.
- Add actual scrollbar/menu overlap hit-testing to the Chrome regression suite.

# v3.10.0 — 2026-10-27

- Added the supplied transparent wide CodyNick logo across page headers and About.
- Put standalone Block Editor navigation on a separate left-aligned row.
- Added pointer-anchored simulator wheel zoom and background drag-to-pan.
- Added double-click/Home fit recovery and keyboard camera controls.
- Added left-side gadget removal crosses and right-side drag grips.
- Removed Fit Stage, 1:1, the global remove button and Browser simulator text.
- Included the new logo in installer backups and rollback.

# v3.9.0 — 2026-10-27

- Matched simulator/dashboard headers; hide Block Editor links in embedded views.
- Styled and left-aligned the panel's new-tab buttons.
- Added grouped, polished File/Advanced menus with icons and clear focus states.
- Use each graph title for its default legend, preserving named multi-series data.
- Added child-friendly built-in example names without changing their IDs.
- Enabled plain mouse-wheel canvas zoom; toolbox wheel scrolling is preserved.
- Keep block arguments and target choices inline, including imported projects.

# v3.8.0 — 2026-10-27

- Replaced Project menu with File; added Project suffix to file actions.
- Added an Examples chooser and moved Console/Python/Linux help into Advanced.
- Removed Main Panel from the blocks toolbar; moved Hide Spaces before Connect.
- Combined Run/Stop into one green/red button, with connection status beneath it.
- Replaced the simulator's permanent gadget sidebar with an Add gadget picker.
- Styled About with a border, version badge and release date.
- Python reference preview behavior is unchanged.

# v3.7.0

- Added Edit/Lock layout, grid-snapped card movement and corner resizing.
- Added keyboard arrow controls, drag cancellation and Reset layout.
- Preserve per-widget layout separately from program state across runs and tabs.
- Compact info, medium gauge and wide graph defaults with responsive placement.
- Smaller independent graph axis text, compact numbers and adaptive tick labels.
- Make the mixed-display regression wait for a complete sample before Stop.

# v3.6.1

- Ask for the website domain during first setup; remember it for updates.
- Use the selected domain for deployment paths, Apache, HTTPS and rollback.
- Let Certbot reuse a valid matching certificate or obtain/renew it as needed.
- Show version 3.6.1 in Project > About.

# v3.6.0

- Added setup.sh for fresh Debian/Ubuntu server setup and existing installations.
- Install dependencies, clone/update main, deploy with backup, configure Apache
  when needed, and request HTTPS through Certbot.
- Preserve existing domain site configuration and stop on local repository changes.
- Added Project > About with the installed application version.
- Aligned VERSION, About and installer output at 3.6.0.

# v3.5.1

- Fixed background-page scheduling that could stall Live programs when viewing a separate dashboard tab.
- Added cross-tab change notifications and focus/visibility refresh for dashboards.
- Kept polling as recovery, and avoided redraws when widget data is unchanged.
- Added worker/scheduler and separate-tab info/graph regression checks.
- No project migration or obsolete-file cleanup required; extract the full ZIP into the Git repository, commit and push as usual.
- Browser tab freezing/suspension and device sleep remain outside Live-mode guarantees.
