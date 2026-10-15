import { useEffect, useState } from "react";
import {
  Cross2Icon,
  CopyIcon,
  DownloadIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import Dialog from "../components/Dialog.jsx";
import { cosmetic } from "./model.js";
import { slots, setupTitle } from "./appearance.js";
import AppearanceChoice from "./AppearanceChoice.jsx";
import LivePresetPreview from "./LivePresetPreview.jsx";
import PresetPreview from "./PresetPreview.jsx";

export default function PresetEditor({
  preset,
  presets,
  busy,
  canSave = true,
  canSavePreset = canSave,
  saveToRunningGame = false,
  gameRunning = false,
  onClose,
  onSave,
  onExport,
  onChange,
  onDirty,
  appearance,
  loadImage,
  renderPreview,
  loadModel,
  position = 0,
  browser = false,
}) {
  const [value, setValue] = useState(() => cosmetic(preset.data));
  const [version, setVersion] = useState("modded");
  const [category, setCategory] = useState(0);
  const [sticker, setSticker] = useState(0);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(value) !== JSON.stringify(preset.data);
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);
  const modded = version === "modded";
  const changed =
    slots.some(
      ([, , f]) =>
        value[modded ? `${f}_Modded` : f] !==
        preset.data[modded ? `${f}_Modded` : f],
    ) ||
    JSON.stringify(value.stickersData) !==
      JSON.stringify(preset.data.stickersData) ||
    (appearance?.staleViews
      ? appearance.staleViews[preset.id]?.includes(version)
      : appearance?.stalePreviews?.includes(preset.id));
  function close() {
    if (
      !busy &&
      (!dirty || window.confirm("Discard the unsaved preset changes?"))
    )
      onClose();
  }
  async function act(action) {
    setError("");
    try {
      if (await action()) onClose();
      else
        setError(
          "Changes were not saved. Check that the game is closed and the save is current. Your draft is still here.",
        );
    } catch (err) {
      setError(err.message);
    }
  }
  const [label, kind, baseField] = slots[category] || [
    "Sticker",
    "stickers",
    "iStickerMaterialID",
  ];
  const field = modded ? `${baseField}_Modded` : baseField;
  const modelId = category < 3 ? value[field] : null;
  const modelAvailable =
    category < 3 && appearance?.models?.[kind]?.includes(modelId);
  return (
    <Dialog
      className="preset-dialog editor-shell customization-dialog"
      aria-label={`Edit ${setupTitle(preset, appearance, position)}`}
      onClose={close}
      dismissDisabled={busy}
    >
      <header className="detail-heading editor-header">
        <div>
          <span className="eyebrow">Your customization</span>
          <h2>{setupTitle(preset, appearance, position)}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close preset"
          onClick={close}
          disabled={busy}
        >
          <Cross2Icon />
        </button>
      </header>
      <div className="editor-body customization-layout">
        <aside className="setup-inspector">
          <LivePresetPreview
            data={value}
            view={version}
            source={appearance?.previews?.[preset.id]?.[version]}
            changed={changed}
            loadImage={loadImage}
            renderPreview={renderPreview}
            loadModel={loadModel}
            modelKind={kind}
            modelId={modelId}
            modelAvailable={modelAvailable}
          />
          <div className="tabs" aria-label="Customization version">
            {["modded", "original"].map((view) => (
              <button
                key={view}
                className={version === view ? "active" : ""}
                aria-pressed={version === view}
                onClick={() => setVersion(view)}
              >
                {view === "modded" ? "Modded" : "Original"}
              </button>
            ))}
          </div>
          <p className="hint">
            {modded
              ? "Edit your installed modded appearances."
              : "Edit the originals other players see without your mods."}{" "}
            Choose which version to use inside the game.
          </p>
          <div className="setup-components">
            {slots.map(([title, k, f], i) => {
              const id = value[modded ? `${f}_Modded` : f];
              const info = appearance?.items?.[k]?.[id];
              return (
                <button
                  key={k}
                  className={category === i ? "selected" : ""}
                  onClick={() => setCategory(i)}
                >
                  <PresetPreview
                    source={info?.image}
                    loadImage={loadImage}
                    alt={info?.label || title}
                  />
                  <span>
                    <small>{title}</small>
                    <strong>{info?.label || "Saved appearance"}</strong>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
        <section className="customization-picker">
          <div className="tabs category-tabs" aria-label="Appearance category">
            {["Character", "Vehicle", "Wheels", "Stickers"].map((title, i) => (
              <button
                key={title}
                className={category === i ? "active" : ""}
                aria-pressed={category === i}
                onClick={() => setCategory(i)}
              >
                {title}
              </button>
            ))}
          </div>
          {category === 3 && (
            <>
              <div
                className="sticker-slots"
                role="group"
                aria-label="Sticker slots"
              >
                {value.stickersData.map((_, i) => (
                  <button
                    key={i}
                    aria-pressed={sticker === i}
                    className={sticker === i ? "selected" : ""}
                    onClick={() => setSticker(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <p className="hint">
                Sticker slot {sticker + 1}. Placement is preserved; adjust
                positioning in the game.
              </p>
            </>
          )}
          {browser && (
            <p className="hint">
              The browser can reuse appearances found in your saved presets. The
              desktop edition reads the full installed cosmetic library.
            </p>
          )}
          {!canSave && !busy && (
            <p className="notice">
              {gameRunning && saveToRunningGame
                ? "You can save this preset through the running game. Group and collection changes still need the game closed."
                : gameRunning
                  ? "Install and enable the optional Garage companion to save one preset while the game is running. Other changes need the game closed."
                  : "Connect Steam and resolve the profile status to save changes. You can still preview unsaved selections."}
            </p>
          )}
          <fieldset disabled={busy} className="preset-fields">
            <AppearanceChoice
              key={`${field}-${category === 3 ? sticker : category}`}
              label={label}
              kind={kind}
              field={field}
              data={category === 3 ? value.stickersData[sticker] : value}
              presets={presets}
              appearance={appearance}
              loadImage={loadImage}
              onChange={(id) =>
                setValue(
                  category === 3
                    ? {
                        ...value,
                        stickersData: value.stickersData.map((s, i) =>
                          i === sticker ? { ...s, [field]: id } : s,
                        ),
                      }
                    : { ...value, [field]: id },
                )
              }
            />
          </fieldset>
        </section>
      </div>
      <footer className="editor-footer">
        {error && (
          <p className="editor-error" role="alert">
            {error}
          </p>
        )}
        <div className="editor-footer-actions">
          <div className="preset-actions">
            <button disabled={busy || dirty} onClick={onExport}>
              <DownloadIcon />
              Export preset
            </button>
            <button
              disabled={busy || dirty || !canSave}
              onClick={() =>
                act(() => onChange({ mode: "duplicate", presetId: preset.id }))
              }
            >
              <CopyIcon />
              Duplicate
            </button>
            <button
              disabled={busy || dirty || !canSave}
              onClick={() =>
                window.confirm(
                  "Delete this setup from the save and its groups?",
                ) &&
                act(() => onChange({ mode: "delete", presetId: preset.id }))
              }
            >
              <TrashIcon />
              Delete
            </button>
          </div>
          <div className="preset-actions">
            <span className="hint" role="status">
              {busy ? "Saving…" : dirty ? "Unsaved changes" : "No changes"}
            </span>
            <button
              disabled={busy || !dirty}
              onClick={() => {
                setValue(cosmetic(preset.data));
                setError("");
              }}
            >
              Discard
            </button>
            <button
              className="primary"
              disabled={busy || !canSavePreset || !dirty}
              onClick={() => act(() => onSave(value))}
            >
              {browser
                ? "Apply to edited save"
                : saveToRunningGame
                  ? "Save to running game"
                  : "Save changes"}
            </button>
          </div>
        </div>
      </footer>
    </Dialog>
  );
}
