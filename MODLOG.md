# Implementation evidence

## 2026-10-14 — pictured preset library and variant metadata

- Verified `PresetIcons/Icon_PresetID_<id>.png` and `_Modded.png` against the
  saved preset IDs. Read both views without changing the game cache.
- Read official material config types 9/12/14/16 and parent display names from
  the installed game config bundle. Read exact mod `iGeneratedTargetUniqueConfigID`
  references, character UI names and `thumbnailsForObjects` variant sprites.
  These sprites represent the appearance variant, not a Workshop page preview.
- First local scan resolved 1,185 variants and 1,182 variant thumbnails. All
  20 saved modded character references resolved on this installation. Display
  metadata and derived PNGs stay under the owner's app cache; game assets,
  upload credentials and raw bundle trees are excluded from Git/exports/builds.
- Added background caching, authenticated/contained preview reads, selectable
  gallery/list rows and buffered dragging using the Track Groups interaction.
  A 200-preset test moves the first entry to the end and requires Save changes.
- Real UI drag moved the first entry across multiple rows; Discard restored the
  original order without writing the profile. Modded opened by default and the
  exact Mephiles, vehicle and wheel variants were checked visually.
- Gates: 65 Python / 60 frontend tests, formatting, catalog and static browser
  checks passed. A production browser build displayed a synthetic 200-preset
  library using a locally chosen PresetIcons folder. No real profile writes.
- Cold packaged validation caught a missing decoder runtime dependency despite
  successful metadata parsing. Added the Python-distribution decoder binary and
  CPU schema resources, plus explicit package checks; the isolated packaged host
  then generated all 1,182 thumbnails. None of these dependencies come from the
  installed game. Failed preview decoding records a local diagnostic and avoids
  treating an incomplete thumbnail cache as valid after restart.
- Final rebuilt ZIP is 26.9 MiB with a flat root; all 239 manifest hashes,
  decoder resources, ZIP checksum/integrity and game-asset exclusions passed.
  A genuinely empty-cache run of that final binary produced 1,182 thumbnails;
  an authenticated exact-variant PNG decoded at 159×160. The host exited through
  its shutdown API, and the package folder could be renamed and restored.

## 2026-10-13 — preset format and transactions

- Confirmed first save record contains customization presets; third holds groups
  using `Type=1, SubType=4` and `iPresetID` references.
- Native ID range and quick-creation collision rules checked against local Ghidra
  evidence. Detailed provenance and dependency limits: [docs/PRESETS.md](docs/PRESETS.md).
- Added portable allowlisted export, ID-remapped import, order/membership edits,
  duplication and guarded deletion. Reused local/Steam rollback transaction.
- Python suite: 57 tests passed. No real profile writes performed at this stage.

## 2026-10-14 — shared preset management

- Added Presets navigation to both editions, selection/batch export, reviewed
  imports, original/modded selectors, sticker slots, duplication and deletion.
- Preset groups have inline name/membership editing, drag order with keyboard
  alternatives, group-order controls and template-based creation inside a group.
- Bounded local inventory reads only Addressable catalogs; found Rascal (character)
  and Sonic Saturm (character/vehicle), excluding the SonicUtopia track package.
  It does not claim to resolve generated cosmetic material IDs.
- Real-save copy: 20 presets, two groups. Full export/reimport was byte-identical;
  duplication preserved separator and third record byte-for-byte. Live saves were
  not changed. Browser duplication, group membership, drag order and export were
  verified on synthetic data; its exported pack passed the Python validator.
- Cosmetic name/preview resolution and automatic cosmetic Workshop installation
  remain explicit limitations. No claim of live in-game preset validation yet.
- Final checks: 60 Python and 56 frontend tests passed, along with formatting,
  catalog and restricted browser-build checks. Distinct presets with identical
  cosmetics retain separate IDs and ordered membership on repeat import.
- Rebuilt the unchanged `0.1.1-dev` portable ZIP (16.7 MiB); verified all manifest
  hashes, ZIP checksum, flat archive root and archive integrity. A relocated
  packaged host connected to Steam, read 20 presets/two groups and exited through
  its shutdown API. Its folder could be renamed afterward; automated deletion
  of the disposable test copy was blocked by approval review. Native WebView
  window close and modified-preset loading in the game remain unverified.


## 2026-10-15: preset editor evidence and save conflicts

- Inspected the supplied eight-second customization video. Character selection,
  skin and variant are separate visual stages; vehicle/wheel choices have two.
- Native `PTK_MainMenuPresetsManager.SetCurrentlySelectedPreset` at
  `0x1807ca5c0` overwrites `bUsingModdedVersion` from
  `iTopButtons_ItemModsEnabled_UseAndShowWithModdedContent_ButtonID == 1`.
  The app must not advertise that persisted bit as a global in-game toggle.
  Preserve the stored bit while editing original/modded material fields.
- Full preset PNGs are game-generated cached renders. Their `.hash` begins with
  the six material IDs. Detect stale material renders rather than claim to
  regenerate a 3D setup offline; current component thumbnails update immediately.
- Save rebasing is limited to unchanged preset/group targets. Recompare the exact
  original cosmetic or group snapshot against a freshly read local profile;
  retain the local/Cloud equality and transaction hash checks. Concurrent edits
  to the same target remain conflicts. Group removal edits references only.
- Real launcher verification exposed Windows packaged-host file redirection:
  resolving a cache file reached LocalCache while resolving its parent directory
  did not. An exclusively created temporary file establishes the physical cache
  root, keeping filename/containment validation intact. An exact installed variant
  PNG was readable after this correction. No game asset is added to the repo.


### TK2 Garage interface and browser connection

- Kept the existing olive/lime theme, component library and one stylesheet.
  Added searchable visual hierarchy, per-category tabs, native dialog focus
  trapping, fixed header/footer and an independently scrolling content area.
- Verified real installed images through the authenticated image endpoint and
  the browser UI. Changing a vehicle immediately changed its component picture;
  the stale full-render image disappeared. No profile write was triggered.
- A nested group member editor returned to the unsaved group name unchanged.
  At 760x560 the header top was 15px and footer bottom 545px; both remained in
  view while the content could scroll. All 20 native presets remain untouched.
- Read-only real-profile transformations preserved separator/profile records for
  one material change, and preserved both preset/separator records for a group
  membership removal. These checks did not replace the live save or Cloud save.
- Browser connection now separates permission/handle lifecycle from WebApp.
  Remembered read-only handles reload only with granted permission; revoked
  permission requires a user click. Ambiguous profiles require selection. There
  is no promise of silent first-visit local access or browser Unity rendering.
- Display branding is TK2 Garage. Repository URLs, updater asset/manifest identity,
  executable filename and application-data path remain stable for existing users.
  Version remains 0.1.1-dev; no release was requested for this change.


## 2026-10-15 — live cosmetic renderer and motion

- Native evidence: LoadForIconRender 0x18076edc0 uses a detached temporary preset;
  TryProcessNextJob 0x18076b620 uses the icon preview item/camera. Avoided the game's
  cache-writing RenderAndAssignPresetIcon 0x18076abe0 and all profile mutators.
- Added optional authored BepInEx companion with current-user-only bounded pipe,
  main-thread Unity work, finite timeout and native renderer lease/cleanup. Menu
  scene only, including lobbies; no online-room prohibition. Missing selected
  character/vehicle/wheel IDs fail explicitly. No gameplay hooks or item changes.
- Compiled against current installed interop: 0 warnings, 0 errors. User opened
  the game after installation. Final companion renders succeeded for Modded,
  Original and 45-degree rotation in 0.90/0.14/0.80 seconds. Invalid vehicle ID
  returned an error. Save bytes and all PresetIcons hashes stayed unchanged.
- Real Garage UI selection changed Crash to Mephiles on the same vehicle, showing
  a new full render with Save disabled while the game runs. Preview drafts remain
  editable without a verified save connection. Save writes retain existing gates.
- Default-angle frames are cached in Garage by exact cosmetic data, never in the
  game's cache. Matching saved edits use the image immediately; arbitrary drafts
  cannot change an existing preset's picture. Native images remain a fallback.
- Pointer-opened dialogs enter over 180ms; backdrop/toast fade subtly. Keyboard
  dialog actions and reduced-motion preferences skip the animation. Desktop and
  website transient notifications now last 10 seconds.
- Exact preview GUID approved in sibling Toolkit policy at the user's request;
  31 assertions preserve physics/unknown-plugin blocking. Rebuilt Toolkit installed
  with standard backup. Actual online-lobby rendering and upload/join behavior
  have not been exercised. See docs/LIVE-PREVIEW.md for limits and build steps.
- App stays 0.1.1-dev. No release, portable EXE or ZIP built for this change.


## 2026-10-16 � independent full-setup Three.js renderer

- Applied Universal Modder/reverse-engineering guidance. REA opened the installed
  GameAssembly.dll; native analysis was unavailable on this Windows provider.
  Used existing local Ghidra pseudocode plus installed serialized data, not an
  invented decompilation result. REA browser scenarios exercised actual WebGL.
- Replaced the default companion frame with local full-setup composition:
  Addressables prefab/dependency resolution, preserved hierarchy/skinning,
  generic menu clips, original-character menu overrides/worker seating transforms,
  vehicle seat/four wheel mounts, hide-vehicle/hide-wheel flags and sticker surfaces.
  A fingerprint gates the native 0.1.4.18 record. No game process, injected DLL,
  companion pipe or Steam connection is needed for this renderer.
- Reduced textures/geometry stay in a 96 MiB local cache. No game/Workshop assets
  enter Git or portable assets. Three.js remains lazy-loaded; website builds
  retain the saved-image path without shipping the Three.js runtime.
- Checked extraction for all 20 saved setups in both views: 38 resolved; two
  modded vehicles were not installed/resolvable. Full scene assembly found the
  original vehicle's two-influence skin format; pad each vertex to four instead
  of misaligning attributes. Visible bounds exclude hidden preview helpers.
- REA verified moving 13-mesh modded Crash and 50-mesh original Bobby scenes,
  with zero companion-render requests and no page errors. Rocketboard excludes
  separate kart/wheels. Its unsupported animation uses a labeled rest pose;
  wheel sizing follows the freshly inspected native normalization callback. Unity shaders/sticker tint and
  humanoid retargeting are not claimed as exact. Live saving remains optional
  companion behavior; this work does not change save transactions.
- Version stays 0.1.1-dev; no release requested.

- A fresh read-only Ghidra export of wheel-spawn callback 0x1809618a0 exposed the
  missing CalculateBoundsAndNormalizeHeight call (0x180966830). Implemented unit
  height normalization before mount sizing. All 38 resolved views now assemble
  with finite visible bounds; one uses a labeled animation rest-pose fallback.
  REA verified original Puma on its selected quad after the normalization fix.

- Final verification: 83 Python tests and 81 UI tests passed; desktop and website
  builds succeeded. Relocated frozen app with no developer PATH decoded both
  preview views, preserved the save hash, exited and allowed folder rename.
  Cleanup deletion was rejected by automatic approval review; test copies remain
  under ignored local/native-smoke-*. Flat ZIP: 27.1 MiB; all 244 manifest entries
  and ZIP SHA-256 matched. No extracted bundles/models, game binaries or steam_api
  DLLs were distributed.


## 2026-10-16 � seated-pose and missing-material correction

- User screenshots exposed that the prior menu-idle choice was a standing pose,
  and texture-only rendering dropped the kart's authored layered shader.
- Read-only Ghidra string comments: 13758=inKart_IdleTrigger, 1300=driving_idle,
  17145=jazda_idle, 13120=idle_menu, 13142=idle_w_menu. Installed native menu
  controller confirms inKart_Idle uses clip index zero, jazda_idle. Use that native
  override and Workshop Driving_idle instead of the standing menu motion.
- Added albedo property resolution, secondary alpha/color and emission layers,
  authored UV scale/offset, transparency/cutout, metallic maps, and animated fire.
  Inspected installed AnimatedFireOpaque DXBC with Windows D3DDisassemble; flow,
  distortion, vertical falloff, smooth threshold, HSV shift and fire emission
  follow those instructions. Three.js lighting and external particles differ.
- Follow HideSuspensionDebugVisuals for suspension authoring surfaces. Share
  encoded texture images once per model and decode each once per extraction.
  Tikal's full payload measured 2.6 MiB; cold extraction measured about 5 seconds.
- All 38 available Original/Modded saved views decoded seated clips and assembled
  with finite bounds and zero rest-pose fallbacks. Two views reference missing
  vehicle assets. Profile hash unchanged. Fresh detached native Tikal reference
  captured for comparison; no plugin deployment or save write performed.
- Version remains 0.1.1-dev; no release requested.

- Verification: 86 Python tests, 83 frontend tests and both Vite builds passed.
  REA captured seated Tikal and Mephiles with no page/shader errors. The frozen
  app decoded Tikal's Driving_idle and original jazda_idle without developer
  runtimes on PATH, preserved the profile hash, served its UI assets and shut
  down cleanly. ZIP is 27.1 MiB; 245 manifest hashes match; flat archive contains
  no extracted model/prefab/bundle assets. Remaining native particles/lighting
  differences are documented rather than claimed as pixel-identical rendering.

### 2026-10-16 - Attached facial meshes, context poses and incremental preview

- Diagnosed the installed Tikal mouth and mouth_smile streams: each has 75
  vertices, one bone index (5), 89 bind poses and no explicit weight channel.
  Unity implicitly gives these vertices weight 1. Preserve that skinning instead
  of treating the facial surfaces as rigid meshes. Cache schema advances to 12;
  application/artifact version remains 0.1.1-dev.
- Decode Workshop Menu/Idle_Menu and original idle_w_menu alongside the seated
  Driving_idle/jazda_idle clips. Selected character parts use standing motion;
  full setups retain seated motion. All 30 resolved saved character appearances
  assembled in both contexts (60 poses), finite bounds, no rest-pose fallbacks.
- Separate the persistent WebGL viewport from bounded part loading. Preserve
  camera and previous interactive scene while fetching, debounce rapid choices,
  share wheel geometry/materials/textures, and render unchanged paused scenes
  only on demand. Lightweight descriptors and cached mounted sticker textures
  avoid resending full setups and loading unused dependencies. The editor offers
  enlarge/reset controls. No additional runtime dependency or game plugin needed.
- Observe stable profile revisions through the existing status poll. Publish only
  complete parsed snapshots, retry transient partial writes, refresh clean open
  preset editors and retain conflicting drafts with an explicit reload action.
  Skip unchanged UI snapshots to avoid redrawing the library on every poll.
- REA browser captures show the previously detached Tikal mouth attached in both
  standing and seated views. Full setup -> selected character reused cached data.
  Local evidence remains ignored; no game/profile assets are added to Git.

- Verification: 89 Python tests and 91 frontend tests passed; desktop and browser
  production builds passed. REA checked standing/seated Tikal, cached mode
  switching, enlarge/reset and reduced-motion pause without page/shader errors.
  A warm descriptor measured 150 compressed bytes / 2.6 ms versus the previous
  full-setup response of 3,400,685 bytes / 797 ms on this machine. Uncached parts
  are still fetched separately; these are not cold-load timings.

- Final portable check: all 244 manifest hashes and ZIP checksum match. Frozen
  app decoded all three skinned Tikal surfaces and both idle clips without
  developer runtimes on PATH. Clean shutdown released the portable folder for
  rename/restore. Profile hash unchanged; updated development Garage reopened.


### 2026-10-16 - Bobby's Garage discovery, Quick Setup and animation showcase

- User confirmed the prior viewer fixes feel smooth. Added CHANGELOG.md with
  user-facing highlights since stable 0.1.0, keeping this development version
  0.1.1-dev and deferring release/publication until explicitly requested.
- Verified the real Steam library contains 132 cosmetic items and 107 subscribed
  tracks, all 107 downloaded. Previous track-only validation incorrectly marked
  those cosmetics missing. Classify installed public catalog paths, exclude
  cosmetic identities from track dependency storage, and scope warnings to
  subscribed downloads and tracks actually used by My groups.
- Watch the Steam Workshop manifest and completed package/catalog revisions;
  refresh metadata in a cancellable background worker and rebuild appearance
  indexes without app restart. Queue retries after transient Steam failures.
  Gate initial model requests until the index is ready and retry after revision
  changes. Loading feedback stays visible while previous geometry remains usable.
- Native GetQuickPreset (0x180558db0) and GetTargetQuickPreset (0x1807c8330)
  confirm QuickCreationPresets[localPlayer].QuickPreset, not the stale legacy
  QuickCreationPreset object. Verified player 1 ID 338088 and all six appearance
  IDs against its supplied .hash. Support six initialized player slots, legacy
  fallback only without the slot array, targeted edits and Save as new preset.
  Ordinary live-save companion lookup does not include Quick Setup: its writes
  remain game-closed transactions, while viewing stays independent.
- Broly retains tiny helper surfaces scattered around his prefab. Their extent
  is below 0.2 percent of the main body but previously dominated framing bounds.
  Exclude negligible surfaces from framing only and keep centering outside
  animated roots. Real standing bounds now center near zero and measure
  1.20 x 1.80 x 0.68 normalized units rather than 1.80 x 0.70 x 0.26.
- Add lazy, categorized installed character clips (88 choices verified for
  Tikal, Broly and Oxide), with pause, scrubbing and speed controls. Decode only
  the selected clip and reuse cached character geometry. Separate weapon-model
  clips and unsupported retargeting are not advertised as full simulations.
- Add My tracks and shared visual track selection for mixed official/Workshop
  groups, with names, thumbnails, status filters and draggable racing order.
  Preserve paste-links entry and validate mixed drafts on the backend.
- Rebrand window/browser UI as Bobby's Garage using the supplied fan art. Keep
  legacy executable/updater/storage identities for installed-update compatibility.
  Add accordion expansion motion and reduced-motion behavior without dependencies.

- Final verification: 96 Python tests and 100 frontend tests passed; desktop
  and static web builds passed. REA exercised mixed official/Workshop selection
  through My tracks into the ordered builder without page errors. Real browser
  checks centered standing Broly and played Oxide Victory. All 88 listed clips
  decoded for both Tikal and Broly. No subscription/save mutations were used.
- Rebuilt flat portable ZIP is 28.4 MiB, still 0.1.1-dev. Verified checksum and
  every manifest file hash, no bundled game assets, startup with only Windows
  on PATH, six Quick Setup slots, 107 ready tracks, frozen Broly geometry and
  Victory animation, unchanged profile hash, clean exit and folder rename/restore.
  Development GUI reopened and health/Steam/appearance readiness confirmed.
  No release, hosted deployment or Git push performed.
