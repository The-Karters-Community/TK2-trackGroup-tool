# Changes

## Unreleased — 0.1.1-dev

Highlights since the stable **0.1.0** release. This section remains a draft until
a release is requested; development builds do not advance the release version.

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

- Open on a dedicated Home page with BobbysGarageV4 artwork and shortcuts to
  Quick Setup, presets, track groups, downloaded tracks and settings. Restore
  the game logo in the sidebar; rename track navigation explicitly.
- Paginate visual libraries by 1–4 complete rows, calculated from the current
  column count. Use one compact count/rows/page bar; keep item counts for lists.
  Preserve selections across pages and add moving selected presets to a position.
- Replace stacked appearance accordions with a Character/Skin/Variant step rail.
  Keep desktop preview and picker scrolling separate; offer a collapsible preview
  on phones, with close/save/discard always accessible.
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
- Keep optional native game-reference images and guarded live saving for existing
  ordinary presets. Quick Setup and structural save edits still require the game
  closed; extracted game assets are never distributed.

- Verify a temporary native hook can read two local-player Quick Setup slots on
  the real game's Unity thread without BepInEx. It leaves save bytes unchanged
  and unloads afterward. This is research only; native live saving is not enabled.

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
and the relevant documents under `docs/`. Nothing in this section means that a
new stable release or updated hosted deployment has been published yet.
