# Verification record — 2026-10-12

Development version: **0.1.0-dev**. Game: **0.1.4.18**, app ID **2269950**. Windows 11 x64, Python 3.14, installed Steam client and game DLL. No game binaries or track assets are bundled.

## Automated

- 35 Python tests: unchanged profile round trips; Unicode; ordered mixed imports; duplicate no-op imports; confirmed updates; numbered copies; unrelated field/record preservation; malformed/private-field exports; unresolved dependencies; catalog integrity/offline fallback and pinned revisions; failed subscriptions/downloads; cancellation; delayed downloads; unavailable Steam; changed account/profile; Cloud conflict; failed writes; interrupted journals; external-save-safe recovery; helper UTF-8; HTTP session/host/origin guards; pasted Workshop IDs/links; resolved creation previews; name-only updates with unresolved/preset references; rename transactions and reviewed categories.
- 7 React tests: list/search/order, unresolved export controls, removal of display-only fields from import requests, category filtering, file-import placement, creation/rename forms, numbered review tracks, per-track progress, and completion opening the saved group in My groups.
- Catalog validator: 3 groups, 58 ordered references, 42 Workshop references. IDs, names, and order came from the actual custom groups. Checksums and shared dependency mappings validate.
- Vite production build and formatting checks pass. The portable ZIP is approximately 14.5 MiB.

## Real Steam account and game

- Initialized the installed native API for app 2269950; queried public metadata for all subscribed tracks and mapped all 42 catalog references.
- Exercised SubscribeItem on an already-subscribed track: the callback and subscription state verified. No existing items were unsubscribed.
- Read the profile through Steam Remote Storage; compared it byte-for-byte with the local file. An identical-byte API write/read proof also passed.
- A duplicate CTR99 import checked all 18 installed dependencies and left the save unchanged.
- Added a temporary mixed group with **CTR99 - Cortex Castle**, then **Gauntlet Run**. Both save copies verified. The first two records, all original groups, and every unrelated profile field were preserved.
- Restarted the game: the group appeared with two tracks in that order. Cortex Castle loaded into a playable time trial.
- Updated the test group's name, preserving its position. Fixed and regression-tested Windows-default decoding in the helper. Restarted again and verified the Unicode name displayed correctly.
- Closed the game and removed only the temporary group from both current copies. The three original custom groups exactly matched the initial baseline; unrelated current profile data was retained. Backups remain local.

## Group management flow, 2026-10-12

Created a temporary two-track Workshop group from pasted IDs in the compiled UI using the real Steam account. The review showed numbered Cortex Castle and Slide Coliseum titles in the pasted order, with installed status. Confirmed saving, opened it directly in My groups, then renamed it through the UI. Both save copies verified. All original groups, unrelated fields, and first two records remained unchanged. Removed only the temporary test group afterward; both copies matched the verified baseline byte-for-byte. No additional subscriptions were needed. Category navigation and responsive review checked in the browser; progress/failure paths also have UI tests.

## Portable

`tools/smoke_portable.ps1` copies the build to a relocated path containing spaces, removes Python/Node/npm from PATH, launches the bundled app/helper, checks real Steam/profile access, shuts down the native window, checks child exit, and deletes the copied folder. Passed. Compiled UI also checked at 1180×820 and the 760×560 minimum window size without horizontal overflow.

## Missing dependencies and inline editing, 2026-10-12

- Reproduced the LEGO group's loss of identities after unsubscribe. Its original export resolved all 14 IDs; the real Steam API verified their expected internal identifiers and reported all 14 unsubscribed/not installed. Identities are retained independently of subscriptions. Ready flags are also checked against actual installed catalogs/content files, so deleted or incomplete files are reported as missing. Refresh and the repair preview now list every named missing track and offer download. These subscriptions were left untouched for the user to exercise repair.
- Used the actual interface to rename the LEGO group and swap its first two tracks with one Save action. Both local and Remote Storage verified. Restored the original name/order through the same editor; the complete current profile was byte-for-byte identical to the fresh baseline afterward. No track subscriptions changed.
- Public Workshop preview URLs feed the Gallery view; missing counts remain visible in both layouts. Text mosaics cover missing previews and official configuration IDs.
- Regression suite: 44 Python checks and 9 UI checks. Includes persistent identities after unsubscribe/restart, missing-status refresh, native preset-preserving permutations, repair without any profile write, release/checksum/inventory/path validation and destination collisions.

## App updater, 2026-10-12

`tools/check_update_lifecycle.py` compiled an isolated version fixture and exercised real Windows portable replacement, healthy restart, standard version-folder rename, preservation of an added user file, and removal of the temporary previous-installation copy. A second fixture with an invalid executable restored and reopened the previous application. All test applications closed and their folders were deletable. The source development version was unchanged; no release was published. Public GitHub release installation cannot be tested until a compatible release exists; its download/checksum/archive rules have local automated coverage.

## Limits of this verification

All 42 dependencies were already subscribed and installed on the test account. A new missing-item network download was not exercised live; subscription callbacks were tested live, while missing subscriptions, failed/delayed downloads, unavailable Steam, wrong accounts, and failed writes were tested with controlled doubles. Steam's remote server upload completion is managed by the client, beyond the verified local Remote Storage readback. Private/deleted items fail closed when metadata cannot be resolved. CI validates dependency structure/mapping but cannot authenticate to Steam; maintainers review availability before catalog merges.

No release was published. Backups, complete profiles, account IDs, private diagnostics, and game captures are excluded from Git.


## Catalog and direct management, 2026-10-12

- Verified all 14 ordered LEGO Workshop IDs against the real Steam metadata and added the exact user export to the Speedrun catalog. Bundled groups now total four, with 72 ordered references. A three-group offline cache cannot hide the new bundle; the dependency registry is reloaded and seeded before Steam refresh.
- Source application reported 14 missing LEGO subscriptions, zero unresolved identities, an enabled Repair button, and a named repair review. No subscriptions were changed during this check.
- Both library views offer independently remembered Gallery/List controls. Local details expose name editing, drag grips, keyboard-accessible move arrows, per-track status and Steam links. Save/Discard appear only for dirty drafts. Automated tests exercise HTML5 drag/drop; visible browser verification exercised move arrows and the conditional controls.
- Saved a temporary LEGO name and first-two-track reorder directly through the source UI, then restored both through the same UI. Local and Steam Remote Storage saves matched the fresh original byte-for-byte afterward. Polling preserves a dirty draft's original concurrency hash.
- Validation: 47 Python tests, 13 UI tests, catalog validation and production frontend build passed.

- The exact `Launch Track Groups.cmd` started the native source app, rebuilt its UI, and verified Steam/profile access: four catalog groups, LEGO export ready, zero unresolved identities and 14 missing tracks. Closed the native app afterward.
- Rebuilt the flat portable ZIP (13.9 MiB) and verified its inventory hashes. The relocated native smoke test passed without developer runtimes on PATH, including the LEGO repair preview, real Steam access, clean child-process exit and deletion of the copied application folder.


## Compact library and artwork, 2026-10-12

- Native/source startup now schedules Steam refresh automatically. The actual account connected and local/Cloud agreement verified without clicking Connect. Success feedback disappears after five seconds without shifting page content.
- All 16 official configuration IDs retain their order, with known titles and supplied local artwork. In-game names confirmed by the user are Gauntlet Run and Scuba Driving; artwork filenames match these names. Shared previews also display public Workshop images in both detail panels and import reviews. Display enrichment never enters portable group files or saved native records.
- Checked the compiled interface in the actual browser at normal dimensions and 760 x 560: no horizontal overflow; review buttons remain within the viewport. Browse begins with a compact heading/category row, centered Speedrun logo and combined search/view toolbar. Removed repository links from the app and credited DarkSlayer.
- Import review is one native modal over the current library, retaining the selected group underneath. Close/Back returns to that context; download/save confirmation remains explicit.
- Editing name and using move arrows changed the draft only; Discard restored it. The first track list offset stayed exactly 463px before and after Save/Discard became visible. No profile writes or subscriptions were performed during this UI check.
- SortableJS animates pointer reordering with a dedicated grip, restores DOM ownership before the React update, respects reduced motion and retains immediate keyboard move arrows. Automated tests exercise its actual callback contract and reordered draft; a physical mouse drag was not exercised through the DOM-only browser automation.
- 48 Python tests and 16 UI tests pass, with catalog validation, formatting and production build.

- Rebuilt the flat 16.5 MiB portable ZIP. The relocated native smoke test passed with developer runtimes removed from PATH: automatic Steam/profile access, preview/no-op save preservation, clean host/helper shutdown and deletion of the copied folder. The exact Launch Track Groups.cmd also connected automatically and its native host exited cleanly.

- CI caught a checksum computed from Windows CRLF bytes before Git normalized the group to LF. Regenerated through tools/check_catalog.py --write-index and added a byte-level LF regression check (49 Python tests). Catalog checksums now match both working files and committed Git blobs.

## Browser edition, 2026-10-13

- Separate static build shares the catalog, track artwork, gallery/list and inline editor with the desktop app. It does not import the authenticated desktop transport or Python/Steam runtime. Production CSP prohibits background connections and form submissions; only bundled assets and allowlisted public Steam thumbnails load.
- 36 frontend tests and 49 Python tests pass. Browser coverage includes exact first-two-record preservation, 64-bit integers and high-precision decimal tokens, Unicode, computed built-ins with absent/null item lists, protected groups, mixed order, duplicate no-ops, explicit same-name updates preserving local IDs/positions, preset-preserving edits, malformed files, unresolved exports and backup-first download controls. Desktop build/format/catalog checks pass too.
- Parsed a copy of the actual current profile in JS, round-tripped it and added a temporary Unicode group **only in ignored test files**. Python independently verified identical first two records, existing containers and every unrelated profile field. No real local/Steam save was written.
- In the compiled browser UI, selected a synthetic profile through the real file picker, imported the 16 official tracks, downloaded the original backup and edited save, renamed the group and swapped its first two tracks. Python checked the actual downloads: exact backup, original binary records, unchanged built-ins and 64-bit integer, exact saved name and 16 tracks. No backend calls or console errors occurred.
- Narrow viewport check measured 375px page/viewport width without horizontal overflow; the modal drawer stayed within it and all 16 official detail previews loaded. Native dialogs keep keyboard focus within the active panel; desktop move-arrow controls also worked in the browser edition.
- Native load/save pseudocode establishes the explicit Cloud-disabled local-load branch at 0x1809f0a20, and Steam API plus LocalLow save writes at 0x1809f1bd0. The manual website workflow documents this prerequisite. A full Cloud-disabled browser-to-game import and subsequent Cloud reconciliation have **not been exercised live**; the website cannot verify account/build, subscriptions, downloaded content, Cloud agreement or actual file replacement.
- GitHub Pages deployment is independent of portable releases. Development remains 0.1.1-dev; no desktop release is published for this website work.
- The live GitHub Pages URL loaded all gallery artwork without console/CSP errors or horizontal overflow. Its downloaded official group matched the reviewed catalog exactly, including the saved name and track order. Both GitHub validation and Pages deployment completed successfully. The import instructions visibly label the unverified browser-to-game step as experimental.

## Outside-click dismissal, 2026-10-13

- Website collection details and save reviews, plus desktop import reviews, share a native Dialog component. A primary press must start and end on the backdrop; content, padding, scrollbar interactions, cancelled pointers and drags out of the dialog do not dismiss it. Escape, focus trapping and close buttons retain their native behavior.
- Desktop collection side panels close on outside clicks; clicking another collection still selects it. Unsaved edits and busy operations retain the existing close guard. Website editor dismissal uses the existing explicit discard confirmation. Running desktop import transactions block both Escape and backdrop dismissal.
- All 43 frontend tests pass, including seven new dismissal regressions. Both production builds, formatting and the restricted static website check pass. Visible checks on the compiled website verified actual backdrop clicks, content clicks and Escape. The real desktop backend's compiled interface verified side-panel and import-review dismissal; an unsaved local rename stayed open on an outside click, then Discard restored it before closing. No profile writes or subscriptions were performed.
