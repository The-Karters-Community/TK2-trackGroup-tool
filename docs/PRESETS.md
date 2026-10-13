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

The game does not store a preset name. The tool displays its native ID; only
groups can be renamed. Editing preserves unrecognized native extension fields.
Deletion is refused for the last preset, a selected local-player preset or an
unmapped quick-setup/history reference. Those should be deleted in the game.

## Dependencies

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
