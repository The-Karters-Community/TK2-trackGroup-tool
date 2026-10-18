# Native Quick Setup integration research

Status: **live Quick Setup saves verified in the open game editor** on 2026-10-17.
The optional authored native bridge requires no BepInEx or installed plugin.
It executes one bounded request through a temporary Windows thread hook; it is
an in-process integration, not a file-only hot reload. The user authorized
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
`No GameAssembly` result verifies transport only, not game integration. On 2026-10-16 the real game at its main menu passed the read-only test:

- Game PID 16160, window thread 15840 and callback thread 15840 matched.
- IL2CPP reported the callback thread attached; Unity `GameObject.Find` completed
  without its off-main-thread exception and created no game object.
- Player 1 Quick Setup ID 338088 and Player 2 ID 253303 were read from the live
  profile through field APIs. The expected local profile filename suffix matched;
  this suffix check alone is not an exact Steam-account identity check.
- The six cosmetic IDs were returned without a native/managed error. A repeated
  probe left all local profile bytes unchanged (SHA-256 comparison).
- After helper exit, the game's module list contained zero instances of
  `BobbyGarageProbe.dll`. Hooks, mappings and handles were cleaned up.

This proves main-thread read access and transport in this build. It does not
prove safe live saves, in-menu refresh, race-return behavior or multiplayer
synchronization. The original read-only prototype is not shipped. The production bridge is authored MIT-licensed code.

## Verified write path (2026-10-17)

The production source is `native-bridge/QuickSetup.cpp`; Python marshaling and
verification live in `trackgroups/native_quick.py` and `Service.save_live_quick`.
It is pinned to GameAssembly SHA-256
`e55fab2cdcbf3852160183504a847b1a1b7af61c24bc9619e3736e3753aee130`.

The request validates the exact executable path, profile filename, player slot,
preset ID, all cosmetic fields and 20 sticker slots against the live baseline.
Every selected configuration must be loaded in the game. In an open Quick Setup
editor, conflicting approved/hovered/entry drafts are rejected. The bridge changes
only existing cosmetic scalar fields and calls the game's `SaveProfileLocalData`.
The game owns serialization, Cloud writes and lobby synchronization. Garage backs
up first and verifies local bytes against Steam Remote Storage after saving.
It never replaces a running game's full profile with an older backup.

Real tests changed a wheel, verified local and Steam copies, then restored the
original through the same route. The open editor was screen 115 and refreshed via
`LoadQuickPresetForEditing`, on Unity thread 15840. Other saved presets, custom
groups and five other Quick Setup slots stayed unchanged. A browser-driven Save
button test also persisted a modded wheel and restored the original afterward.
Changed baselines, wrong profiles and unavailable appearances were rejected with
unchanged profile hashes. Hooks and helper processes are short lived.

## Scope and remaining validation

Quick Setup can be saved while the game runs. Open-editor refresh is verified.
During a race, the bridge only saves the stored slot and does not call the menu
refresh/synchronization path. Automatic race-return and online-lobby transitions
have not been exercised; the message promises the next Quick Setup selection.
This earlier Quick Setup-only restriction is superseded by the collection-only
native transaction described in LOBBY.md and RECOVERY.md.

The original investigation checklist is retained below:


Before enabling saves, verify the active game/profile/build, Unity main-thread
execution, target-slot baseline and installed choices. Preserve all other slots
and progress. During a race, change only the stored Quick Setup for the next menu
or race; do not replace the active racer. Refresh menu working copies only when
the same player is editing Quick Setup and has no conflicting in-game draft.
Use the game's save method, verify the resulting local/platform save, and test
failure recovery and clean hook/DLL removal. A native bridge still runs code
inside the game even though it does not use BepInEx.


## Lobby and saved-icon extension (2026-10-17)

The production protocol is now version 2, with a 28,379-byte packed request for
up to 32 current room entries. The authored DLL is approximately 169 KiB. Native
lobby copying is verified against the local player's real online room with seven
CPU racers. A game-owned copy generated both PNG views and its hash; cleanup of
only that copy preserved the entire original profile data and both native preset
records. [LOBBY.md](LOBBY.md) records the exact validation and remaining human
remote-player test gap.

Use the exact `UnityEngine.Object.FindObjectOfType(System.Type)` overload. The
same-arity generic overload with a Boolean argument is not interchangeable and
failed during populated-room testing. Lobby slots are filtered against occupied
room UI entries; unused CPU-pool entries are excluded.

Quick Setup saves queue `PTK_MenuIconRenderManager.EnsurePresetIcon` when a menu
renderer exists. Saved images read only the game's actual PresetIcons files.
No BepInEx renderer, installer or ordinary-preset live-save endpoint remains.


## Protocol v3 and game 0.1.4.24 (2026-10-18)

The current request header is 28,391 bytes with a bounded JSON tail, and the
authored DLL is approximately 242 KiB. Exact supported builds are verified before use.
Collection writes compare only reviewed preset/group libraries, let the game
save, verify memory/local/Steam, and preserve concurrent progress and Quick slots.
Race roster reads and renderer-independent preset allocation passed in the real
offline race. CPU editing uses game-owned permission checks and is blocked during
races; the offline lobby change/restore passed. See LOBBY.md for full evidence
and remaining online authority and download-cleanup lifecycle limits.
