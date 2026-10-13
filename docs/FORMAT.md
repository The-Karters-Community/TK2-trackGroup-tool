# Format and compatibility evidence

## Portable groups: version 1

```json
{
  "format": "tk2-track-group",
  "version": 1,
  "id": "58d56a74-7974-42f0-92ef-34f6b2361966",
  "revision": 1,
  "name": "Example group",
  "tracks": [
    {"kind": "official", "configId": 44, "title": "Optional title"},
    {"kind": "workshop", "modId": "example", "workshopId": "3263970719"}
  ]
}
```

Example identifiers illustrate syntax, not a valid dependency pairing. Optional `description` is public display text. Workshop IDs are canonical decimal **strings**, avoiding JavaScript integer precision loss. Group IDs are stable UUIDs. Arrays preserve track order. Unknown fields, duplicate tracks, malformed identifiers, empty/oversized lists, and oversized files are rejected.

Official IDs are checked against the selected profile's built-in racing groups. Workshop references must match public Steam metadata `strOwnerModServerUpdateKey`; the generated asset hash is a different identifier.

## Native build 0.1.4.18

`<number>PTK_PlayerData_v19tpp0_bt0` contains exactly three .NET BinaryWriter strings: 7-bit length-prefixed UTF-8 records. First: preset data. Second: separator. Third: profile JSON. Groups live in `ItemsGroupDefinedContainers`. Racing groups use Type 0/SubType 0; custom groups have `IsDefault: false`.

Native items contain `configID`, `modHashID`, and `iPresetID`. Official tracks have an empty mod hash; Workshop tracks use configID -1 and their internal mod identifier. Updates change only `groupItems` and saved name, retaining index and other metadata. New groups append a custom container.

All profile and helper transport text uses explicit UTF-8. Live testing caught Windows' default encoding garbling names when reading the helper's request JSON; that transport now explicitly decodes UTF-8. The first two profile records remain untouched.

Local IL2CPP/Ghidra evidence (approximate native analysis, not original source):

| Function | Address | Finding |
| --- | --- | --- |
| `PTK_PlayerProfile.GetProfileLocalDataAsBytes` | `0x1805589d0` | Three BinaryWriter string writes |
| `PTK_PlayerProfile.OnLocalSaveLoaded` | `0x18055ac10` | Three reads; third deserialized as profile |
| `ItemsGroupContainerConverter.WriteJson` | `0x1805a8d60` | Container representation |
| `PlatformSpecific_Steam.SaveCloudSaveData_Impl` | `0x1809f1bd0` | Remote Storage plus local save |
| `PlatformSpecific_Steam.LoadCloudSaveData_Impl` | `0x1809f0a20` | Steam first when both Cloud flags enabled; explicit local load if either flag is disabled |

Installed API interfaces: UGC v016, Remote Storage v016, Utils v010, User v021. Callback layouts were tested against the installed DLL with a real account. The tool uses [SubscribeItem](https://partner.steamgames.com/doc/api/ISteamUGC#SubscribeItem), verifies metadata/app ID, waits for ready download state, and checks the item-scoped Addressables catalog, track scene, ModInfo key, and local bundles. No assets are extracted or redistributed.

Remote Storage verification checks the Steam client's copy. Steam handles network Cloud synchronization; a local API write does not prove remote server upload completion.

The browser edition uses a separate, preservation-tested JS codec with lossless numeric parsing. It has no Remote Storage transaction or live dependency checks. Its manual LocalLow workflow requires Cloud disabled; see [browser evidence and limitations](WEB.md).
