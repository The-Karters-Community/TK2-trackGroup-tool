# Garage previews and live preset saving

Garage itself needs no BepInEx. For installed Workshop and local cosmetic
prefabs, the desktop app can extract a real mesh and reduced textures into its
private cache and show that selected **character, vehicle or wheel** in Three.js.
Drag to orbit and scroll to zoom. No game assets ship with the app. This mesh
viewer does not yet assemble the full kart, apply skeleton animation or reproduce
Unity shaders; **Full setup** uses the game's own renderer for an accurate pose.
Its optional companion renders detached temporary copies without creating a
saved preset. The same companion can ask the running game to save one preset.

## Setup (current development source)

1. Use game build **0.1.4.18** with initialized BepInEx Unity IL2CPP x64
   **6.0.0-be.788+5b766a3**. Run the game once to generate its interop assemblies.
2. With a .NET SDK installed, run `python tools/build_preview_bridge.py` in this
   repository. Only the authored companion DLL is copied to ignored
   `local/preview-bridge/`; installed game/runtime DLLs are compile references.
3. Close the game. In Garage **Settings → Live 3D preview**, click **Install
   preview companion**. This writes only
   `BepInEx/plugins/TK2-Garage-Preview/TK2.Garage.Preview.dll`.
4. Open the game yourself and leave it at its main menu. Open a preset in Garage.
   **3D appearance** works independently from installed assets; **Full setup**
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

- The renderer lives in `MainMenuScene`, including an online lobby in that scene.
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
- Three.js geometry is extracted only on request, from the owner's installed
  `Mods` or Steam Workshop bundles. The app caches it locally. Unsupported or
  missing prefabs fall back to the full saved/game-rendered image. Character
  skinning and exact full-setup composition remain future work.

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
