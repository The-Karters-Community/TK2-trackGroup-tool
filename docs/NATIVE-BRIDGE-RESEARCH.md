# Native Quick Setup integration research

Status: **investigation, not a working live-save feature**. The current product
still protects Quick Setup disk writes while the game runs. The user authorized
investigating an optional integration without BepInEx on 2026-10-16.

## Verified game behavior

These observations come from the installed IL2CPP build 0.1.4.18 and local Ghidra
pseudocode, not recovered original C#.

| Method | Address | Observed behavior |
|---|---|---|
| `PTK_PlayerProfile.GetQuickPreset` | `0x180558db0` | Returns the local player's in-memory QuickCreationPresets slot. |
| `PTK_PlayerProfile.LoadProfileLocalData` | `0x18055a8f0` | Loads the profile through the platform save service. The analyzed caller is platform initialization. |
| `Ant_CurrentGameConfiguration.OnApplicationFocus` | `0x180501fb0` | Handles cursor/focus behavior, not a profile-file reload. |
| `PTK_MainMenuPresetsManager.LoadQuickPresetForEditing` | `0x1807c9050` | Copies Quick Setup into editor working objects and updates the player's preview. It also takes the current Original/Modded menu state into account. |
| `PTK_MainMenuPresetsManager.QuickPresetEditingApproved` | `0x1807c9bb0` | Copies approved cosmetics, updates player customization and asks the game to save. |
| `PTK_PlayerProfile.SaveProfileLocalData` | `0x18055b730` | Serializes current game-owned profile data and calls the platform save service. |

Removing Garage's disk-write guard would not update these live objects and could
lose either the cosmetic edit or newer game progress. No file-only race-return
reload was found in these analyzed paths; this is not a proof about every game
function.

## Read-only prototype

The ignored local research files are `local/native-probe.cpp`,
`local/native_probe.py` and `local/native-fixture.cpp`. They are excluded from the
portable build. The authored DLL is 153,600 bytes, with no BepInEx dependency.

The prototype temporarily installs a **thread-specific** Windows message hook,
uses an unpredictable current-owner-only shared mapping and reads Quick Setup
through exported IL2CPP APIs. It does not patch executable bytes, write cosmetics,
save a profile, or install a game plugin. All required exports are present in the
installed GameAssembly.dll. The platform mechanism is described in Microsoft's
[SetWindowsHookEx documentation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowshookexw).

An owned hidden-window fixture verified that the DLL callback ran on exactly its
window thread and that the private mapping returned a result. Its expected
`No GameAssembly` result verifies transport only, not game integration. Actual
game-thread, profile, Quick Setup and managed-call checks await the requested
main-menu launch. No experimental DLL is included in the normal app.

## Remaining live-save proof

Before enabling saves, verify the active game/profile/build, Unity main-thread
execution, target-slot baseline and installed choices. Preserve all other slots
and progress. During a race, change only the stored Quick Setup for the next menu
or race; do not replace the active racer. Refresh menu working copies only when
the same player is editing Quick Setup and has no conflicting in-game draft.
Use the game's save method, verify the resulting local/platform save, and test
failure recovery and clean hook/DLL removal. A native bridge still runs code
inside the game even though it does not use BepInEx.
