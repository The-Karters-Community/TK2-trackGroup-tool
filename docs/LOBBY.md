# Lobby presets without BepInEx

Bobby’s Garage reads the current race lobby through its authored, short-lived
native bridge. Lobby setups shows actual players in the lobby or race, with
locally rendered full-setup pictures and individual part thumbnails. Copy preset
changes only the chosen saved local Quick Setup slot; Save preset adds a separate
library entry. Authorized CPU customization is a distinct lobby-only action.
Interactive 3D is optional and off by default. The page refreshes every four
seconds while open, retaining stable cards and cached pictures. No persistent
game plugin is installed.

The bridge resolves the installed IL2CPP runtime's metadata automatically; no
patch-version or GameAssembly hash allowlist is required. Tests cover 0.1.4.18
and 0.1.4.24. See [runtime compatibility](NATIVE-BRIDGE-RESEARCH.md).
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
| `SavePresetAction.ImmediateExecute` | `0x18085bb20` | Reads `playersCustomization.GetPlayerData___GLOBAL_SYNCED_PLAYER`; calls `AddNewPresetFrom`. The game falls back to original cosmetics when modded content is missing. Garage preserves raw references and uses the same original-appearance fallback for unavailable modded content. |
| `SavePresetAction.CanExecute` | `0x18085b950` | Requires a real source player and rejects copying the local player. |
| `PTK_ProfileCustomizationPresets.AddNewPresetFrom` | `0x18055c950` | Allocates a new unique local preset ID, copies cosmetics, queues its icon, adds it to the profile and saves through `SaveProfileLocalData`. |
| `PTK_RoomPlayersManager.RefreshAllPlayers` | `0x18081e4a0` | Distinguishes online rooms through `PixelSDK.pixelMultiplayer.IsInRoom`, reads online room players or local/CPU room items. |
| `MenuManager.IsCurrentScreenLobbyCompatible` | `0x1807824f0` | Accepts the local race lobby (`111`), plus lobby-origin preset editor screens (`106`, `115`). |
| `PTK_MenuIconRenderManager.EnsurePresetIcon` | `0x180769b00` | Queues a game render only if the content hash is invalid and this preset is not already queued. |
| `PTK_MenuIconRenderManager.ValidatePresetIconAndRenderIfRequired` | `0x18076b8c0` | Uses the existing icon-render queue. This needs the running game’s renderer. |
| `PTK_ProfileCustomizationPresets.DeletePreset` | `0x18055dd10` | Deletes one specific preset and saves through the game. Used only for cleanup of the exact newly allocated copy if persistence verification fails. |

Native protocol v3 has a 28,391-byte header and bounded UTF-8 request/response tails. Its lobby entries carry full
cosmetics, including all original/modded IDs and all twenty packed sticker
slots. Raw network identity strings remain server-side. The UI gets opaque
short-lived keys. Before copying the bridge rechecks source player identity,
slot, preset ID and every cosmetic field on the game’s thread. It validates the original fallback bases, preserves absent modded references,
and then calls the game-owned copy method.

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


## 2026-10-18 bridge v3 and updated game

The installed beta_dev game updated to 0.1.4.24, build 2026-10-16 22:27:38
+02:00. Its GameAssembly SHA-256 is
`55f5c88972fe1ccf4c9d5f3871b71bcfa261b3e42a379e18438e92623fc4d6a2`.
At that earlier testing stage, access was hash-restricted. The subsequent runtime
compatibility implementation removes those identity restrictions. A new private Il2CppDumper declaration dump was compared with the
previous dump: 26 of 29 bridge-related types were identical after removing RVA
and attribute lines. The settings type added fields; named IL2CPP reflection
avoids offsets. The automatic-download manager added an orphaned queue registry.
Metadata describes declarations, not recovered C# source. Existing Ghidra
pseudocode cited above belongs to 0.1.4.18; updated runtime proof is separate.

On 0.1.4.24, actual read operations 0/2/6 and op5 validateOnly succeeded.
A necessary reversible order-only library transaction swapped the first two
saved presets and then restored them using a fresh exact semantic baseline.
Both states matched the local and Steam saves. All 21 presets, 27 groups,
other profile/progress data and the other save record were preserved. No raw
profile restore was used. Evidence: ignored
`local/library-v3-runtime-proof.json`,
`local/game-0.1.4.24/layout-comparison.json`.

An earlier pre-save experiment on 0.1.4.18 exposed an incorrect native object
reference setter: the scalar field setter received a pointer-to-reference.
The game exited before saving; both disk copies remained byte-identical to
backup. The setter now uses IL2CPP's `il2cpp_field_set_value_object`; scalar
fields retain the scalar API. A temporary repair opcode was never executed and
was removed. The corrected order-only transaction passed on both game builds.

Protocol v3 retains a fixed 28,391-byte header, then bounded UTF-8 request and
response regions. Op5 changes only full native preset and group lists after
exact semantic-baseline comparison; op6 reads those lists. Unchanged native
preset objects are reused. Conflicting unsaved in-game edits are rejected;
historical recently-used IDs alone do not block deletion, matching the examined
game DeletePreset behavior. Icons are queued through EnsurePresetIcon only
when a menu renderer exists. Races keep their current active appearance.

Op2 now reports the three actual saved game settings and actual room ownership.
A real main-menu read on 0.1.4.24 reported no lobby, no race, zero players and
all three settings enabled. Its race path uses Ant_MainGame's actual
GetCurrentlyPlayingPlayers roster and synchronized raw cosmetic data, excluding
disabled slots/ghosts. It does not fabricate an online room from six local
Quick Setup slots. Race identities include the actual object's instance ID,
so stale requests cannot silently target a replacement racer.

Detailed remote Workshop provenance is read from the boxed
MenuInRoomPlayerItem._lastQueuedCustomizationDetails cache, which the game's
FetchPlayerDataFromServer fills from E_CUSTOMIZ_DETAIL_CONFIG_PLOC_0..5 Photon
properties. Only exact config-ID correlations to ConfigsMods_ulIds with the
Steam platform tag produce a Workshop link. Missing metadata stays unknown.
Original IDs remain the required valid fallback bases; absent or zero modded
IDs are preserved rather than making a legitimate official preset invalid.

Op7 is an explicit ownership transfer after Garage confirms a Steam subscription.
It removes only that Workshop ID from automatic completed/downloaded registries,
including the 0.1.4.24 orphaned queues. Pending, processing or current downloads
reject transfer until completion. It does not toggle Keep Auto Downloaded or
subscribe through the native bridge. This is necessary because the examined
MarkCompleted/InstantUnsubscribe/Cleanup code may unsubscribe an automatically
owned item even after a plain Steam SubscribeItem call. An actual 0.1.4.24 idempotent call on an already subscribed cosmetic succeeded
with zero automatic ownership records removed; Steam subscription, every profile
byte and all room players stayed unchanged. This does not prove automatic
unsubscription behavior after leaving an online room.

Op8 changes only an authorized CPU's synchronized setup in an active menu
lobby, using the real SetPresetLobbyAction CanExecute and ImmediateExecute.
The native bridge independently rejects remote humans, a nonhost online caller,
a race-time change, a changed source identity and stale cosmetics. The game's
action handles offline refresh and host synchronization of CPU appearance room
properties. It does not add a library preset or change a local player's Quick
Setup. Actual offline CPU mutation/restoration passed on 0.1.4.24. Online host/nonhost permissions and detailed remote Workshop metadata still
need their corresponding runtime contexts. Race roster/copy proof is below.

For saving a race appearance into the library, AddNewPresetFrom cannot be used
without the menu renderer: examined code dereferences that renderer before
adding. The race branch instead uses the same game-owned GenerateUniqueID,
CustomizationPreset constructor/CopyFrom, list Add and SaveProfileLocalData,
with exact source revalidation; PNG generation is deferred. This branch passed actual 0.1.4.24 race saving and scoped cleanup as recorded below.


### Actual local lobby proof on 0.1.4.24

A fresh screen-111 local lobby returned exactly one local player and seven CPUs.
All seven CPU entries passed the real SetPresetLobbyAction.CanExecute gate.
Offline GetID legitimately returned empty; native identity now combines the
actual managed object hash with its global slot. The first attempt was rejected
before mutation because that empty identity was disallowed; after correction,
CPU 2's wheel was changed through the game action and its full original cosmetic
record restored. Every other player, every profile byte, all six Quick slots,
the saved preset/group libraries, and matching Steam save were preserved.
Private evidence: `local/game-0.1.4.24/cpu-runtime-proof.json`.

CPU 2 uses actual original fallbacks for absent modded character and wheels
(raw IDs -1). Production Service copying of this exact setup passed, preserving
those raw references rather than substituting invented IDs. Local/Steam saves
matched, and the game generated a 48-byte hash plus original and modded PNGs
(225,261 and 211,201 bytes). Scoped exact-ID/cosmetics cleanup removed only the
new test copy. All 21 original presets, 27 groups, six Quick slots, other profile
data and the other save record matched afterward. Source CPU setup remained
unchanged. Evidence: `local/game-0.1.4.24/lobby-fallback-copy-proof.json`.
No raw-zero modded Quick slot was available; all six initialized slots contain
modded references, so the optional zero-ID toggle test was skipped without
initializing or modifying any slot.

The Quick save path no longer prohibits Original/Modded changes just because
that slot is also open in the game editor. It retains exact baseline and unsaved
working-copy conflict checks and reloads a clean matching game editor through
LoadQuickPresetForEditing. An actual simultaneous open-editor toggle test is
still pending.


### Actual race proof on 0.1.4.24

During the user's actual offline race, op2 returned eight active Ant_Player
objects, including the actual local racer and seven CPUs, with local-player
index zero. Every CPU advertised no edit capability. An explicit op8 request
was rejected with the race-specific message before changing any profile bytes.
Two fresh consecutive snapshots returned the same exact synchronized cosmetics.
The earlier menu snapshot had different selections and was not used as a
correctness invariant for current race content.
Evidence: `local/game-0.1.4.24/race-roster-proof.json`.

Production Service saving of one unsaved CPU race setup allocated a unique
preset using the renderer-independent native branch. Its exact cosmetics and
local/Steam persistence were verified. No game PNG was fabricated: generation
was correctly deferred until the menu renderer is available. Scoped op4 cleanup
removed just the test copy; all 21 original presets, 27 groups, six Quick slots,
other profile data, the other save record and the source CPU were preserved.
No test library item remains. Evidence:
`local/game-0.1.4.24/race-copy-proof.json`.

The offline/race paths are runtime-proven. A real remote human with unavailable
cosmetic packages, online host/nonhost CPU authority, simultaneous game-editor
Original/Modded switching, and automatic-subscription cleanup after leaving an
online room remain explicitly unverified. Race entries preserve raw synchronized
IDs, but detailed remote Workshop links may remain unknown when the menu's
packed-property cache is unavailable and no installed source package resolves.


### Official preview and race-return robustness

On 2026-10-18, official menu-pose lookup was changed from a fixed byte position
to the installed MonoScript and serialized object table. All eight actual lobby
setup pictures rendered in REA/Chrome, including official Pablo, Bobby, Sir Roland
and Puma. Selected part displays standing menu idle for official characters even
when their Modded ID is unset. Such slots are labeled Original appearance, rather
than implying that an unselected mod needs installation.

After race scene unload Unity can retain a destroyed Ant_MainGame static object.
The bridge now checks UnityEngine.Object.op_Implicit before reading retained scene
components. A fresh current eight-player lobby read passed without profile writes
or navigation after this correction. See VERIFICATION.md for browser evidence.


## 2026-10-18 picture-loading refinement

Lobby PNGs persist in the local appearance cache's `setup-pictures` directory.
The cache is limited to 8 MiB and 96 pictures; each picture is at most 512 KiB
and 1024 pixels per dimension. The key includes normalized cosmetics, the asset
revision and the picture-format revision. Changed setups or installed content
cannot reuse a stale picture. No account, networking identity or save file is
stored with a picture. Read/write endpoints use the existing session checks.

On a miss, at most two setups prepare concurrently. A preparation holds its
slot until rendering completes, so an eight-player roster cannot accumulate
eight decoded scenes. One serial WebGL renderer remains responsible for all
pictures, releasing its GPU context when idle. A cached hit needs no model
requests or WebGL context.

A real-content headless Edge test rendered the first eight saved setups in
21,961 ms in total, then loaded all eight through a fresh preview queue from the
persistent cache in 95 ms with zero model requests. All eight succeeded. This
measures a PNG-cache miss followed by a hit; it is not a claim that never-seen
assets decode instantly, nor an online-lobby authority test.


The current real local eight-player lobby was also exercised through the complete
React page: all eight pictures loaded (27,581 ms for that first set), then a full
page reload reopened the populated lobby in 2,181 ms with zero model requests.
That page measurement includes the roster request and UI startup, unlike the
95 ms image-cache-only measurement. The current game and saves were not edited.
