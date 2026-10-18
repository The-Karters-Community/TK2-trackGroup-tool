# Presets and preset groups

Development support targets game **0.1.4.18** and **0.1.4.24**. Presets are the first length-prefixed
JSON record; custom preset groups are `Type=1`, `SubType=4` in the third record.
The separator record, track groups, built-in groups and unrelated profile fields
are preserved. Original and modded character, vehicle, wheel selections and all
20 sticker slots (including their packed settings) travel together.

`.tk2presets.json` version 1 contains only cosmetic configuration fields and
selected preset groups. It contains no profile, account, progress, credentials
or assets. A group references portable preset keys. Import reuses identical
cosmetics or allocates a new native ID in the verified range 100–999998, excluding
existing, quick-creation and dangling referenced IDs. Multiple groups can share
one preset. Existing group IDs require explicit update confirmation; different
IDs with the same name create numbered copies.

The game does not store a preset name. The library displays character names and
setup numbers; only groups can be renamed.
Editing preserves unrecognized native extension fields.
Deletion is refused for the last preset, a selected local-player preset or an
unmapped quick-setup/history reference. Those should be deleted in the game.

## Local previews and appearance labels

The desktop reads both `PresetIcons/Icon_PresetID_<id>.png` and its `_Modded.png`
counterpart. It reads installed official material config types 9/12/14/16,
parent display names, and mod content variant IDs. Character UI names come from
the referenced `CharacterInfo`; exact variant sprites come from `configSprite`
or `thumbnailsForObjects`, not generic Workshop images. UnityPy parses the owner's
installed bundles. Only allowlisted labels and small display PNGs are cached in
`%LOCALAPPDATA%/TK2 Track Groups/appearance`; they are not shipped or exported.

The scan runs in the background and caches by installed bundle path/size/mtime.
Refresh Steam rechecks installed files. Preview reads require the current session
token, enforce PNG filename/path/size limits and are loaded as rows enter view.
Unreadable or missing appearances retain their saved selections with a fallback
label. A saved full-preset render cannot be redrawn by this tool; the game updates
it on loading, while individual item thumbnails reflect edited selections.

The browser's **Connect game folder** opens `TheKarters2` and reads the matching
save plus both Original/Modded PNGs in `PresetIcons`. Edge/Chrome can retain an
origin-scoped read-only directory handle in IndexedDB; no save or image bytes are
stored there. Granted handles reload automatically on the next visit. If permission
expires, **Reconnect game folder** requires a click. Other browsers use a folder
file picker; its native dialog may show folders rather than individual PNGs.
Multiple saves require explicit profile selection. Oversized images and unrelated
files are ignored. Production CSP still blocks network connections. The website
reuses pictured appearances from saved presets, rather than reading Unity bundles.

The editor uses visual category tabs and hierarchical thumbnail grids, with fixed
header/footer controls and inline errors. A child preset editor leaves its group's
unsaved name and membership draft intact. Remove icons only change membership.
The Original/Modded tabs choose which cosmetic fields to edit. Choosing an
appearance also sets the corresponding in-game Original/Modded display flag;
the editor labels the active version before saving.

**Full setup** now renders locally in Three.js from installed official, Workshop
and local bundles. It attaches the character to the vehicle's authored seating
socket, poses the skeleton with its menu animation, and places the selected
wheels on the four authored mounts. Supported sticker surfaces use the saved
placement settings. Orbit, zoom and pause/play work without a running game or
BepInEx. **Selected part** isolates a character, vehicle or wheel. First loads
extract/cache reduced textures and geometry; later loads reuse a bounded cache.
Unity-specific shader effects and sticker tint effects are approximations.
Missing assets show an error instead of silently using a different vehicle.

**Saved image** shows the last real game-generated PNG. It refreshes when the game
updates its icon; it never calls a BepInEx renderer. A closed game cannot create a
new Unity image, while local 3D still reflects the exact current selection.

Saving keeps the editor open. Quick Setup can save through the optional native
bridge while the game runs. Ordinary presets and collection changes use a
collection-only native transaction while running, or the backed-up local/Steam
transaction when closed. **Lobby** reads actual
players and copies a selected setup into All presets through the game’s own
allocation/save method. See [LOBBY.md](LOBBY.md) for verification status.

The website uses saved local images and explicit folder permission. Browser
sandboxing prevents access to the game process or installed Unity bundles.
See [LIVE-PREVIEW.md](LIVE-PREVIEW.md) for distinct preview and save paths.

## Installation dependencies

Cosmetic material IDs are **not Steam Workshop item IDs**. The first format
preserves them without inventing a subscription mapping. A modded selection
that differs from its original is marked as needing matching assets. Local-only
assets must be installed by their owner. Files under `Mods/` are never bundled,
and `UploadPasswordNotShared.txt` is never read or shared. Automatic cosmetic
Workshop resolution is not yet implemented; existing track subscription support
does not prove cosmetic dependencies are installed. Import requires acknowledging
this limitation. The game itself may replace missing cosmetics on loading.

Desktop imports and group edits use backed-up local/Steam transactions. With a verified running game, Garage replaces only the reviewed preset/group collections on the game thread and lets the game save. Other progress and Quick Setup slots stay current. Quick Setup can also be changed through the running
game’s own save method after Steam/profile checks. Ordinary saved presets can also save through the native collection transaction. The former BepInEx save integration is removed. Browser changes remain
in memory and use the same backup/download flow
as track groups; follow the website's Steam Cloud instructions before replacing a
save. A browser cannot inspect the local Mods folder or contact the Steam client.

## Evidence and verification

Read-only inspection of the user's profile confirmed 20 presets and two custom
preset groups. Native pseudocode inspected in the maintainer's ignored SDK:
`GenerateUniqueID` at `0x18055de00` uses `RandomRangeInt(100,999999)` and checks
existing and initialized quick presets; `GetJSON_Data` at `0x18055e040` serializes
the preset list. Metadata declares the six material fields, modded flag and four
sticker fields. This is evidence-bounded format support, not recovered original
C# source. No decompiled files or user save data are shipped.

Tests cover export privacy, signed IDs, Unicode groups, shared membership,
collision remapping, duplicate import, unknown native fields, protected groups,
reserved IDs, order, unchanged records and cloud rollback. Actual in-game loading
of imported preset packs still needs a dedicated smoke test. A reversible
single-preset live edit passed against the running game and was restored; Steam
refresh then found the local and Cloud saves in agreement.

## Quick Setup live saving

The native bridge now saves one Quick Setup while the game runs, without BepInEx.
The open editor refreshes after a verified save. Local and Steam copies are checked,
and only the selected slot's cosmetics change. During a race the current racer is
left alone; the stored setup is available for the next Quick Setup selection.
Race-return transitions remain unverified. Group/import/order writes can also
use the verified running game through the collection-only transaction. See [native evidence](NATIVE-BRIDGE-RESEARCH.md).
