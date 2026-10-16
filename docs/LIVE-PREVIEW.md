# Garage previews and live preset saving

## Independent full-setup rendering

Garage's desktop **Full setup** is an interactive Three.js scene. It reads the
owner's installed official, Workshop and local assets, preserving the prefab
hierarchy, skeleton/bind poses, seated driving-idle animation, character seating offset,
vehicle seat/wheel sockets and per-wheel scale. Characters that hide the kart
and vehicles that hide separate wheels are respected. Sticker textures use the
vehicle's authored surfaces and saved packed position/size/rotation/opacity.

No running game, Steam connection, injected DLL or BepInEx is needed to render.
Drag to orbit, scroll to zoom, enlarge the preview or reset the camera. Pause/Play
controls motion; reduced-motion preferences start paused. **Selected part** shows
characters in their standing menu-idle animation; **Full setup** uses seated idle.
One WebGL renderer and lighting environment stay alive across selections. The
previous setup remains interactive while a selection loads. Parts are fetched
individually with a bounded 48 MiB in-memory cache, shared wheel geometry and
textures, and a 96 MiB on-disk cache. Stationary paused previews render on demand.
Initial extraction of an uncached installed bundle can still take several seconds.
No extracted assets are distributed or included in portable files.

Garage observes the selected profile during its regular status poll. Game-side
saved edits appear after the file is stable (normally within about 1–2 seconds),
without reopening the editor. An untouched draft follows the game; unsaved edits
are preserved with an explicit conflict notice and **Load game version** action.
Partial writes retain the last valid snapshot and are retried. This observes disk
saves, not changes that the game has not saved yet. Cached preset icons also use
file revisions to refresh when the game replaces them.

Original character seating and menu overrides currently target **0.1.4.18**.
A fingerprint verifies the narrow native menu record before using its references;
an incompatible layout fails explicitly. Generic streamed/dense/constant Unity
transform animation is supported; humanoid muscle retargeting and arbitrary
script curves are not. Standard Three.js materials approximate Unity shaders;
sticker tint/color effects are not reproduced. Missing assets are reported. Clips that expand the model abnormally fall back
to a labeled rest pose. Wheel bounds are normalized to unit height, matching
the game, before the authored per-wheel size is applied.
The browser edition still uses saved images and explicit folder permission; it
cannot decode the desktop's installed Unity bundles.

## Optional game reference and live saving

**Game reference** requests a Unity-rendered comparison image through the
optional companion. It renders detached temporary copies without creating a
saved preset. The same companion supports saving one existing preset through
the game's own method while it is at the main menu. Rendering locally and
synchronizing the running game's in-memory save are separate operations.

## Setup (current development source)

1. Use game build **0.1.4.18** with initialized BepInEx Unity IL2CPP x64
   **6.0.0-be.788+5b766a3**. Run the game once to generate its interop assemblies.
2. With a .NET SDK installed, run `python tools/build_preview_bridge.py` in this
   repository. Only the authored companion DLL is copied to ignored
   `local/preview-bridge/`; installed game/runtime DLLs are compile references.
3. Close the game. In Garage **Settings → Game connection (optional)**, click **Install
   preview companion**. This writes only
   `BepInEx/plugins/TK2-Garage-Preview/TK2.Garage.Preview.dll`.
4. Open the game yourself and leave it at its main menu. Open a preset in Garage.
   **Full setup** works independently from installed assets; **Game reference**
   uses the native game renderer and refreshes after a short debounce.
5. Connect Steam and resolve any profile/Cloud conflict. You can save changes to
   one existing preset while the game remains at its main menu. The companion
   checks the selected profile and exact previous cosmetic values, updates that
   preset in memory, and calls the game's own `SaveProfileLocalData`. Garage
   keeps a safety copy and verifies the local result. Imports, group edits,
   deletions, duplicates and reordering still require the game closed.

Use **Remove preview companion** with the game closed to remove only this DLL.
The companion is optional and disabled by removing it; it has no persistent
config or background process outside the game.

## Boundaries

- The optional companion renderer lives in `MainMenuScene`, including an online lobby in that scene.
  No online-room restriction is imposed; races use a different scene and are not
  supported. Actual online-lobby rendering remains to be manually validated.
- Toolkit compatibility approves exactly `community.tk2.garage.preview` in the
  current SDK source. Older Toolkit releases may flag unknown plugins until the
  Toolkit is updated. Gameplay changes and every other plugin remain protected.
- Requests pass through the authenticated Garage API and a bounded Windows pipe
  restricted to the current Windows user. Only status, cosmetic render and
  single-preset save requests are accepted. No arbitrary paths, scripts or calls.
- Live saving checks the selected save filename and target against both the
  current local save and the game's in-memory preset. A stale target is refused.
  The game owns serialization and Steam sync. Garage never writes its save while
  the game is running. Backups are in Garage's `backups/live-presets` directory.
- Unity operations run on the main thread. The companion leases the native icon
  renderer only when its own queue is idle, then restores its camera/item flags,
  rotation and queue. It restores `runInBackground` on companion teardown.
- Missing selected character/vehicle/wheel IDs return an error instead of claiming
  the game's fallback model matches. Missing sticker content may use the game's
  own fallback; dependency installation is not implemented for cosmetics.
- Successful default-angle frames are retained in Garage's own bounded cache
  (128 frames / 32 MiB), keyed by exact cosmetic data and view. Saving the matching
  draft can reuse that image immediately; no game-generated preset icon is needed.
  Rotated frames stay temporary. Asset updates that reuse IDs need a fresh render.
- A finite request timeout, per-edit debounce and client cancellation prevent a
  continuous capture loop. A render already loading in Unity can finish after
  the user changes selection; stale responses never replace the current image.
- Static websites cannot access named pipes or silently access game directories.
  They retain saved images and appearance thumbnails with explicit stale labels.
- Independent geometry, textures and clips are read on request from the owner's
  installed assets. Authentication and bounded sizes apply to the local endpoint.
  Requests for Full setup do not use the companion pipe. Original/modded changes
  do not alter the profile until a separate Save action succeeds.

## Evidence

For 0.1.4.18, inspected native Ghidra pseudocode:
`PTK_PlayerPreviewItem.LoadForIconRender` (0x18076edc0) makes a detached preset copy;
`PTK_MenuIconRenderManager.TryProcessNextJob` (0x18076b620) uses the same preview
item/camera. The game's `RenderAndAssignPresetIcon` (0x18076abe0) writes the cache;
Garage's render operation does not call that method, RenderIcon, or profile
mutators. Its separate single-preset save operation calls the game's
`SaveProfileLocalData` after checking the active profile and prior values.
Current interop confirms signatures; these declarations are not original source.
Generated native evidence and game assets stay local, outside Git/releases.

On 2026-10-15 the running game returned genuine 500×500 images for a modded setup,
a different unsaved vehicle, its original version and a 60-degree rotation. First
capture: 1.28 seconds; subsequent captures: 0.13–0.70 seconds. The save bytes and
all cached preset-icon hashes stayed unchanged. These timings are observations
on one setup, not a general performance guarantee or online-lobby validation.
The independent viewer was checked with installed Crash & Aku Aku, Land Smasher
vehicle and Arsene Wheels prefabs: configuration IDs resolved to exact local
prefabs and generated model data. A browser inspection showed the textured Crash
mesh loading and responding to mouse rotation. A separate live test on the
running game changed one preset's original/modded selection, verified that the
game wrote it to the local save, then restored the original selection through
the same path. The final preset and group data matched the initial snapshot;
a subsequent Steam refresh found local and Cloud saves in agreement. This does
not yet validate visual changes in a race or every cosmetic combination.

## Portable packaging

Compile first, then use `python tools/build_portable.py --preview-companion
local/preview-bridge/TK2.Garage.Preview.dll` when explicitly building a distribution.
Only this authored DLL is included; no BepInEx, interop assemblies, game assets or
.NET compile references are shipped. Normal builds omit the optional companion.

### Independent renderer verification (2026-10-16)

REA browser scenarios rendered an animated 13-mesh modded Crash setup and an
animated 50-mesh original Bobby setup. Captured frames changed over time; both
used the local model endpoint without companion-render requests or page errors.
An original vehicle's two-influence skin layout exposed a conversion bug; the
reader now pads per vertex to Three's four-influence format, with a regression
test. The installed library was also checked for a vehicle-hiding rocketboard.

Native evidence used for composition: `PTK_PlayerPreviewItem.SetupCharacter`
(0x180770290), `SetPlayerInCorrectPosition` (0x18076fe40),
`PTK_KartVisual.InitWheels` (0x18095a270), and
`PTK_ModVehicleWheelsSetupPreview.Update` (0x180a6d080). Sticker packing and
placement follow `CStickerIntBitVariable` (0x180a6ac90),
`IntVariablePacker.UnpackVariables` (0x180a53680), and
`PTK_VehicleStickerInfo.SetStickerSetting` (0x180a73310).
Wheel loading was additionally verified by a fresh read-only local Ghidra
export of `PTK_KartVisual.<SpawnWheels>b__0` (0x1809618a0), which calls
`PTK_KartVisual_WheelParams.CalculateBoundsAndNormalizeHeight` (0x180966830).
The latter resets child zero and normalizes its renderer bounds to unit height.
These are observations from Ghidra pseudocode and serialized assets, not
recovered original C# source. REA's native Windows provider could not analyze
this DLL; local Ghidra supplied the missing callback evidence.

All 38 resolvable views from the owner's 20 saved setups assembled with finite
bounds. Two modded views referenced unresolved vehicles. One rocketboard clip
needs runtime retargeting and displays a labeled rest pose. REA also verified
the normalized original Puma/quad/wheel setup with no companion-render requests.


### Seated poses and material corrections (2026-10-16)

The initial independent preview selected the wrong controller state. A read-only
Ghidra string lookup established `inKart_IdleTrigger`, and the installed menu
controller maps `inKart_Idle` to `jazda_idle`. Workshop SetupCharacter overrides
that motion with `Driving_idle`; `Idle_Menu` belongs to the separate standing
state. Garage now uses the seated clip for both original and modded characters.
All 38 resolvable saved views assembled with decoded seated clips and no rest-pose
fallback. The two unresolved modded views referenced unavailable vehicle assets.

The local material reader includes `_AlbedoTex`, secondary alpha/color, emission,
metallic textures, authored UV transforms and alpha/cutout properties. The fire
mask, scrolling/distorted noise, vertical falloff, threshold/edge smoothing and
HSV hot-color blend follow the owner's compiled AnimatedFireOpaque pixel program,
inspected using Windows D3DDisassemble. Extracted shader code stays local. Shared
texture data is encoded once per model to keep the preview payload bounded.
Suspension authoring guides are hidden following HideSuspensionDebugVisuals.

REA exercised Tikal's seated setup with the pink kart and its selected wheels;
a fresh game-reference image was captured without changing the preset. These
fixes do not make Three.js pixel-identical to Unity: lighting/reflections differ,
and effects spawned separately by the game (such as exhaust smoke) are not part
of the installed cosmetic prefab renderer. The optional Game reference remains
the comparison for those engine-specific effects.

## Quick Setup live saving

The native bridge now saves one Quick Setup while the game runs, without BepInEx.
The open editor refreshes after a verified save. Local and Steam copies are checked,
and only the selected slot's cosmetics change. During a race the current racer is
left alone; the stored setup is available for the next Quick Setup selection.
Race-return/lobby transitions remain unverified. Group/import/order writes still
require the game closed. See [native evidence](NATIVE-BRIDGE-RESEARCH.md).
