import { useEffect, useRef, useState } from "react";
import {
  folderFiles,
  inspectFiles,
  previewUrls,
  rememberedFolder,
} from "./localFolder.js";
import { readProfile } from "./profile.js";

export default function useGameFolder({
  dirty,
  hasProfile = false,
  onConnected,
  onError,
}) {
  const [folder, setFolder] = useState(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [profileChoices, setProfileChoices] = useState([]);
  const pendingFolder = useRef();
  const folderInput = useRef();
  const latest = useRef();
  latest.current = { dirty, hasProfile, onConnected, onError };
  async function applyFolder(files, handle = null) {
    if (
      latest.current.dirty &&
      !window.confirm("Replace your unsaved edits with files from this folder?")
    )
      return;
    const result = inspectFiles(files);
    if (result.saves.length > 1) {
      pendingFolder.current = {
        files,
        handle,
        cancel: () => setProfileChoices([]),
      };
      setProfileChoices(result.saves);
      return;
    }
    const file = result.saves[0];
    const bytes = file ? new Uint8Array(await file.arrayBuffer()) : null;
    const next = file ? readProfile(bytes, file.name) : null;
    if (!next && (!result.previews.length || !latest.current.hasProfile))
      throw new Error(
        "Choose TheKarters2, one level above PresetIcons, so the save and pictures can be opened together.",
      );
    const images = previewUrls(result.previews);
    latest.current.onConnected({ images, bytes, file, next });
    if (handle && next) {
      setFolder(handle);
      setNeedsPermission(false);
      try {
        await rememberedFolder(handle);
      } catch {
        /* The folder works without storage. */
      }
    }
    setProfileChoices([]);
  }
  async function connectFolder(reuse = false) {
    if (!window.showDirectoryPicker) {
      folderInput.current.click();
      return;
    }
    try {
      const handle =
        reuse && folder
          ? folder
          : await window.showDirectoryPicker({
              id: "tk2-game-data",
              mode: "read",
            });
      if ((await handle.requestPermission({ mode: "read" })) !== "granted")
        throw new Error(
          "Folder access was not granted. Your files are unchanged.",
        );
      await applyFolder(await folderFiles(handle), handle);
    } catch (err) {
      if (err.name !== "AbortError") latest.current.onError(err.message);
    }
  }
  useEffect(() => {
    let cancelled = false;
    rememberedFolder()
      .then(async (handle) => {
        if (!handle || cancelled) return;
        const permission = await handle.queryPermission({ mode: "read" });
        if (cancelled) return;
        setFolder(handle);
        if (permission === "granted") {
          const files = await folderFiles(handle);
          if (!cancelled && !latest.current.dirty)
            await applyFolder(files, handle);
        } else setNeedsPermission(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return {
    folder,
    needsPermission,
    profileChoices,
    pendingFolder,
    folderInput,
    connectFolder,
    applyFolder,
  };
}
