// Track modality before React mounts a dialog, including file-picker callbacks.
let pointer = true;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    () => {
      pointer = true;
    },
    true,
  );
  document.addEventListener(
    "keydown",
    () => {
      pointer = false;
    },
    true,
  );
}
export function dialogMotion() {
  return pointer ? "pointer" : "keyboard";
}
