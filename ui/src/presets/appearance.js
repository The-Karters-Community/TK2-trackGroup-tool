export const slots = [
  ["Character", "characters", "iCharacterSkinMaterialID"],
  ["Vehicle", "vehicles", "iVehicleMaterialID"],
  ["Wheels", "wheels", "iWheelMaterialID"],
];

export function itemInfo(data, kind, field, appearance, view = "modded") {
  const id = data[view === "modded" ? `${field}_Modded` : field];
  return appearance?.items?.[kind]?.[id];
}

export function setupTitle(preset, appearance, index, view = "modded") {
  const character = itemInfo(
    preset.data,
    "characters",
    "iCharacterSkinMaterialID",
    appearance,
    view,
  );
  return character?.name
    ? `${character.name} · Setup ${index + 1}`
    : `Setup ${index + 1}`;
}

export function setupDescription(preset, appearance, view = "modded") {
  const descriptions = slots
    .map(
      ([label, kind, field]) =>
        itemInfo(preset.data, kind, field, appearance, view)?.label,
    )
    .filter(Boolean);
  return descriptions.length
    ? descriptions.join(" / ")
    : `${view === "modded" ? "Modded" : "Original"} setup`;
}

export function setupMatches(preset, appearance, index, query) {
  return `${setupTitle(preset, appearance, index)} ${setupDescription(preset, appearance)} ${preset.id}`
    .toLowerCase()
    .includes(query.toLowerCase());
}
