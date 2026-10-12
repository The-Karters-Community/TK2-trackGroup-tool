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

- Reproduced the LEGO group's loss of identities after unsubscribe. Its original export resolved all 14 IDs; the real Steam API verified their expected internal identifiers and reported all 14 unsubscribed/not installed. Identities are retained independently of subscriptions. Refresh and the repair preview now list every named missing track and offer download. These subscriptions were left untouched for the user to exercise repair.
- Used the actual interface to rename the LEGO group and swap its first two tracks with one Save action. Both local and Remote Storage verified. Restored the original name/order through the same editor; the complete current profile was byte-for-byte identical to the fresh baseline afterward. No track subscriptions changed.
- Public Workshop preview URLs feed the Gallery view; missing counts remain visible in both layouts. Text mosaics cover missing previews and official configuration IDs.
- Regression suite: 43 Python checks and 9 UI checks. Includes persistent identities after unsubscribe/restart, missing-status refresh, native preset-preserving permutations, repair without any profile write, release/checksum/inventory/path validation and destination collisions.

## App updater, 2026-10-12

`tools/check_update_lifecycle.py` compiled an isolated version fixture and exercised real Windows portable replacement, healthy restart, standard version-folder rename, preservation of an added user file, and removal of the temporary previous-installation copy. A second fixture with an invalid executable restored and reopened the previous application. All test applications closed and their folders were deletable. The source development version was unchanged; no release was published. Public GitHub release installation cannot be tested until a compatible release exists; its download/checksum/archive rules have local automated coverage.

## Limits of this verification

All 42 dependencies were already subscribed and installed on the test account. A new missing-item network download was not exercised live; subscription callbacks were tested live, while missing subscriptions, failed/delayed downloads, unavailable Steam, wrong accounts, and failed writes were tested with controlled doubles. Steam's remote server upload completion is managed by the client, beyond the verified local Remote Storage readback. Private/deleted items fail closed when metadata cannot be resolved. CI validates dependency structure/mapping but cannot authenticate to Steam; maintainers review availability before catalog merges.

No release was published. Backups, complete profiles, account IDs, private diagnostics, and game captures are excluded from Git.
