import { MAX_SAVE, SAVE_NAME } from "./profile.js";

const DATABASE = "tk2-garage-local";
// Handles are origin-scoped and permission-controlled. No file contents enter storage.
async function database() {
  if (!globalThis.indexedDB) return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function rememberedFolder(next) {
  const db = await database();
  if (!db) return null;
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(
        "handles",
        next ? "readwrite" : "readonly",
      );
      const store = transaction.objectStore("handles");
      const request = next ? store.put(next, "game") : store.get("game");
      request.onsuccess = () => resolve(next || request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function folderFiles(handle) {
  const files = [];
  for await (const entry of handle.values()) {
    if (
      entry.kind === "file" &&
      (SAVE_NAME.test(entry.name) ||
        /^Icon_PresetID_-?\d+(?:_Modded)?\.png$/.test(entry.name))
    )
      files.push(await entry.getFile());
    else if (entry.kind === "directory" && entry.name === "PresetIcons") {
      for await (const image of entry.values()) {
        if (
          image.kind === "file" &&
          /^Icon_PresetID_-?\d+(?:_Modded)?\.png$/.test(image.name)
        )
          files.push(await image.getFile());
        if (files.length > 20000)
          throw new Error("Too many preview files in this folder.");
      }
    }
    if (files.length > 20000)
      throw new Error("Too many game files in this folder.");
  }
  return files;
}
export function inspectFiles(files) {
  const saves = files.filter(
    (f) => SAVE_NAME.test(f.name) && f.size <= MAX_SAVE,
  );
  const previews = [];
  let total = 0;
  for (const file of files) {
    const match = /^Icon_PresetID_(-?\d+)(_Modded)?\.png$/.exec(file.name);
    if (!match || file.size > 4 * 1024 * 1024) continue;
    total += file.size;
    if (total > 128 * 1024 * 1024)
      throw new Error("Preset pictures exceed the 128 MB limit.");
    previews.push({
      file,
      id: match[1],
      view: match[2] ? "modded" : "original",
    });
  }
  return { saves, previews };
}
export function previewUrls(previews) {
  const images = {};
  previews.forEach(({ file, id, view }) => {
    images[id] ||= {};
    if (images[id][view]) URL.revokeObjectURL(images[id][view]);
    images[id][view] = URL.createObjectURL(file);
  });
  return images;
}
