# Changes

## 0.1.2 — 2026-10-19

Changes since 0.1.1.

- Select the exact installation's Unity player thread for live saves and lobby
  reads. Ignore auxiliary windows on other threads without requiring the game
  to be focused or restored; explain mismatched folders and ambiguous instances.

- Fix portable startup when Windows marks the downloaded .NET dependencies as
  Internet files (`Failed to resolve Python.Runtime.Loader.Initialize`). Include
  an application-scoped .NET configuration and test marked DLLs during packaging.

## 0.1.1 — 2026-10-18

Highlights since 0.1.0.

### Group editing and responsive layout

- Acknowledge the actual group-save job, clear saved drafts, and use the refreshed
  baseline for the next edit. Failed saves retain the draft; pending saves cannot
  be submitted twice.
- Enable drag auto-scroll through nested lists and the window edge.
- Cap the lobby gallery at four columns and add a current lobby README screenshot.
- Open customization previews at medium/default window sizes. Add compact
  navigation below 900px and allow Windows resizing down to 480px.
- Keep Home artwork prominent with a single-column layout below 950px,
  natural image proportions, and a shared width for artwork and menu.
- Update CTR99 SR.com to the supplied 18-track racing order (catalog revision 2).

### Preview and documentation polish

- Hide vehicle sticker authoring surfaces in Selected part, matching Full setup
  visibility without changing the paint shader or configured setup decals.
- Prepare up to two lobby setups ahead while retaining a single renderer.
  Cache completed pictures locally (8 MiB / 96 images), keyed by cosmetics and
  installed asset revision, for reuse across navigation and app launches.
- Fix garbled Saving and separator text, add an encoding regression check, and
  shorten status/settings/lobby copy.
- Replace the long README with current app screenshots, concise getting-started
  instructions and keyboard/controller navigation. Move source setup into
  CONTRIBUTING and remove obsolete unreferenced screenshots.

### Live saving and lobby refinement

- Remove game-version and binary-hash allowlists. Resolve field types/offsets,
  array layouts, enum constants and overloads from current IL2CPP metadata;
  validate actual contracts before calls. Compatible patches work automatically.
  Preserve save baselines, permissions and local/Steam verification. Isolate
  optional lobby-capability failures and add Windows native regression coverage.
- Accept numeric profile generations and informational preset-pack build labels,
  retaining strict schema and filename validation.

- Reduce the development portable ZIP from 29.33 to approximately 21.9 MiB by
  excluding unused AVIF/font binaries and build/help modules. Preserve PNG/JPEG/
  WebP, native textures/animations, TLS and the Edge host; add a read-only frozen
  dependency check and an alternate build-output folder. See the
  [package audit](docs/PORTABLE-SIZE-AUDIT.md).

- Keep save notifications above native modals. Enlarge moves the existing 3D canvas
  into a larger dialog without another renderer or model reload.
- Refresh game PNGs independently of profile writes, bypass stale browser caches,
  and retry brief image replacements. Queue asset rescans, retry partial indexes,
  detect in-place bundle updates and regenerate missing thumbnail caches.
- LB/RB switches customization categories; LT/RT pages. Alt+Left/Right switches
  categories on the keyboard. Selecting an appearance also selects its in-game
  Original/Modded version explicitly.
- Add native collection transactions for ordinary preset edits, duplication,
  deletion, reordering, groups and track imports while the game runs. Compare
  reviewed collections, retain backups, let the game save, verify memory/local/
  Steam, and roll back only those collections if needed. Unrelated race progress
  does not invalidate an unchanged collection review.
- Verify native compatibility for game builds 0.1.4.18 and 0.1.4.24. An initial
  reference-setter bug was corrected before successful real save/restore tests;
  both save copies were unchanged by the failed pre-save test.
- Find official character menu poses by MonoScript and serialized references,
  avoiding a scene byte offset that broke on game updates. Cache trimmed full-setup
  lobby pictures with comfortable margins.
- Resolve lobby appearances using the game's actual Original fallback rules,
  including official assets with unset Modded fields. Distinguish unsupported
  installed geometry from a missing package.
- Separate Copy to a saved local Quick Setup slot from Save preset. Keep card
  identities stable across polling, disable already-saved setups, and update only
  the affected card. Each card gets a cached local setup PNG through one serial
  renderer; interactive 3D is optional and off by default.
- Add permission-gated CPU customization and a shared saved-preset chooser for
  CPU and local Quick Setup. Remote human racers are never editable. Native race,
  room-authority and temporary-download behavior is documented in LOBBY.md.

### Bobby’s Garage

- Rebrand the desktop window and browser app with the new name and supplied
  garage artwork. Existing portable filenames, updater identity and user-data
  locations remain compatible.
- Add Quick Setup alongside saved presets, including the game's six local-player
  slots, actual profile-specific icon IDs, separate editing and Save as new preset.
- Add pictured preset galleries, selection, export/import batches, preset groups,
  duplication, deletion, and smooth drag reordering across rows and gallery cells.
- Replace numeric customization dropdowns with named character, skin and variant
  grids. Keep modal headers, close buttons, save/discard and actions accessible.

### Navigation and large collections

- Open on a dedicated Home page with BobbyGarageArtwork.png artwork and shortcuts to
  Quick Setup, presets, track groups, downloaded tracks and settings. Restore
  the game logo in the sidebar; rename track navigation explicitly.
- Paginate visual libraries by complete rows, a custom positive row count or
  Show all, calculated from the current column count. Remember row preferences
  per library and use fewer default rows in narrow windows. Use one compact count/rows/page bar; keep item counts for lists.
  Preserve selections across pages and add moving selected presets to a position.
- Replace stacked appearance accordions with a Character/Skin/Variant step rail.
  Keep desktop preview and picker scrolling separate; open the preview on large screens and collapse it
  in smaller windows, with close/save/discard always accessible.
- Add alphabetical, newest/oldest added, recently picked, most picked and
  favorites-first sorting. Added dates use installation/first discovery; picking
  history records Garage use, not Steam-wide popularity or in-game history.
- Star presets, preset groups and appearances. Group-member stars are shared with
  All presets; preferences remain in Garage data and never enter exported packs.
- Replace the Quick Setup player dropdown with six controller-slot buttons,
  saved thumbnails and separate in-session drafts. Switching slots or closing and
  reopening Quick Setup retains these drafts; it does not change game controllers.
- Export several track groups as one versioned `.tk2groups.json` file. Open packs
  in either edition and review groups individually before importing.
- Rescan installed appearances before retrying model failures; identify saved
  appearances absent from local content and keep preview feedback readable.
- Improve phone navigation, pagination and toast sizing.

### Independent previews

- Add local Three.js models and full setups from installed official, Workshop and
  local cosmetic assets. Default rendering requires neither the game nor a plugin.
- Reconstruct skeletons, authored vehicle/wheel sockets, seating, material layers
  and stickers. Correct single-bone facial meshes that separated during animation.
- Use standing menu idle for selected characters and seated idle for full setups;
  center previews outside animated transforms and fit narrow/wide viewers.
- Add grouped animation browsing with lazy decoding, pause, scrubbing and speed
  controls. Dedicated item-model clips and unsupported retargeting remain excluded.
- Reuse the WebGL renderer and bounded part caches, retain the previous preview
  during loading, share repeated resources, and avoid unchanged paused redraws.
- Show loading feedback and allow larger previews/reset view. Animate accordion
  expansion and respect reduced-motion preferences.
- Remove the former BepInEx renderer, installer and ordinary-preset live-save
  integration. Saved image reads genuine game-generated PNGs and refreshes when
  the game updates them. Queue icon refresh after native Quick Setup saves; a
  closed game still supports independent 3D and backed-up offline editing.

- Add a small native Quick Setup bridge without BepInEx. Validate the exact live
  target and installed choices, back up first, save through the game's API and
  verify local/Steam copies. Refresh an open Quick Setup editor after saving.
  Live write/restore and UI-to-game round trips passed in build 0.1.4.18; collection writes and read paths were also verified in 0.1.4.24.
- Open 3D on large screens and collapse it in smaller windows. Remove duplicate
  side controls and show larger
  contained part thumbnails next to categories. Selected characters support
  animation selection, pause, scrubbing and speed, starting in standing idle.
- Simplify collection commands into a compact toolbar and More menu; use pictured
  group rows/cards and visible gold favorite states. Favorite exact appearances
  once, with stars on every tile including the selected item, and open all saved
  variants directly from Favorites. Skip single-choice refinements, number the
  selection steps and distinguish the green Save action from selected choices.
  Saving keeps the modal open. Convert older
  character/skin stars to representative exact appearances.
- Restore draft dragging during gameplay, including group order and members.
  Reordering saves use the verified native collection transaction while the game runs.

### Simpler navigation and input

- Combine Discover groups, My groups and My tracks under one Tracks destination.
  Discover focuses on import; group export remains in My groups.
- Simplify Home to a game-style main menu: Quick Setup, Presets, Tracks and Lobby.
- Equalize category controls and center Original/Modded. Fix thumbnail line-clamp
  inheritance that cropped pictures in smaller windows. Keep fixed editor chrome.
- Add spatial keyboard arrows, Enter/Space, Escape and Ctrl+S. Standard controller
  support reads only while Garage is focused; help explains its controls.
- Add a distinct Lobby page with actual player appearances and one-click copying
  to All presets. Recheck the source, preserve all cosmetics/stickers, allocate
  through the game and verify local/Steam saves. No persistent plugin is installed.
  Runtime coverage is recorded in docs/LOBBY.md.

### Steam and track groups

- Add My tracks and a visual group builder for official/downloaded tracks, with
  search, source filters, thumbnails and ordered selection. Workshop links remain
  available for tracks not already in the library.
- Refresh completed Workshop changes automatically, including newly downloaded
  cosmetics. Retry model availability when the installed appearance index changes.
- Fix cosmetic items being reported as missing tracks. Distinguish subscribed
  downloads from missing dependencies in My groups and unused community entries.
- Allow outside-click dismissal of group dialogs in both desktop and browser UI.

### Browser edition and save preservation

- Add the static browser edition for browsing Speedrun/Community groups and
  preparing track/preset edits locally without an executable or profile upload.
- Preserve unknown/native profile fields and unrelated records. Support
  permission-based local folders, preset images, and lossless save-number handling.
- Observe stable game-side save changes, refresh untouched editors, and preserve
  conflicting unsaved drafts instead of overwriting them.
- Preserve distinct identical presets during import and keep existing group
  membership and ordering semantics.

Verification evidence and implementation boundaries are recorded in `MODLOG.md`
and the relevant documents under `docs/`.
