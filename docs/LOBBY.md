# Lobby presets without BepInEx

Bobby’s Garage reads the current race lobby through its authored, short-lived
native bridge. The Lobby setups page shows the game’s actual players and three
installed appearance thumbnails. Copy & save preset adds one independent preset
to All presets. Your player, active setup, existing presets and groups are not
changed. The page refreshes every four seconds while open. No persistent game
plugin is installed.

The bridge supports the installed IL2CPP game build 0.1.4.18 only, pinned to
GameAssembly SHA-256
`e55fab2cdcbf3852160183504a847b1a1b7af61c24bc9619e3736e3753aee130`.
This is an optional in-process integration through a temporary Windows message
hook, not a file-only reload. Independent 3D rendering does not use this hook.

## Evidence and implementation

The declaration dump and the existing local Ghidra pseudocode exports were
inspected. Pseudocode is approximate native C-like output, not recovered C#.
The selected REA native provider could not decompile this DLL on this host:
`target_role_unsupported` (Ghidra P0), `unsupported_host` (Hopper), and
`not_configured` (IDA), evidence
`ev_fcac2f3a1b7ba53097dbd681a91149da14cf21895eb1649f426675ea62b04f82`.
The fallback used the matching pre-existing SDK exports in ignored
`TK2-Mod-SDK/local/ghidra/assembly-csharp-full/pseudocode/`.

| Game function | Address | Evidence relevant to Garage |
|---|---|---|
| `SavePresetAction.ImmediateExecute` | `0x18085bb20` | Reads `playersCustomization.GetPlayerData___GLOBAL_SYNCED_PLAYER`; calls `AddNewPresetFrom`. The game falls back to original cosmetics when modded content is missing. Garage rejects missing content instead, preserving the exact setup. |
| `SavePresetAction.CanExecute` | `0x18085b950` | Requires a real source player and rejects copying the local player. |
| `PTK_ProfileCustomizationPresets.AddNewPresetFrom` | `0x18055c950` | Allocates a new unique local preset ID, copies cosmetics, queues its icon, adds it to the profile and saves through `SaveProfileLocalData`. |
| `PTK_RoomPlayersManager.RefreshAllPlayers` | `0x18081e4a0` | Distinguishes online rooms through `PixelSDK.pixelMultiplayer.IsInRoom`, reads online room players or local/CPU room items. |
| `MenuManager.IsCurrentScreenLobbyCompatible` | `0x1807824f0` | Accepts the local race lobby (`111`), plus lobby-origin preset editor screens (`106`, `115`). |
| `PTK_MenuIconRenderManager.EnsurePresetIcon` | `0x180769b00` | Queues a game render only if the content hash is invalid and this preset is not already queued. |
| `PTK_MenuIconRenderManager.ValidatePresetIconAndRenderIfRequired` | `0x18076b8c0` | Uses the existing icon-render queue. This needs the running game’s renderer. |
| `PTK_ProfileCustomizationPresets.DeletePreset` | `0x18055dd10` | Deletes one specific preset and saves through the game. Used only for cleanup of the exact newly allocated copy if persistence verification fails. |

Native protocol version 2 is 28,379 bytes. The added lobby entries carry full
cosmetics, including all original/modded IDs and all twenty packed sticker
slots. Raw network identity strings remain server-side. The UI gets opaque
short-lived keys. Before copying the bridge rechecks source player identity,
slot, preset ID and every cosmetic field on the game’s thread. It validates
that all referenced content is installed, then calls the game-owned copy method.

Before mutation Garage confirms the active Steam account, selected profile,
Cloud status and matching local/Steam save hashes, then retains a safety copy.
After mutation it verifies the new unique preset, exact cosmetics, existing
preset/group preservation and local/Steam persistence. An uncertain write is
never blindly retried. Cleanup removes only the exact new preset while the
original groups are unchanged. Garage never restores a whole stale profile over
a running game.

Quick Setup saves now also ask `EnsurePresetIcon` to refresh a changed saved
image while the menu renderer is available. The image is asynchronous and updates
when its PNG changes on disk. A closed game cannot generate a genuine new game
render; independent local 3D previews remain available instead.

The former BepInEx rendering, companion installation/removal and live ordinary
preset-save endpoints have been removed. Existing user-installed game plugins
are not deleted or modified.

## Verification status

- 2026-10-17: native DLL rebuilt successfully with the v2 protocol.
- Read-only actual-game request at the main menu returned screen `0`, no lobby,
  zero players and no native/managed error. The game stayed open.
- Backend tests cover offline/main-menu empty states, server-only identities,
  stable opaque keys, expired/local selections, Cloud-conflict rejection and a
  verified game-owned copy preserving the existing library and groups.
- UI tests cover player appearance labels, one-click opaque-key copying and the
  offline empty state. Removed companion endpoints return Unknown action.
- Actual online race lobby (`111`) returned exactly eight occupied slots: one
  local player and seven CPU racers. Raw unused AI pool objects are excluded
  using occupied room-UI slots; local/CPU identities never duplicate a slot.
- Runtime testing found Unity’s overloaded `FindObjectOfType` lookup initially
  selected the generic boolean overload. The bridge now resolves the exact
  single-`System.Type` signature before invoking it.
- One CPU setup not already in the library was copied through the production
  Service -> native game `AddNewPresetFrom` path. Local and Steam saves matched
  and the copy preserved every cosmetic field. The game generated its hash,
  original PNG (206,759 bytes), and modded PNG (234,005 bytes).
- The test copy was removed through the game-owned exact-ID/cosmetics cleanup
  path. Local/Steam equality, all original native presets, every group, all six
  Quick Setup slots, and the source CPU setup were verified afterward. No
  whole-profile restore was used. Ignored evidence: `local/lobby-runtime-proof.json`.
- Actual remote human-player copying remains untested; the tested online CPU
  path uses the same synchronized preset source and game-owned allocation.
  No generated test players are displayed in the application.
