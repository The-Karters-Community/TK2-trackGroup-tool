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
