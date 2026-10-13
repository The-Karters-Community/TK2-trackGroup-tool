import { parse, stringify } from "lossless-json";
import { encodeLength } from "../web/profile.js";

export const groupId = "11111111-1111-1111-1111-111111111111";
export function fixture() {
  const p = {
    iPresetID: 100,
    bUsingModdedVersion: true,
    iCharacterSkinMaterialID: 1,
    iVehicleMaterialID: 2,
    iWheelMaterialID: 3,
    iCharacterSkinMaterialID_Modded: -2147483648,
    iVehicleMaterialID_Modded: 2,
    iWheelMaterialID_Modded: 3,
    stickersData: Array.from({ length: 20 }, () => ({
      iStickerMaterialID: 4,
      iStickerMaterialID_SettingsPacked: -1,
      iStickerMaterialID_Modded: 4,
      iStickerMaterialID_Modded_SettingsPacked: -1,
    })),
    futureNativeField: { keep: 42 },
  };
  p.stickersData[0].futureStickerField = 6;
  const data = parse(
    '{"account":76561198123456789,"decimal":1.234567890123456789,"QuickCreationPreset":{"iPresetID":101},"lastLocalChoosedPresetsIds":[-1],"ItemsGroupDefinedContainers":[]}',
  );
  data.ItemsGroupDefinedContainers.push(
    {
      GroupDefinition: {
        UniqueID: "builtin",
        Name: "All Presets",
        Type: 1,
        SubType: 4,
        Index: 0,
        IsDefault: true,
      },
    },
    {
      GroupDefinition: {
        UniqueID: "tracks",
        Name: "My tracks",
        Type: 0,
        SubType: 0,
        Index: 1,
        IsDefault: false,
      },
      groupItems: [],
    },
    {
      GroupDefinition: {
        UniqueID: groupId,
        Name: "Sönic",
        Type: 1,
        SubType: 4,
        Index: 1,
        IsDefault: false,
      },
      groupItems: [{ configID: -1, modHashID: "", iPresetID: 100 }],
    },
  );
  return new Uint8Array(
    [JSON.stringify([p]), "exact separator", stringify(data)].flatMap((t) => {
      const bytes = new TextEncoder().encode(t);
      return [...encodeLength(bytes.length), ...bytes];
    }),
  );
}
