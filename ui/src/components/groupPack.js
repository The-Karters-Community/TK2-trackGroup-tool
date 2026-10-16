export function groupPack(groups) {
  return { format: "tk2-track-groups", version: 1, groups };
}

export function unpackGroups(value) {
  const groups =
    value?.format === "tk2-track-groups" && value.version === 1
      ? value.groups
      : [value];
  if (
    !Array.isArray(groups) ||
    !groups.length ||
    groups.length > 256 ||
    groups.some((g) => !g?.name || !Array.isArray(g.tracks))
  )
    throw new Error("Invalid track group file.");
  return groups;
}
