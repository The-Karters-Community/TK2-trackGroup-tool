import index from "../../../catalog/index.json";
import previews from "../../../catalog/track-previews.json";
import { validateGroup } from "./profile.js";

const files = import.meta.glob("../../../catalog/*.tk2group.json", {
  eager: true,
  import: "default",
});
export const catalog = index.groups.map((entry) => ({
  ...validateGroup(files[`../../../catalog/${entry.file}`]),
  category: entry.category,
}));

export function trackMapping(groups) {
  const mapping = new Map();
  for (const group of groups) {
    for (const track of group.tracks) {
      if (track.kind !== "workshop") continue;
      const previous = mapping.get(track.modId);
      if (previous && previous.workshopId !== track.workshopId)
        throw new Error("Conflicting Workshop identity in group file.");
      mapping.set(track.modId, {
        workshopId: track.workshopId,
        title: track.title || track.modId,
      });
    }
  }
  return mapping;
}

export function withPreviews(group) {
  return {
    ...group,
    previewImages: group.tracks.map((t) => previews[t.workshopId]),
  };
}
