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

## Saved game images

**Saved image** reads the real `PresetIcons/Icon_PresetID_<id>.png` and
`Icon_PresetID_<id>_Modded.png` for the active profile. Filenames come from the
save’s preset IDs, including Quick Setup; no account-specific ID is hardcoded.
The app observes image modification times and refreshes after the game writes
new PNG bytes. Old companion-render caches never replace these images.

Saving keeps the customization editor open and clears only its own draft.
Quick Setup live saves queue the game’s `EnsurePresetIcon` method when its menu
renderer is available. Icon rendering is asynchronous; Garage does not pretend
an old screenshot matches a new selection. When the game is closed it cannot
produce a genuine new Unity-rendered image. Local 3D previews still reflect edits
and saved setups immediately, without a companion or game process.

The BepInEx Game reference renderer, installation controls, ordinary-preset live
save endpoint and packaged companion have been removed. Existing game plugins
installed by the user are left alone. No game assets or extracted models are
redistributed.

## Live Quick Setup and lobby

The optional authored native bridge executes one request on the game’s own
thread, with exact build/profile/baseline checks. It has no BepInEx dependency,
installs no persistent plugin and leaves independent rendering untouched. It is
still an in-process integration, rather than a file-only hot reload.

Quick Setup can be edited with the game closed through the normal backed-up
local/Steam transaction, or saved live through the game’s own serializer. Group,
order and ordinary-preset writes require the game closed. A race keeps its active
racer; the stored Quick Setup is for a later selection. Race-return transitions
remain a separate runtime test.

Lobby browsing and copy behavior, verification status and reverse-engineering
sources are documented in [LOBBY.md](LOBBY.md). Native Quick Setup evidence is in
[NATIVE-BRIDGE-RESEARCH.md](NATIVE-BRIDGE-RESEARCH.md).
