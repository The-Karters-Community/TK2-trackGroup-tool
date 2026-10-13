import { useEffect, useState } from "react";
import {
  Cross2Icon,
  CopyIcon,
  DownloadIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import Dialog from "../components/Dialog.jsx";
import { cosmetic, moddedReferences } from "./model.js";

const slots = [
  ["Character", "iCharacterSkinMaterialID"],
  ["Vehicle", "iVehicleMaterialID"],
  ["Wheels", "iWheelMaterialID"],
];

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
}) {
  const [value, setValue] = useState(() => cosmetic(preset.data));
  const [version, setVersion] = useState("original");
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
  function options(key, current, sticker = false) {
    const ids = new Set([current]);
    presets.forEach((p) => {
      if (sticker) p.data.stickersData.forEach((s) => ids.add(s[key]));
      else ids.add(p.data[key]);
    });
    return [...ids]
      .sort((a, b) => a - b)
      .map((id) => (
        <option key={id} value={id}>
          Configuration {id}
        </option>
      ));
  }
  return (
    <Dialog
      className="preset-dialog"
      aria-label={`Edit preset ${preset.id}`}
      onClose={close}
      dismissDisabled={busy}
    >
      <header className="detail-heading">
        <div>
          <span className="eyebrow">Your customization</span>
          <h2>Preset #{preset.id}</h2>
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
      <p className="hint">
        The game stores configuration IDs, without preset names. Choices below
        come from your saved presets; item names and compatibility are not yet
        resolved.
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
        {slots.map(([label, field]) => {
          const key = modded ? `${field}_Modded` : field;
          return (
            <label key={key}>
              {label}
              <select
                value={value[key]}
                onChange={(e) =>
                  setValue({ ...value, [key]: Number(e.target.value) })
                }
              >
                {options(key, value[key])}
              </select>
            </label>
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
                <label key={i}>
                  Slot {i + 1}
                  <select
                    value={s[key]}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        stickersData: value.stickersData.map((v, j) =>
                          j === i ? { ...v, [key]: Number(e.target.value) } : v,
                        ),
                      })
                    }
                  >
                    {options(key, s[key], true)}
                  </select>
                </label>
              );
            })}
          </div>
          <p className="hint">
            Packed placement settings are preserved. Adjust sticker placement in
            the game.
          </p>
        </details>
      </fieldset>
      {refs.length > 0 && (
        <p className="notice">
          This preset references {new Set(refs).size} distinct modded
          configurations. Installation status is unverified; the tool does not
          subscribe or bundle cosmetic assets.
        </p>
      )}
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
                `Delete preset #${preset.id} from the save and its groups?`,
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
