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

### 2026-10-16 - Garage home, collection navigation and native bridge research

- Add a real Home entrance using user-supplied BobbyGarageArtwork.png; restore
  logo.png in the sidebar. Rename track navigation and import action labels.
- Shared bounded pagination covers track/preset libraries, appearance grids and
  group membership. Keep batch selections across pages/search and merge page
  reorders into the full order. Add Move selected to position for long libraries.
- Versioned tk2-track-groups v1 packs export selected groups in one file, with
  backend validation and a native Save dialog. Both editions reopen packs for
  individual review; export never includes unrelated profile fields/assets.
- Audit all 686 installed vehicle variants: every indexed model dependency
  resolves. Saved vehicle IDs -2103725914 and 2109459607 are absent from all
  132 installed cosmetic metadata packages. Mark unavailable saved choices
  explicitly; rescan/retry rebuilds the index and resets viewer part caches.
- REA browser checks at 1180, 780 and 390 pixels exercised Home, direct Quick
  Setup, vehicle pagination, track pagination and four-group batch download
  (browser harness cancels downloads by design). Fix phone toast sizing found
  in the screenshot pass. No game save mutations used for these checks.
- User authorized investigating an optional native integration without BepInEx.
  Native GetQuickPreset reads the in-memory array. LoadProfileLocalData is
  reached from platform initialization, not focus or race-return file watching.
  QuickPresetEditingApproved copies approved fields, updates the target player,
  and calls SaveProfileLocalData. A race-safe deferred path must only update
  the quick slot, not replace the active racer.
- Compiled a 153600-byte read-only thread-hook probe in ignored local/. All
  required IL2CPP exports are present in installed GameAssembly.dll. Uses
  a thread-specific WH_GETMESSAGE hook and current-owner shared mapping, no
  BepInEx reference, game binary patch or save write. Actual game-thread and
  Quick Setup runtime verification awaits the requested main-menu game launch.
  This probe is not bundled or exposed as a working live-save feature.
- Controlled native transport fixture: hook callback thread matched the owned
  window thread exactly; private mapping returned the expected No GameAssembly
  error. This does not establish game integration. Research limits and specific
  game save/menu methods are recorded in docs/NATIVE-BRIDGE-RESEARCH.md.
- Final UI milestone verification: 104 frontend tests, 97 Python tests, desktop
  and browser builds. Flat portable ZIP is 29.2 MiB; hashes/manifest verified,
  old fan-art copy removed, no experimental bridge bundled. Frozen app connected
  Steam, detected six Quick Setup slots, loaded Broly geometry/Victory clip,
  preserved the profile hash and released its folder on shutdown. Development
  Garage reopened and healthy. No release, push or hosted deployment performed.


## 2026-10-16 - Compact library navigation and native read proof

- Complete-row pagination uses measured columns; compact bars, flat appearance steps, independently scrolling desktop preview/picker and mobile preview disclosure.
- Local player controller-slot buttons preserve separate in-session drafts. Favorites and Garage activity are private app metadata, not profile edits or exported assets. Installation/first discovery and Garage picking activity are explicitly labeled.
- Real read-only hook probe: PID 16160, callback/window thread 15840, IL2CPP attached, Unity GameObject.Find accepted. Read P1 338088/P2 253303; repeated probe preserved local profile SHA-256; DLL absent from game module list afterward. No writes or BepInEx calls. See docs/NATIVE-BRIDGE-RESEARCH.md for limits.
- Verification: 109 frontend and 100 Python tests pass; desktop/browser builds pass; static web isolation verified. REA screenshots checked at 1180/820/390 px with no page errors. Frozen startup with Windows-only PATH verified six Quick Setup slots and 107 downloaded tracks, Broly model/Victory clip; local profile hash unchanged, clean shutdown and folder rename succeeded. Flat dev ZIP remains 29.2 MiB. Final frontend-only correction refreshed packaged assets and manifest/checksum. No release or push.


## 2026-10-17 - Live Quick Setup and simpler Garage controls

- Authored x64 native bridge uses one current-owner-only mapping and temporary WH_GETMESSAGE hook, exact installed executable/profile/baseline validation, runtime configuration checks and game-owned SaveProfileLocalData. No BepInEx dependency or installed game files. GameAssembly SHA-256 is pinned in native_quick.py.
- Real game PID 16160 / Unity thread 15840 / editor screen 115: changed original wheel and restored; local and Steam copies verified, menuRefreshed true both ways. Other presets/groups/five player slots preserved. Browser Save-to-running-game selected modded wheel 573555 and persisted through the same path, then restored original. Wrong profile, conflicting baseline and unavailable configuration rejected without save-byte changes.
- UI: collapse model decoding by default, stronger gold stars, one exact-appearance favorite with direct favorites view and legacy conversion, compact command toolbar/More menu, pictured preset groups, larger contained category thumbnails and selected-character animation controls. Restore draft dragging during gameplay; structural saves remain explicitly blocked until game exit.

- Final verification: 113 frontend / 103 Python tests pass; desktop and web builds pass; static website isolation verified. REA checked 1920/1180/390 layouts and Broly selected-part Victory playback without page errors. Relocated frozen native-read and Steam helpers passed with Windows-only PATH; profile bytes unchanged, manifest/checksum and no bundled game assets verified. Flat ZIP 29.3 MiB. Existing GUI and its unsaved draft left open pending restart approval. No push or release. Race/lobby transitions remain unverified.


## 2026-10-17 - Selection audit, Tracks hub and native lobby copying

- Consolidate Tracks navigation, game-menu Home, inline tile favorites including selected/single variants, numbered refinements with single-choice skipping, custom/all row pagination, equal contained category images and narrow-screen defaults. Wide screens open independent 3D; Save has a distinct green action and keeps the editor open.
- Remove BepInEx renderer/install/save routes and C# companion sources from Garage. Saved image reads genuine game PNG revisions; offline 3D remains independent. Existing installed game plugins are untouched. Ordinary preset/collection writes still require game exit; native Quick Setup works live and offline.
- Add spatial keyboard navigation and focused standard-controller navigation. Ctrl+S/Menu saves deliberately; A does not trigger Save/Delete. Physical hardware remains unverified.
- Native v2 lobby integration resolves occupied slots on the Unity thread and copies complete original/modded cosmetics through game-owned AddNewPresetFrom. Exact profile/baseline/content checks, local+Steam verification, deduplication and scoped rollback preserve existing progress. No BepInEx dependency.
- Actual online lobby returned local player plus seven CPUs. Production copy generated original/modded PNGs and hash; exact test-copy cleanup preserved all original presets, groups, six Quick Setup slots, source setup and other native/profile records. Remote human-player copy and race-return transitions remain untested. Evidence in local/lobby-runtime-proof.json; public technical notes in docs/LOBBY.md.
- Verification: 137 frontend and 102 Python tests passed. Desktop/static-web builds and web isolation passed. Browser screenshots checked Home, actual lobby and compact Quick Setup; 390/740px layouts had no picker overflow and reachable footer.
- Flat portable ZIP 29.3 MiB: every manifest hash and ZIP checksum verified, no game assets or Bep companion bundled. Frozen Windows-only-PATH startup connected Steam (107 downloaded tracks), read six slots, decoded Broly geometry/Victory animation, preserved profile bytes, shut down cleanly and released folder locks. Relocated frozen native/Steam helpers and eight-player lobby read passed. Updated development Garage reopened; game left running.
- Release description maintained in CHANGELOG.md; UI audit in docs/UX-AUDIT-2026-10-17.md. No push, hosted deployment or public release. Both origin push URLs preserved.


## 2026-10-18 - Live libraries, robust lobby and official-character previews

- Move feedback into the topmost native modal, preserve its 10-second visibility,
  fix Enlarge by moving the existing canvas, refresh genuine game PNGs independently
  of profile writes, and add LB/RB category navigation plus keyboard equivalents.
- Save ordinary presets/groups/imports/order through bounded collection-only game
  transactions while running; retain baselines, backup journals, exact target-only
  recovery and local/Steam verification. No whole-profile race-progress rollback.
- Add explicit saved local Quick Setup targets, distinct Copy/Save, per-part
  permanent Workshop retention, stable player cards, saved deduplication, verified
  CPU edit capabilities and a reusable pictured preset chooser.
- Generate lazy full-setup PNGs through one serial offscreen renderer with bounded
  decoded/image caches. Optional interactive 3D remains off by default. Correct
  Original fallback previews, including Selected part and category thumbnails.
- Replace the official menu decoder's absolute scene offset with a bounded
  serialized object-table/MonoScript lookup. Real 0.1.4.24 original poses decode;
  all eight actual lobby cards render, with standing official character previews.
- Fix destroyed Unity static references after race transitions using op_Implicit.
  Real game proofs: library reorder/restore, CPU change/restore, fallback copy and
  cleanup, race copy/cleanup, explicit race CPU-edit rejection. Existing presets,
  groups, six Quick slots, other records and local/Steam agreement preserved.
- One earlier pre-save native reference-setter experiment crashed before writing;
  fixed field_set_value_object and verified real reversible collection writes on
  supported builds. The failed pre-save experiment changed neither save copy.
- Release description maintained in CHANGELOG.md. Remaining physical-controller,
  remote-human, online-authority and automatic-download lifecycle limits are
  documented in LOBBY.md. No game assets, passwords or extracted code bundled.
  No public release, push or hosted deployment requested.

- Final verification: 161 frontend + 146 Python tests, desktop/web build and static
  isolation, 4-group/72-reference catalog. REA verified all eight actual lobby PNGs
  and enlarged official seated/standing previews with no page errors. Frozen
  Windows-only-PATH startup, six Quick slots, official standing clip, Broly/Victory,
  real eight-player native read and Steam read passed. Profile unchanged; clean
  shutdown and portable relocation/deletion checks passed. ZIP remains 29.3 MiB.


## 2026-10-18 - Commit backlog and audit bridge compatibility/package size

- Commit 3512bb5 records live-library/lobby/preview fixes; 9a22e79 records the
  separately supplied artwork update. No push or release requested.
- Document exact-hash native gating plus the broader desktop version gate for
  Steam refresh and writes. Dynamic IL2CPP lookup still uses pointers/private
  contracts and does not guarantee any-build compatibility. Gates retained.
- Measure ZIP contents, then exclude unused AVIF/native-font/build/help modules.
  Lean Deflate ZIP: 29.33 -> 21.94 MiB, approximately 25% smaller. Existing Garage
  stays open untouched. No new production dependencies or downloaded runtimes.
- Frozen Windows-only-PATH check initialized Edge/.NET/TLS, decoded fresh official
  and Workshop models/animations, vehicle/wheels, and round-tripped PNG/JPEG/WebP.
  Frozen Steam read preserved profile bytes and local/Cloud agreement. Manifest,
  exclusions and 161 frontend/146 Python tests passed. Game had been closed before
  a new native request, so no new live test is claimed for this package. Rebuilt
  native .text section equals the previously runtime-tested bridge.
- Solid 7z experiment measured 17.72 MiB; default remains ordinary ZIP. No 10 MB
  full-feature build demonstrated; architecture changes would need separate proof.
