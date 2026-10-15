# TK2 Garage

A desktop and browser companion for **The Karters 2: Turbo Charged**. Share ordered track groups, organize customization presets, and browse installed cosmetic appearances. The desktop app also manages Workshop track subscriptions.

**Development version: 0.1.1-dev.** The Garage redesign and presets are in current source and the hosted website. **Stable Windows release: 0.1.0**, which predates these features. Supports game build **0.1.4.18**, Steam app **2269950**. Normal features require no BepInEx or mod toolkit. [Optional live 3D previews](docs/LIVE-PREVIEW.md) use a small game companion. [Download the portable app](https://github.com/The-Karters-Community/TK2-trackGroup-tool/releases/latest).

**Prefer a website?** [Open the browser edition](https://the-karters-community.github.io/TK2-trackGroup-tool/). Browse the Speedrun library, download group files, and prepare save edits locally without an executable or profile upload. Applying them requires manual Workshop subscriptions and file replacement with Steam Cloud disabled for this game. [Browser instructions and limits](docs/WEB.md).

![Speedrun and Community library with ordered Workshop tracks](docs/images/library.png)

## Use the app

TK2 Garage manages track groups and customization presets in one app. The repository URL, portable asset names, executable filename (`TK2 Track Groups.exe`), updater manifest identity and data folder keep their previous names so installed updaters remain compatible. The window title and website use TK2 Garage.

Portable builds contain the runtime and compiled interface. Extract the ZIP into one chosen folder and run **TK2 Track Groups.exe**. Users do **not** install Python, Node.js, or npm. Requires Windows x64, Microsoft Edge WebView2 Runtime, the installed supported game, and the running Steam client. Steam Cloud must be enabled for imports.

1. Close the game and open the app. In **Settings**, check the detected game folder and profile. If multiple profiles exist, explicitly select the correct one.
2. Steam connects automatically at launch; use **Refresh Steam** to recheck. The app checks the active account, Workshop metadata, and local/Steam save agreement. Resolve any conflict before continuing.
3. In **Browse groups**, choose **Speedrun** for reviewed Speedrun.com collections or **Community** for other curated collections. Select a group and choose **Preview import**. A focused review dialog opens over the library, showing numbered track names, installation status, and any name/order changes. Confirm **Add to My groups** or **Update My groups**. Keep the game closed until completion.
4. Missing Workshop items are subscribed and downloaded automatically. Per-track progress and cancellation stay in the review page; no files are downloaded before confirmation. Completed subscriptions remain if importing fails or is cancelled; the app never unsubscribes content. When saving finishes, **View in My groups** opens the saved collection.
5. Start the game and open Track Groups. Importing the same group again is a no-op; an update preserves its position. A different group ID with the same name becomes a numbered copy.

**My groups** manages your custom groups in the game:

- **Import group file** opens a shared `.tk2group.json` for review. Saving adds it to your game and My groups; it does not publish it to the curated library.
- **Create group** accepts a name and ordered Workshop item IDs or links, separated by lines, spaces or commas. Steam resolves compatible track names before review. Duplicates and unavailable/incompatible items are rejected.
- Switch between **Gallery** (public Workshop preview images with track-name fallbacks) and **List**. Both show missing-track counts after a Steam refresh.
- Select a group to edit its name directly. Drag track grips into racing order (or use the up/down arrows), then **Save changes** in the same panel. Save and Discard fade into a reserved area when something changes, keeping the track list steady. Reordering animates around the dragged track; reduced-motion preferences are respected. The group keeps its position and every native track reference/preset. No subscriptions are changed.
- **Refresh Steam** checks known dependencies even after unsubscribing. **Repair missing tracks** reviews named missing items, then **Download missing tracks** restores subscriptions/downloads without rewriting the group or profile.
- **Export group** shares group data and public metadata, never player progress, account IDs, upload credentials, or track assets. Connect Steam to resolve Workshop dependencies first.

![My groups gallery with missing-track status](docs/images/my-groups.png)

### Presets (development version)

The **Presets** page is available in the source app and browser edition; stable
desktop 0.1.0 predates this feature. Select individual presets or several groups
and **Export selected** to share a `.tk2presets.json` file. All original/modded
selections and 20 sticker slots are included, without player data or mod assets.

- Switch between pictured **Gallery** and **List** views. Select setups directly
  on their cards/rows; there is no separate ID checkbox list. Drag grips across
  rows or gallery cells, then **Save changes** to commit the new order.
- Open a setup to see its saved in-game preview. **Modded** opens by default;
  **Original** shows the setup visible to players without the mods. Desktop
  choices use installed character/outfit/variant names and exact thumbnails.
  Visual Character/Skin/Variant grids and Vehicle/Wheels/Sticker tabs replace long
  dropdowns. Close and all action buttons stay visible in fixed editor bars.
  **Duplicate** creates a new preset as a template.
- **Create group** selects existing presets. Open a group to rename, add
  members, drag them into order, or remove one with its row icon. Click a member
  to edit it without losing the group draft. Removing membership keeps the preset.
  Group cards also have buttons to change their order in the game's group list.
- **Import preset file** reviews its contents. Confirm updates to existing group
  IDs; identical cosmetics are reused and conflicting preset IDs are remapped.
- Desktop saves both local and Steam copies with recovery backups. The browser
  changes only its in-memory save; download and apply it using the instructions
  below. No Node/Python installation is needed by release users.

Desktop previews come from `%USERPROFILE%\AppData\LocalLow\PixelEdgeGames\TheKarters2\PresetIcons`.
Appearance metadata loads in the background from installed game and mod bundles
and is cached locally. Pictures load as you scroll. In the browser edition, use
**Connect game folder** and choose `TheKarters2` to load the save and pictures together.
Edge/Chrome can remember the granted folder. Setup numbers describe library entries.

**Current limits:** the browser cannot inspect installed cosmetic bundles, so it
uses generic setup/choice labels when local names are unavailable. Automatic
cosmetic Workshop installation remains unavailable. Matching assets must already
be installed; the game may replace missing cosmetics. The full saved preview is
redrawn by the game, while appearance thumbnails show the selected variants.
Sticker placement stays unchanged and is edited in the game.
[Format, evidence and limits](docs/PRESETS.md).

![Direct editing with conditional Save and Discard controls](docs/images/inline-edit.png)

Both Browse groups and My groups offer Gallery and List views, remembered independently. Track previews appear in galleries, group details and import reviews. Steam success messages dismiss after five seconds.

Only reviewed catalog submissions appear in Browse groups. The bundled four collections are under Speedrun; the Community category is ready for future reviewed submissions.

Track identities and public titles/previews are cached in `%LOCALAPPDATA%\TK2 Track Groups\dependencies.json`; subscriptions are always checked against Steam. For an older group whose Workshop IDs were never recorded, import its original `.tk2group.json` to recover and verify the mapping. The game save alone does not contain Steam item IDs, so the app does not guess from a title.

![Review showing numbered track names and installation status](docs/images/import-review.png)

| Bundled group | Official | Workshop |
| --- | ---: | ---: |
| Official 16-Track GP SR.com | 16 | 0 |
| Seren 24-Track SR.com | 0 | 24 |
| CTR99 SR.com | 0 | 18 |
| LEGO Racers '99 SR.com | 0 | 14 |

The saved official group name contains two spaces before `SR.com`; exports preserve it exactly. Official tracks display verified names and bundled previews. Workshop titles come from public Steam metadata. **Refresh library** resolves this repository's public `main` commit, then fetches its catalog and groups from that same revision. The last validated library stays available offline, including when GitHub is unavailable or rate-limited.

## Save safety

Track-group imports modify only the selected custom group in the third profile record. The first two records remain byte-for-byte identical. Preset edits can change the first record and selected preset groups in the third; the separator, built-ins, track groups and unrelated fields are preserved. Local and Steam Remote Storage copies must agree before importing. Writes retain a backup, recheck the original, replace the local file atomically, and verify both copies. Steam manages its Cloud upload; the app never edits `remotecache.vdf`.

Preferences, cache, backups, and diagnostics live in `%LOCALAPPDATA%\TK2 Track Groups`. Closing shuts down the server. During an operation, closing requests cancellation and keeps the window open until the worker finishes safely; close again afterward. See [recovery instructions](docs/RECOVERY.md) if recovery needs attention.

## Contributor setup

Use **Python 3.14 x64**, **Node.js 24**, and npm. From the repository root:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci
npm run build
.venv\Scripts\python.exe launch.py
```

Alternatively, double-click **Launch Track Groups.cmd** for source setup and launch. These are contributor steps, not portable-user steps.

For UI development, run `python launch.py --no-window`, then `npm run dev` in another terminal. Open `http://127.0.0.1:5173`. Vite reads the local backend session and proxies its authenticated API. Stop both terminals afterward. Python changes require restarting the backend; Vite updates React live.

```powershell
python -m unittest discover -s tests
python tools/check_catalog.py
npm test
npm run format:check
npm run build
python tools/build_portable.py
./tools/smoke_portable.ps1 -PortableFolder ./artifacts/TK2-Track-Groups-0.1.0-win-x64
```

The build creates a portable folder and ZIP under ignored `artifacts/`. It bundles Python and compiled UI assets, excludes developer dependencies, and never bundles `steam_api64.dll`. A dedicated helper loads that DLL from the installed game and uses the existing Steam client; it does not launch a second game instance.

The ZIP contains the executable and its dependencies directly at its root: extract it into one chosen folder. Python bytecode is optimized, unnecessary webview package collection is removed, and ZIP compression uses level 9. The compiled interface is small; most portable size is the Python, HTTPS and Windows webview runtime bridge. Neither `node_modules` nor the contributor environment is shipped.

## App updates and future releases

Startup checks stable releases from [this repository](https://github.com/The-Karters-Community/TK2-trackGroup-tool/releases). **Settings → Check for updates** checks again. A portable app with a newer compatible release shows **Update app**. Source checkouts use Git instead. Updates require a button click, verify the archive SHA-256 and every manifest file, replace the current app, then reopen it. Standard `TK2-Track-Groups-<version>-win-x64` folders are renamed to the new version; custom folder names remain as chosen. A destination collision stops before shutdown. Settings, track identities and save backups remain outside the installation folder. Additional user files are preserved, obsolete app-owned files are removed, and temporary rollback files are removed after the new app passes startup verification. A failed startup restores and reopens the previous app.

To make a future release compatible with the updater:

1. Set the same **stable** version in `trackgroups/__init__.py`, `package.json`, and the package lock. Run checks and build from a clean, committed checkout pushed to `main`.
2. Upload both generated files to a matching tag `vX.Y.Z`: `TK2-Track-Groups-X.Y.Z-win-x64.zip` and `TK2-Track-Groups-X.Y.Z-win-x64.zip.sha256`. Keep the generated `portable-manifest.json` inside the ZIP. Draft/prerelease releases are not offered as normal updates.
3. Verify the relocated bundle and updater lifecycle before publishing. `python tools/check_update_lifecycle.py artifacts/TK2-Track-Groups-X.Y.Z-win-x64` compiles an isolated version fixture, tests replacement/rename and failure rollback, and checks shutdown/deletion. It requires Windows and all other app instances to be closed; it changes no saves and publishes nothing.
4. Publish with GitHub CLI, for example `gh release create vX.Y.Z <zip-path> <checksum-path> --title "TK2 Track Groups X.Y.Z" --notes-file <notes-path>`. Only after publishing, advance source to the next `-dev` version. Routine edits do not bump artifact versions.

| Location | Responsibility |
| --- | --- |
| `trackgroups/groups.py`, `profile.py` | Portable format and verified save codec |
| `trackgroups/steam.py`, `worker.py`, `content.py` | Steam helper and content checks |
| `trackgroups/transaction.py` | Backup, writes, verification, recovery |
| `trackgroups/service.py`, `app.py` | State, previews, native window/API |
| `trackgroups/catalog.py`, `catalog/` | Reviewed library and cache |
| `trackgroups/dependencies.py` | Public track identity cache, retained after unsubscribe |
| `trackgroups/updates.py`, `tools/apply_update.ps1` | Verified portable release updates and rollback |
| `ui/src/` | React pages, shared components, one stylesheet |
| `ui/src/web/`, `.github/workflows/pages.yml` | Browser-local save editor and GitHub Pages deployment |
| `trackgroups/presets.py`, `preset_assets.py`, `ui/src/presets/` | Preset format, local package inventory and shared desktop/browser management |
| `tests/`, `tools/`, `.github/workflows/` | Checks, builds, catalog validation |

See [CONTRIBUTING.md](CONTRIBUTING.md) and [format/evidence notes](docs/FORMAT.md). Tool code is MIT licensed; tracks, the game logo and game content retain their authors' rights. Branding uses the same supplied logo/icon as the community mod toolkit.

See the [verification record](docs/VERIFICATION.md) for completed real-account/game tests and remaining test limits. The portable smoke check requires Steam and the supported game, and must run with this app and the game closed.
