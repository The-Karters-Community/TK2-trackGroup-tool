# Verification record — 2026-10-12

Development version: **0.1.0-dev**. Game: **0.1.4.18**, app ID **2269950**. Windows 11 x64, Python 3.14, installed Steam client and game DLL. No game binaries or track assets are bundled.

## Automated

- 26 Python tests: unchanged profile round trips; Unicode; ordered mixed imports; duplicate no-op imports; confirmed updates; numbered copies; unrelated field/record preservation; malformed/private-field exports; unresolved dependencies; catalog integrity/offline fallback; failed subscriptions/downloads; cancellation; delayed downloads; unavailable Steam; changed account/profile; Cloud conflict; failed writes; interrupted journals; external-save-safe recovery; helper UTF-8; HTTP session/host/origin guards.
- 3 React tests: list/search/order, unresolved export controls, and removal of display-only fields from import requests.
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

## Portable

`tools/smoke_portable.ps1` copies the build to a relocated path containing spaces, removes Python/Node/npm from PATH, launches the bundled app/helper, checks real Steam/profile access, shuts down the native window, checks child exit, and deletes the copied folder. Passed. Compiled UI also checked at 1180×820 and the 760×560 minimum window size without horizontal overflow.

## Limits of this verification

All 42 dependencies were already subscribed and installed on the test account. A new missing-item network download was not exercised live; subscription callbacks were tested live, while missing subscriptions, failed/delayed downloads, unavailable Steam, wrong accounts, and failed writes were tested with controlled doubles. Steam's remote server upload completion is managed by the client, beyond the verified local Remote Storage readback. Private/deleted items fail closed when metadata cannot be resolved. CI validates dependency structure/mapping but cannot authenticate to Steam; maintainers review availability before catalog merges.

No release was published. Backups, complete profiles, account IDs, private diagnostics, and game captures are excluded from Git.
