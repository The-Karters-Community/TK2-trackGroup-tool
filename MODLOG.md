# Implementation evidence

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
