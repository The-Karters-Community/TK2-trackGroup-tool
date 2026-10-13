import { useEffect, useState } from "react";
import {
  Cross2Icon,
  CopyIcon,
  DownloadIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import Dialog from "../components/Dialog.jsx";
import { cosmetic, moddedReferences } from "./model.js";
import { slots, setupTitle } from "./appearance.js";
import AppearanceChoice from "./AppearanceChoice.jsx";
import PresetPreview from "./PresetPreview.jsx";

export default function PresetEditor({
  preset,
  presets,
  busy,
  canSave = true,
  onClose,
  onSave,
  onExport,
  onChange,
  onDirty,
  appearance,
  loadImage,
  position = 0,
}) {
  const [value, setValue] = useState(() => cosmetic(preset.data));
  const [version, setVersion] = useState("modded");
  const dirty = JSON.stringify(value) !== JSON.stringify(preset.data);
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);
  const modded = version === "modded";
  const refs = moddedReferences(value);
  function close() {
    if (
      !busy &&
      (!dirty || window.confirm("Discard the unsaved preset changes?"))
    )
      onClose();
  }
  return (
    <Dialog
      className="preset-dialog"
      aria-label={`Edit ${setupTitle(preset, appearance, position)}`}
      onClose={close}
      dismissDisabled={busy}
    >
      <header className="detail-heading">
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
      <PresetPreview
        className="preset-hero"
        source={appearance?.previews?.[preset.id]?.[version]}
        loadImage={loadImage}
        alt="Saved in-game setup preview"
      />
      <p className="hint">
        {dirty
          ? "Saved preview - the game redraws the full setup after you load it. Appearance thumbnails below show your selected variants."
          : "Your saved in-game preview. Choose an appearance below."}
      </p>
      <div className="tabs" aria-label="Customization version">
        <button
          className={!modded ? "active" : ""}
          onClick={() => setVersion("original")}
        >
          Original
        </button>
        <button
          className={modded ? "active" : ""}
          onClick={() => setVersion("modded")}
        >
          Modded
        </button>
      </div>
      <p className="hint">
        {modded
          ? "Matching Workshop or local-only assets must be installed."
          : "Players without your mods see these original selections."}
      </p>
      <fieldset disabled={busy || !canSave} className="preset-fields">
        {slots.map(([label, kind, field]) => {
          const key = modded ? `${field}_Modded` : field;
          return (
            <AppearanceChoice
              key={key}
              label={label}
              kind={kind}
              field={key}
              data={value}
              presets={presets}
              appearance={appearance}
              loadImage={loadImage}
              onChange={(id) => setValue({ ...value, [key]: id })}
            />
          );
        })}
        <label className="check-label">
          <input
            type="checkbox"
            checked={value.bUsingModdedVersion}
            onChange={(e) =>
              setValue({ ...value, bUsingModdedVersion: e.target.checked })
            }
          />
          Use modded view in the game
        </label>
        <details>
          <summary>Stickers · 20 slots</summary>
          <div className="sticker-grid">
            {value.stickersData.map((s, i) => {
              const key = modded
                ? "iStickerMaterialID_Modded"
                : "iStickerMaterialID";
              return (
                <AppearanceChoice
                  key={i}
                  label={`Sticker slot ${i + 1}`}
                  kind="stickers"
                  field={key}
                  data={s}
                  presets={presets}
                  appearance={appearance}
                  loadImage={loadImage}
                  onChange={(id) =>
                    setValue({
                      ...value,
                      stickersData: value.stickersData.map((v, j) =>
                        j === i ? { ...v, [key]: id } : v,
                      ),
                    })
                  }
                />
              );
            })}
          </div>
          <p className="hint">
            Packed placement settings are preserved. Adjust sticker placement in
            the game.
          </p>
        </details>
      </fieldset>
      <details className="preset-technical">
        <summary>Technical details</summary>
        <p className="hint">
          Game preset ID: {preset.id}. IDs are internal references, not item
          names. {new Set(refs).size} modded appearance references. Workshop
          installation is unverified.
        </p>
      </details>
      <div className="preset-save-slot">
        {dirty && (
          <>
            <button
              disabled={busy}
              onClick={() => setValue(cosmetic(preset.data))}
            >
              Discard
            </button>
            <button
              className="primary"
              disabled={busy || !canSave}
              onClick={async () => {
                if (await onSave(value)) onClose();
              }}
            >
              Save changes
            </button>
          </>
        )}
      </div>
      <footer className="preset-actions">
        <button disabled={busy || dirty} onClick={onExport}>
          <DownloadIcon />
          Export preset
        </button>
        <button
          disabled={busy || dirty || !canSave}
          onClick={async () => {
            if (await onChange({ mode: "duplicate", presetId: preset.id }))
              onClose();
          }}
        >
          <CopyIcon />
          Duplicate
        </button>
        <button
          disabled={busy || dirty || !canSave}
          onClick={async () => {
            if (
              window.confirm(
                "Delete this setup from the save and its groups?",
              ) &&
              (await onChange({ mode: "delete", presetId: preset.id }))
            )
              onClose();
          }}
        >
          <TrashIcon />
          Delete
        </button>
      </footer>
    </Dialog>
  );
}
