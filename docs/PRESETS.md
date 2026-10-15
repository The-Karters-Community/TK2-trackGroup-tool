# Presets and preset groups

Development support targets game **0.1.4.18**. Presets are the first length-prefixed
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
The Original/Modded tabs choose which cosmetic fields to edit; selecting a preset
in the game sets `bUsingModdedVersion` from the game's own display control, so the
app preserves that flag rather than offering a misleading global switch.

The optional **live game preview** companion renders unsaved selections with the
actual game camera. Leave the game at its main menu, then edit a preset in Garage.
Changes settle for 300 ms before requesting a new frame; rotate with the slider.
A temporary detached preset supplies the renderer and is discarded afterward.
No new preset, profile write, or PresetIcons write is made. Successful default-angle images are cached by exact selections in Garage, so saved edits can show the matching render without asking the game to create a preset. Saving still requires
the game closed and the existing verified local/Steam transaction.

Without the companion, Garage keeps the saved full image visible and labels it
when it differs from the draft. Component thumbnails still show exact selections.
The hosted website uses this fallback; browser sandboxing prevents direct access
to the game's Windows pipe. This is a refreshed 3D **render**, not a standalone
WebGL scene or continuous video stream. See [LIVE-PREVIEW.md](LIVE-PREVIEW.md).

## Installation dependencies

Cosmetic material IDs are **not Steam Workshop item IDs**. The first format
preserves them without inventing a subscription mapping. A modded selection
that differs from its original is marked as needing matching assets. Local-only
assets must be installed by their owner. Files under `Mods/` are never bundled,
and `UploadPasswordNotShared.txt` is never read or shared. Automatic cosmetic
Workshop resolution is not yet implemented; existing track subscription support
does not prove cosmetic dependencies are installed. Import requires acknowledging
this limitation. The game itself may replace missing cosmetics on loading.

Desktop changes use the existing backed-up local/Steam transaction, with the game
closed. Browser changes remain in memory and use the same backup/download flow
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
of changed preset data still needs a dedicated smoke test before claiming runtime
compatibility.
