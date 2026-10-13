import { parse, stringify } from "lossless-json";
import { serializeProfile, validateName } from "../web/profile.js";

export const materialFields = [
  "iCharacterSkinMaterialID",
  "iVehicleMaterialID",
  "iWheelMaterialID",
  "iCharacterSkinMaterialID_Modded",
  "iVehicleMaterialID_Modded",
  "iWheelMaterialID_Modded",
];
export const stickerFields = [
  "iStickerMaterialID",
  "iStickerMaterialID_SettingsPacked",
  "iStickerMaterialID_Modded",
  "iStickerMaterialID_Modded_SettingsPacked",
];
const fields = [...materialFields, "bUsingModdedVersion", "stickersData"];
const number = (v) => Number(v?.isLosslessNumber ? v.value : v);
const clone = (v) => parse(stringify(v));
const keysExactly = (v, fields) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).length === fields.length &&
  fields.every((k) => Object.hasOwn(v, k));
const integer = (v, strict = false) => {
  if (
    (strict && typeof v !== "number") ||
    typeof v === "boolean" ||
    v == null ||
    typeof v === "string" ||
    !Number.isInteger(number(v)) ||
    number(v) < -(2 ** 31) ||
    number(v) >= 2 ** 31
  )
    throw new Error(
      "Cosmetic configuration IDs must be signed 32-bit integers.",
    );
  return number(v);
};
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export function cosmetic(value, strict = false) {
  if (!value || (strict && !keysExactly(value, fields)))
    throw new Error("Unsupported or private preset fields.");
  const result = Object.fromEntries(
    materialFields.map((k) => [k, integer(value[k], strict)]),
  );
  if (typeof value.bUsingModdedVersion !== "boolean")
    throw new Error("Invalid original/modded selection.");
  if (!Array.isArray(value.stickersData) || value.stickersData.length !== 20)
    throw new Error("Preserve all 20 sticker slots.");
  result.bUsingModdedVersion = value.bUsingModdedVersion;
  result.stickersData = value.stickersData.map((s) => {
    if (!s || (strict && !keysExactly(s, stickerFields)))
      throw new Error("Unsupported sticker fields.");
    return Object.fromEntries(
      stickerFields.map((k) => [k, integer(s[k], strict)]),
    );
  });
  return result;
}

function nativePresets(profile) {
  const values = parse(profile.records[0]);
  if (!Array.isArray(values) || values.length > 10000)
    throw new Error("Unsupported preset record.");
  const seen = new Set();
  for (const p of values) {
    cosmetic(p);
    const id = integer(p.iPresetID);
    if (seen.has(id)) throw new Error("Duplicate native preset IDs.");
    seen.add(id);
  }
  return values;
}
const custom = (g) =>
  number(g.GroupDefinition.Type) === 1 &&
  number(g.GroupDefinition.SubType) === 4 &&
  g.GroupDefinition.IsDefault === false;

export function presetState(profile) {
  return {
    presets: nativePresets(profile).map((p) => ({
      id: number(p.iPresetID),
      data: cosmetic(p),
    })),
    groups: profile.data.ItemsGroupDefinedContainers.filter(custom)
      .slice()
      .sort(
        (a, b) =>
          number(a.GroupDefinition.Index) - number(b.GroupDefinition.Index),
      )
      .map((g) => ({
        id: g.GroupDefinition.UniqueID,
        name: g.GroupDefinition.Name,
        members: (g.groupItems || []).map((i) => number(i.iPresetID)),
        editable: g.GroupDefinition.CanBeModified !== false,
      })),
    error: "",
  };
}

export function validatePack(pack) {
  if (
    !keysExactly(pack, [
      "format",
      "version",
      "gameBuild",
      "presets",
      "groups",
    ]) ||
    pack.format !== "tk2-presets" ||
    pack.version !== 1 ||
    pack.gameBuild !== "0.1.4.18"
  )
    throw new Error("Expected tk2-presets version 1 for game 0.1.4.18.");
  if (
    !Array.isArray(pack.presets) ||
    !pack.presets.length ||
    pack.presets.length > 1000 ||
    !Array.isArray(pack.groups) ||
    pack.groups.length > 100
  )
    throw new Error("Select 1–1000 presets and up to 100 groups.");
  const seen = new Set();
  for (const p of pack.presets) {
    if (
      !keysExactly(p, ["key", "data"]) ||
      typeof p.key !== "string" ||
      !/^[a-zA-Z0-9:_-]{1,100}$/.test(p.key) ||
      seen.has(p.key)
    )
      throw new Error("Invalid or duplicate portable preset key.");
    seen.add(p.key);
    cosmetic(p.data, true);
  }
  const groups = new Set();
  for (const g of pack.groups) {
    if (
      !keysExactly(g, ["id", "name", "presets"]) ||
      typeof g.id !== "string" ||
      !uuid.test(g.id) ||
      groups.has(g.id)
    )
      throw new Error("Invalid or duplicate preset group ID.");
    groups.add(g.id);
    validateName(g.name);
    if (
      !Array.isArray(g.presets) ||
      !g.presets.length ||
      g.presets.length > 1000 ||
      new Set(g.presets).size !== g.presets.length ||
      g.presets.some((k) => !seen.has(k))
    )
      throw new Error("Preset group has missing or duplicate members.");
  }
  return pack;
}

export function exportPresets(state, ids, groupIds) {
  const groups = state.groups.filter((g) => groupIds.includes(g.id));
  if (groups.length !== new Set(groupIds).size)
    throw new Error("Preset group no longer exists.");
  const wanted = new Set([...ids, ...groups.flatMap((g) => g.members)]);
  const presets = state.presets.filter((p) => wanted.has(p.id));
  if (presets.length !== wanted.size)
    throw new Error("A selected preset or group member is missing.");
  return validatePack({
    format: "tk2-presets",
    version: 1,
    gameBuild: "0.1.4.18",
    presets: presets.map((p) => ({
      key: `preset:${p.id}`,
      data: cosmetic(p.data),
    })),
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      presets: g.members.map((id) => `preset:${id}`),
    })),
  });
}

export function moddedReferences(data) {
  return [
    ...materialFields
      .slice(0, 3)
      .filter((k) => data[k] !== data[`${k}_Modded`])
      .map((k) => data[`${k}_Modded`]),
    ...data.stickersData
      .filter((s) => s.iStickerMaterialID !== s.iStickerMaterialID_Modded)
      .map((s) => s.iStickerMaterialID_Modded),
  ];
}

function saveGroup(groups, id, name, members, update) {
  validateName(name);
  const previous = groups.find((g) => g.GroupDefinition.UniqueID === id);
  const items = members.map((i) => ({
    configID: -1,
    modHashID: "",
    iPresetID: i,
  }));
  if (previous) {
    if (!custom(previous) || previous.GroupDefinition.CanBeModified === false)
      throw new Error("Protected groups cannot be edited.");
    if (!update) throw new Error("Confirm updating the existing preset group.");
    previous.GroupDefinition.Name = name;
    previous.groupItems = members.map(
      (id) =>
        previous.groupItems.find((i) => number(i.iPresetID) === id) || {
          configID: -1,
          modHashID: "",
          iPresetID: id,
        },
    );
  } else {
    const names = new Set(groups.map((g) => g.GroupDefinition.Name));
    let suffix = 2;
    const original = name;
    while (names.has(name)) name = `${original} (${suffix++})`;
    const indices = groups
      .filter((g) => number(g.GroupDefinition.Type) === 1)
      .map((g) => number(g.GroupDefinition.Index ?? -1));
    groups.push({
      $type: "ItemsGroupDefaultContainer",
      groupItems: items,
      GroupDefinition: {
        Index: Math.max(-1, ...indices) + 1,
        UniqueID: id,
        Name: name,
        Type: 1,
        SubType: 4,
        ManuallySetUniqueID: false,
        CanBeModified: true,
        CanBeRemoved: true,
        MaxElementsCount: 0,
        IsForGP: false,
        CreationDate: new Date().toISOString(),
        IsDefault: false,
      },
    });
  }
}

export function applyPresetChange(profile, change) {
  let presets = nativePresets(profile);
  const data = clone(profile.data);
  const groups = data.ItemsGroupDefinedContainers;
  const used = new Set(presets.map((p) => number(p.iPresetID)));
  const reserve = (v) => {
    if (!v || typeof v !== "object") return;
    if (v.iPresetID !== undefined) used.add(number(v.iPresetID));
    Object.values(v).forEach(reserve);
  };
  [data.QuickCreationPreset, data.QuickCreationPresets, groups].forEach(
    reserve,
  );
  (data.lastLocalChoosedPresetsIds || []).forEach((v) => used.add(number(v)));
  const allocate = () => {
    let id = 100;
    while (used.has(id) && id < 999999) id++;
    if (id === 999999) throw new Error("No preset IDs remain available.");
    used.add(id);
    return id;
  };
  const target = () => {
    const p = presets.find((p) => number(p.iPresetID) === change.presetId);
    if (!p) throw new Error("Preset no longer exists.");
    return p;
  };
  switch (change.mode) {
    case "import": {
      const pack = validatePack(change.pack);
      const mapping = new Map();
      const claimed = new Set();
      for (const entry of pack.presets) {
        let p = presets.find(
          (p) =>
            !claimed.has(number(p.iPresetID)) &&
            JSON.stringify(cosmetic(p)) ===
              JSON.stringify(cosmetic(entry.data)),
        );
        if (!p) {
          p = { iPresetID: allocate(), ...cosmetic(entry.data) };
          presets.push(p);
        }
        mapping.set(entry.key, number(p.iPresetID));
        claimed.add(number(p.iPresetID));
      }
      pack.groups.forEach((g) =>
        saveGroup(
          groups,
          g.id,
          g.name,
          g.presets.map((k) => mapping.get(k)),
          change.confirmUpdate === true,
        ),
      );
      break;
    }
    case "preset": {
      const p = target();
      const values = cosmetic(change.data, true);
      const stickers = p.stickersData.map((s, i) => ({
        ...s,
        ...values.stickersData[i],
      }));
      Object.assign(p, values, { stickersData: stickers });
      break;
    }
    case "duplicate": {
      const p = { ...clone(target()), iPresetID: allocate() };
      presets.push(p);
      if (change.groupId) {
        const g = groups.find(
          (g) => g.GroupDefinition.UniqueID === change.groupId,
        );
        if (!g || !custom(g) || g.GroupDefinition.CanBeModified === false)
          throw new Error("Group cannot be edited.");
        g.groupItems.push({
          configID: -1,
          modHashID: "",
          iPresetID: p.iPresetID,
        });
      }
      break;
    }
    case "order": {
      if (
        !Array.isArray(change.order) ||
        change.order.length !== presets.length ||
        new Set(change.order).size !== presets.length ||
        change.order.some(
          (i) =>
            !Number.isInteger(i) ||
            !presets.some((p) => number(p.iPresetID) === i),
        )
      )
        throw new Error("Include each preset exactly once.");
      presets = change.order.map((i) =>
        presets.find((p) => number(p.iPresetID) === i),
      );
      break;
    }
    case "group":
      if (
        !uuid.test(change.groupId) ||
        !Array.isArray(change.members) ||
        !change.members.length ||
        new Set(change.members).size !== change.members.length ||
        change.members.some(
          (i) => !presets.some((p) => number(p.iPresetID) === i),
        )
      )
        throw new Error("Choose existing presets once each.");
      saveGroup(groups, change.groupId, change.name, change.members, true);
      break;
    case "group-order": {
      const customGroups = groups.filter(custom);
      if (
        !Array.isArray(change.order) ||
        change.order.length !== customGroups.length ||
        new Set(change.order).size !== customGroups.length ||
        change.order.some(
          (id) => !customGroups.some((g) => g.GroupDefinition.UniqueID === id),
        )
      )
        throw new Error("Include each custom preset group exactly once.");
      const indices = customGroups
        .map((g) => number(g.GroupDefinition.Index))
        .sort((a, b) => a - b);
      change.order.forEach((id, i) => {
        const definition = customGroups.find(
          (g) => g.GroupDefinition.UniqueID === id,
        ).GroupDefinition;
        if (
          definition.CanBeModified === false &&
          number(definition.Index) !== indices[i]
        )
          throw new Error("Protected groups cannot be reordered.");
        definition.Index = indices[i];
      });
      break;
    }
    case "delete-group": {
      const index = groups.findIndex(
        (g) => g.GroupDefinition.UniqueID === change.groupId,
      );
      if (
        index < 0 ||
        !custom(groups[index]) ||
        groups[index].GroupDefinition.CanBeRemoved === false
      )
        throw new Error("Group cannot be removed.");
      groups.splice(index, 1);
      break;
    }
    case "delete": {
      const p = target();
      if (
        (data.lastLocalChoosedPresetsIds || []).some(
          (i) => number(i) === change.presetId,
        )
      )
        throw new Error(
          "This preset is selected for a local player. Choose another in the game first.",
        );
      if (presets.length <= 1) throw new Error("Keep at least one preset.");
      const pattern = new RegExp(`(^|[^0-9])${change.presetId}([^0-9]|$)`);
      if (
        [
          "recentlyUsedPresets",
          "QuickCreationPreset",
          "QuickCreationPresets",
        ].some((k) => pattern.test(stringify(data[k] ?? null)))
      )
        throw new Error(
          "Preset is referenced by history or quick setup. Remove it in the game instead.",
        );
      for (const g of groups.filter(custom)) {
        if (
          g.GroupDefinition.CanBeModified === false &&
          (g.groupItems || []).some(
            (i) => number(i.iPresetID) === change.presetId,
          )
        )
          throw new Error("Preset is used by a protected group.");
        g.groupItems = (g.groupItems || []).filter(
          (i) => number(i.iPresetID) !== change.presetId,
        );
      }
      presets = presets.filter((v) => v !== p);
      break;
    }
    default:
      throw new Error("Unknown preset operation.");
  }
  if (
    stringify(presets) === stringify(nativePresets(profile)) &&
    stringify(data) === stringify(profile.data)
  )
    return profile.original;
  return serializeProfile(
    profile,
    data,
    stringify(presets) === stringify(nativePresets(profile))
      ? undefined
      : presets,
  );
}
