# Implementation evidence

## 2026-10-13 — preset format and transactions

- Confirmed first save record contains customization presets; third holds groups
  using `Type=1, SubType=4` and `iPresetID` references.
- Native ID range and quick-creation collision rules checked against local Ghidra
  evidence. Detailed provenance and dependency limits: [docs/PRESETS.md](docs/PRESETS.md).
- Added portable allowlisted export, ID-remapped import, order/membership edits,
  duplication and guarded deletion. Reused local/Steam rollback transaction.
- Python suite: 57 tests passed. No real profile writes performed at this stage.
